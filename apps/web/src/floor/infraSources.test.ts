import { describe, it, expect } from 'vitest';
import { sourceState, isGap } from './infraSources';

const infra = { services: [], queues: [], lastSync: 'x', sources: [{ domain: 'knowledge', state: 'gap', detail: 'd' }] } as never;

describe('infra source helpers', () => {
  it('reads a domain state and detects gap', () => {
    expect(sourceState(infra, 'knowledge')).toBe('gap');
    expect(isGap(sourceState(infra, 'knowledge'))).toBe(true);
    expect(isGap(sourceState(infra, 'office-server'))).toBe(false);
  });
});
