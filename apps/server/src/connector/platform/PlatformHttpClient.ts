import type {
  PageEnvelope, BotRunRecord, RuntimeHealthCollection, MarketServiceHealthSnapshot,
  SourceCoverageSnapshot, ExecutionHealthSnapshot, OpsCapabilityDescriptor,
} from './platformDtos';

export interface OfficeUpstreamError extends Error {
  office: { code: 'upstream_unavailable' | 'upstream_unauthorized' | 'upstream_bad_request'; message: string };
}

const upstream = (
  code: OfficeUpstreamError['office']['code'],
  message: string,
): OfficeUpstreamError => Object.assign(new Error(message), { office: { code, message } }) as OfficeUpstreamError;

export interface PlatformHttpClientDeps {
  readUrl: string;
  readToken: string;
  requestTimeoutMs: number;
  fetchImpl?: typeof fetch;
}

export class PlatformHttpClient {
  private readonly fetchImpl: typeof fetch;
  constructor(private readonly deps: PlatformHttpClientDeps) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
  }

  getRuns(mode: 'live' | 'paper'): Promise<PageEnvelope<BotRunRecord>> {
    return this.getJson(`/ops/runs?mode=${mode}`);
  }
  getRuntimeHealth(): Promise<RuntimeHealthCollection> {
    return this.getJson('/ops/health/runtime');
  }
  getMarketHealth(): Promise<MarketServiceHealthSnapshot> {
    return this.getJson('/ops/health/market');
  }
  getExecutionHealth(): Promise<ExecutionHealthSnapshot> {
    return this.getJson('/ops/health/execution');
  }
  getCoverage(): Promise<SourceCoverageSnapshot> {
    return this.getJson('/ops/coverage');
  }
  getDiscover(): Promise<OpsCapabilityDescriptor> {
    return this.getJson('/ops/discover');
  }

  private async getJson<T>(path: string): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.deps.requestTimeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.deps.readUrl}${path}`, {
        headers: { accept: 'application/json', authorization: `Bearer ${this.deps.readToken}` },
        signal: ctrl.signal,
      });
    } catch (e) {
      throw upstream('upstream_unavailable', `platform read request failed: ${(e as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401 || res.status === 403) {
      throw upstream('upstream_unauthorized', `platform read returned ${res.status}`);
    }
    if (res.status >= 500) {
      throw upstream('upstream_unavailable', `platform read returned ${res.status}`);
    }
    if (res.status >= 400) {
      throw upstream('upstream_bad_request', `platform read returned ${res.status}`);
    }
    return (await res.json()) as T;
  }
}
