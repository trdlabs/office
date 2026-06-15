import { describe, it, expect } from 'vitest';
import { mapInfraState, worstState, mapRuntimeCollection, mapMarket, mapExecution, mapCoverage } from './mappers';

describe('infra mappers', () => {
  it('availability × status → office state', () => {
    expect(mapInfraState('available', 'ok')).toBe('live');
    expect(mapInfraState('available', 'degraded')).toBe('degraded');
    expect(mapInfraState('available', 'down')).toBe('error');
    expect(mapInfraState('degraded', 'ok')).toBe('degraded');
    expect(mapInfraState('unavailable', 'down')).toBe('gap');
  });
  it('worst-of: error > gap > degraded > live', () => {
    expect(worstState(['live', 'degraded', 'gap'])).toBe('gap');
    expect(worstState(['live', 'error', 'gap'])).toBe('error');
    expect(worstState(['live', 'live'])).toBe('live');
    expect(worstState(['fixture'])).toBe('fixture');
    expect(worstState([])).toBe('gap');
  });
  it('runtime collection: worst-of entries; empty → gap', () => {
    expect(mapRuntimeCollection({ entries: [{ source: 'long_oi', status: 'ok', indicators: {} as any, availability: 'available', capturedAtMs: 0 }, { source: 'short_oi', status: 'down', indicators: {} as any, availability: 'available', capturedAtMs: 0 }], asOf: 0 })).toBe('error');
    expect(mapRuntimeCollection({ entries: [], asOf: 0 })).toBe('gap');
  });
  it('market unavailable → gap (default until persistence)', () => {
    expect(mapMarket({ status: 'down', diagnostics: {}, streamAgeMs: null, availability: 'unavailable', asOf: 0 })).toBe('gap');
    expect(mapMarket({ status: 'ok', diagnostics: {}, streamAgeMs: 10, availability: 'available', asOf: 0 })).toBe('live');
  });
  it('execution idle (unavailable) → gap; active ok → live', () => {
    expect(mapExecution({ status: 'down', recentCounts: {}, lastEventMs: null, availability: 'unavailable', asOf: 0 })).toBe('gap');
    expect(mapExecution({ status: 'ok', recentCounts: { execution_filled: 3 }, lastEventMs: 1, availability: 'available', asOf: 0 })).toBe('live');
  });
  it('coverage: unavailable→gap; missing/stale→degraded; present→live', () => {
    expect(mapCoverage({ entries: [], availability: 'unavailable', asOf: 0 })).toBe('gap');
    expect(mapCoverage({ entries: [{ source: 'b', kind: 'taker', state: 'stale', freshnessAgeMs: 9 }], availability: 'available', asOf: 0 })).toBe('degraded');
    expect(mapCoverage({ entries: [{ source: 'b', kind: 'taker', state: 'present', freshnessAgeMs: 1 }], availability: 'available', asOf: 0 })).toBe('live');
  });
});
