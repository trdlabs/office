import type { BotHealth } from '@trading-office/office-gateway';
import type { BotRunRecord } from './platformDtos';

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
