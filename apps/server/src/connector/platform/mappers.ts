import type { BotHealth, InfraSourceState } from '@trading-office/office-gateway';
import type { BotRunRecord, PlatformAvailability, PlatformHealthStatus, RuntimeHealthCollection, MarketServiceHealthSnapshot, ExecutionHealthSnapshot, SourceCoverageSnapshot } from './platformDtos';

export function formatDuration(ms: number): string {
  const t = ms < 0 ? 0 : ms;
  const s = Math.floor(t / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}
export function formatAgo(ms: number): string { return `${formatDuration(ms)} ago`; }

export function mapRunState(status: BotRunRecord['status']): BotHealth['state'] {
  if (status === 'running') return 'running';
  if (status === 'finished') return 'paused';
  return 'error'; // crashed | aborted
}

export function mapRun(r: BotRunRecord, nowMs: number): BotHealth {
  const end = r.status === 'finished' && r.finishedAtMs != null ? r.finishedAtMs : nowMs;
  return {
    id: r.runId,
    name: r.strategy.name,
    state: mapRunState(r.status),
    uptime: formatDuration(end - r.startedAtMs),
    lastHeartbeat: formatAgo(nowMs - r.lastSeenMs),
  };
}

// ── Infra health mappers ────────────────────────────────────────────────────

export function mapInfraState(availability: PlatformAvailability, status: PlatformHealthStatus): InfraSourceState {
  if (availability === 'unavailable') return 'gap';
  if (availability === 'degraded') return 'degraded';
  // availability === 'available'
  if (status === 'down') return 'error';
  if (status === 'degraded') return 'degraded';
  return 'live';
}

const RANK: Record<InfraSourceState, number> = { error: 4, gap: 3, degraded: 2, live: 1, fixture: 0 };
export function worstState(states: InfraSourceState[]): InfraSourceState {
  if (states.length === 0) return 'gap';
  return states.reduce((w, s) => (RANK[s] > RANK[w] ? s : w), 'fixture' as InfraSourceState);
}

export function mapRuntimeCollection(c: RuntimeHealthCollection): InfraSourceState {
  if (c.entries.length === 0) return 'gap';
  return worstState(c.entries.map((e) => mapInfraState(e.availability, e.status)));
}

export function mapMarket(m: MarketServiceHealthSnapshot): InfraSourceState { return mapInfraState(m.availability, m.status); }
export function mapExecution(e: ExecutionHealthSnapshot): InfraSourceState { return mapInfraState(e.availability, e.status); }

export function mapCoverage(c: SourceCoverageSnapshot): InfraSourceState {
  if (c.availability === 'unavailable') return 'gap';
  if (c.availability === 'degraded') return 'degraded';
  if (c.entries.length === 0 || c.entries.every((e) => e.state === 'unsupported')) return 'gap';
  if (c.entries.some((e) => e.state === 'missing' || e.state === 'stale')) return 'degraded';
  return 'live';
}
