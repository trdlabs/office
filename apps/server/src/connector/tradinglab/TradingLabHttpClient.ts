import type {
  LabAgentSummary, LabAgentActivity, LabAgentEvent, LabHypothesisListItem, LabBacktest,
  LabCursorEnvelope, LabPageEnvelope, LabHealth, LabReady, LabAuthz, LabCompletionSummary,
} from './labDtos';
import type { LabReadReasonCode } from './labReadSource';

export interface OfficeUpstreamError extends Error {
  office: {
    code: 'upstream_unavailable' | 'upstream_unauthorized' | 'upstream_bad_request';
    message: string;
    /**
     * Granular, operator-facing failure taxonomy. `code` stays coarse so the
     * auth-aware health probe (InfraAggregator) keeps keying off it unchanged.
     */
    reason?: LabReadReasonCode;
  };
}

const upstream = (
  code: OfficeUpstreamError['office']['code'],
  message: string,
  reason?: LabReadReasonCode,
): OfficeUpstreamError => Object.assign(new Error(message), { office: { code, message, reason } }) as OfficeUpstreamError;

export interface TradingLabHttpClientDeps {
  readUrl: string;
  readToken: string;
  requestTimeoutMs: number;
  fetchImpl?: typeof fetch;
}

export class TradingLabHttpClient {
  private readonly fetchImpl: typeof fetch;
  constructor(private readonly deps: TradingLabHttpClientDeps) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
  }

  getAgents(): Promise<LabCursorEnvelope<LabAgentSummary>> {
    return this.getJson('/v1/agents', true);
  }
  getAgent(agentId: string): Promise<LabAgentActivity> {
    return this.getJson(`/v1/agents/${encodeURIComponent(agentId)}`, true);
  }
  getHypotheses(): Promise<LabPageEnvelope<LabHypothesisListItem>> {
    return this.getJson('/v1/hypotheses', true);
  }
  getBacktests(): Promise<LabPageEnvelope<LabBacktest>> {
    return this.getJson('/v1/backtests', true);
  }
  getAgentEvents(query: Record<string, string>): Promise<LabPageEnvelope<LabAgentEvent>> {
    const qs = new URLSearchParams(query).toString();
    return this.getJson(`/v1/agent-events${qs ? `?${qs}` : ''}`, true);
  }
  getHealthz(): Promise<LabHealth> {
    return this.getJson('/healthz', false);
  }
  getReadyz(): Promise<LabReady> {
    return this.getJson('/readyz', false);
  }
  // Credential-gated probe: sends the read token (auth=true). A 401 → upstream_unauthorized,
  // letting callers tell "token rejected" apart from "process not ready" (open /readyz).
  getAuthz(): Promise<LabAuthz> {
    return this.getJson('/v1/authz', true);
  }

  /** Domain completion summary for a completed task. Returns null when the lab has no summary for it
   *  (404) or the read is otherwise unavailable — the caller falls back to its prior reply. */
  async getCompletionSummary(taskId: string): Promise<LabCompletionSummary | null> {
    try {
      return await this.getJson<LabCompletionSummary>(`/v1/tasks/${encodeURIComponent(taskId)}/completion-summary`, true);
    } catch {
      return null; // OfficeUpstreamError (404/bad_request/unavailable) → degrade to the prior reply
    }
  }

  private async getJson<T>(path: string, auth: boolean): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (auth) headers.Authorization = `Bearer ${this.deps.readToken}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.deps.requestTimeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.deps.readUrl}${path}`, { headers, signal: ctrl.signal });
    } catch (e) {
      // Client timeout aborts the fetch with an AbortError; anything else is a
      // connect/DNS failure. We classify on the error shape, not its text, and
      // never surface the raw message to the operator.
      const timedOut = (e as Error)?.name === 'AbortError';
      throw upstream(
        'upstream_unavailable',
        `trading-lab read request failed: ${(e as Error).message}`,
        timedOut ? 'upstream_timeout' : 'upstream_unreachable',
      );
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401 || res.status === 403) {
      throw upstream('upstream_unauthorized', `trading-lab read returned ${res.status}`, 'auth_failed');
    }
    if (res.status >= 500) {
      throw upstream('upstream_unavailable', `trading-lab read returned ${res.status}`, 'upstream_5xx');
    }
    if (res.status >= 400) {
      throw upstream('upstream_bad_request', `trading-lab read returned ${res.status}`, 'upstream_error');
    }
    try {
      return (await res.json()) as T;
    } catch {
      throw upstream('upstream_unavailable', 'trading-lab read returned a malformed response', 'upstream_bad_response');
    }
  }
}
