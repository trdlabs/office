import { describe, it, expect } from 'vitest';
import { isNoiseEventType } from './summaryFilter';

describe('isNoiseEventType', () => {
  it('flags orchestration/meta + dedupe/reuse plumbing as noise', () => {
    expect(isNoiseEventType('chat.intent_classifier.started')).toBe(true);
    expect(isNoiseEventType('chat.task_created')).toBe(true);
    expect(isNoiseEventType('chat.plan.advanced')).toBe(true);
    expect(isNoiseEventType('hypothesis.deduped')).toBe(true);
    expect(isNoiseEventType('backtest.reused')).toBe(true);
    expect(isNoiseEventType('artifact.stored')).toBe(true);
  });
  it('passes real progress events through', () => {
    expect(isNoiseEventType('research.run_cycle.started')).toBe(false);
    expect(isNoiseEventType('strategy_analyst.completed')).toBe(false);
    expect(isNoiseEventType('hypothesis.validated')).toBe(false);
  });
});
