// Hand-mirrored from trading-platform/src/operations/dto.ts (035, merged). NO cross-repo import.
export type PlatformAvailability = 'available' | 'degraded' | 'unavailable';
export type PlatformHealthStatus = 'ok' | 'degraded' | 'down';
export type PlatformCoverageState = 'present' | 'missing' | 'stale' | 'unsupported';

export interface PageEnvelope<T> {
  items: T[];
  nextCursor: string | null;
  asOf: number;
  window?: unknown;
  freshness?: unknown;
}
export interface BotRunRecord {
  runId: string;
  mode: 'live' | 'paper' | 'backtest';
  status: 'running' | 'finished' | 'crashed' | 'aborted';
  strategy: { name: string; version: string };
  startedAtMs: number;
  finishedAtMs: number | null;
  lastSeenMs: number;
  symbols: string[];
}
export interface RuntimeHealthIndicators { ready: boolean; freshnessOk: boolean; pipelineOk: boolean; serviceOk: boolean; botOk: boolean; }
export interface RuntimeHealthEntry { source: string; status: PlatformHealthStatus; indicators: RuntimeHealthIndicators; availability: PlatformAvailability; capturedAtMs: number; }
export interface RuntimeHealthCollection { entries: RuntimeHealthEntry[]; asOf: number; }
export interface MarketServiceHealthSnapshot { status: PlatformHealthStatus; diagnostics: Record<string, unknown>; streamAgeMs: number | null; availability: PlatformAvailability; asOf: number; }
export interface SourceCoverageEntry { source: string; kind: string; state: PlatformCoverageState; freshnessAgeMs: number | null; }
export interface SourceCoverageSnapshot { entries: SourceCoverageEntry[]; availability: PlatformAvailability; asOf: number; }
export interface ExecutionHealthSnapshot { status: PlatformHealthStatus; recentCounts: Record<string, number>; lastEventMs: number | null; availability: PlatformAvailability; asOf: number; }
export interface OpsCapabilityDescriptor {
  opsContractVersion: string;
  capabilities: { readOnly: boolean; execution: boolean; credentials: boolean; ingestion: boolean; mutation: boolean };
  resources: { name: string; supportedFilters: string[]; pagination: unknown; fields: string[]; availability?: PlatformAvailability | 'unsupported' }[];
}
