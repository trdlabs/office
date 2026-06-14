import type {
  LabAgentSummary, LabAgentActivity, LabAgentEvent, LabHypothesisListItem, LabBacktest,
  LabCursorEnvelope, LabPageEnvelope, LabHealth, LabReady,
} from './labDtos';

export interface OfficeUpstreamError extends Error {
  office: { code: 'upstream_unavailable' | 'upstream_unauthorized' | 'upstream_bad_request'; message: string };
}

const upstream = (
  code: OfficeUpstreamError['office']['code'],
  message: string,
): OfficeUpstreamError => Object.assign(new Error(message), { office: { code, message } }) as OfficeUpstreamError;

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

  private async getJson<T>(path: string, auth: boolean): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (auth) headers.Authorization = `Bearer ${this.deps.readToken}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.deps.requestTimeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.deps.readUrl}${path}`, { headers, signal: ctrl.signal });
    } catch (e) {
      throw upstream('upstream_unavailable', `trading-lab read request failed: ${(e as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401 || res.status === 403) {
      throw upstream('upstream_unauthorized', `trading-lab read returned ${res.status}`);
    }
    if (res.status >= 500) {
      throw upstream('upstream_unavailable', `trading-lab read returned ${res.status}`);
    }
    if (res.status >= 400) {
      throw upstream('upstream_bad_request', `trading-lab read returned ${res.status}`);
    }
    return (await res.json()) as T;
  }
}
