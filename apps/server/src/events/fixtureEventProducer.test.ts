import { describe, it, expect, vi, afterEach } from 'vitest';
import type { OfficeEvent } from '@trading-office/office-gateway';
import { STATUS_POOLS } from '@trading-office/office-fixtures';
import { createFixtureEventProducer } from './fixtureEventProducer';

afterEach(() => vi.useRealTimers());

describe('createFixtureEventProducer', () => {
  it('emits a status_changed for every pool agent on each tick, and stops cleanly', () => {
    vi.useFakeTimers();
    const events: OfficeEvent[] = [];
    const stop = createFixtureEventProducer((e) => events.push(e), 100);
    vi.advanceTimersByTime(100);
    const changed = events.filter((e) => e.type === 'agent_status_changed');
    expect(changed.length).toBe(Object.keys(STATUS_POOLS).length);
    stop();
    vi.advanceTimersByTime(500);
    expect(events.filter((e) => e.type === 'agent_status_changed').length).toBe(Object.keys(STATUS_POOLS).length);
  });
});
