import { describe, it, expect } from 'vitest';
import { successTypesFor, isFailureType } from './terminalTaxonomy';

describe('terminal taxonomy', () => {
  it('returns success types by task prefix (empty for unknown → degrade)', () => {
    expect(successTypesFor('research.run_cycle')).toContain('research.run_cycle.completed');
    expect(successTypesFor('strategy.onboard')).toContain('strategy_analyst.completed');
    expect(successTypesFor('totally.unknown')).toEqual([]);
  });
  it('strategy.onboard dedup: successTypes includes deduped event and isFailureType returns false for it', () => {
    expect(successTypesFor('strategy.onboard')).toContain('strategy.onboard.deduped');
    expect(successTypesFor('strategy.onboard')).toContain('strategy_analyst.completed');
    expect(isFailureType('strategy.onboard.deduped')).toBe(false);
  });
  it('detects failure by suffix + plan-advance-failed', () => {
    expect(isFailureType('builder.failed')).toBe(true);
    expect(isFailureType('strategy.onboard.rejected')).toBe(true);
    expect(isFailureType('something.error')).toBe(true);
    expect(isFailureType('chat.plan.advance_failed')).toBe(true);
    expect(isFailureType('research.run_cycle.completed')).toBe(false);
  });
});
