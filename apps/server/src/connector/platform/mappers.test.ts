import { describe, it, expect } from 'vitest';
import { mapRun, mapRunState, formatDuration, formatAgo } from './mappers';
import type { BotRunRecord } from './platformDtos';

const base: BotRunRecord = { runId: 'r1', mode: 'live', status: 'running', strategy: { name: 'mr-funding', version: '1' }, startedAtMs: 0, finishedAtMs: null, lastSeenMs: 0, symbols: [] };

describe('bot-run mappers', () => {
  it('maps status → office state', () => {
    expect(mapRunState('running')).toBe('running');
    expect(mapRunState('crashed')).toBe('error');
    expect(mapRunState('aborted')).toBe('error');
    expect(mapRunState('finished')).toBe('paused');
  });
  it('formats duration + ago', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(90_000)).toBe('1m');
    expect(formatDuration(5 * 3_600_000)).toBe('5h 0m');
    expect(formatDuration(27 * 3_600_000)).toBe('1d 3h');
    expect(formatAgo(2_000)).toBe('2s ago');
  });
  it('maps a running run to BotHealth (uptime from now-startedAt, heartbeat from lastSeen)', () => {
    const now = 3_600_000; // 1h
    const r = mapRun({ ...base, startedAtMs: 0, lastSeenMs: now - 2_000 }, now);
    expect(r).toEqual({ id: 'r1', name: 'mr-funding', state: 'running', uptime: '1h 0m', lastHeartbeat: '2s ago' });
  });
  it('finished run uptime uses finishedAt-startedAt; state paused', () => {
    const r = mapRun({ ...base, status: 'finished', startedAtMs: 0, finishedAtMs: 60_000, lastSeenMs: 0 }, 10_000_000);
    expect(r.state).toBe('paused');
    expect(r.uptime).toBe('1m');
  });
});
