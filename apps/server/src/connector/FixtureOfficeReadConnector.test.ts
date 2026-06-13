import { describe, it, expect, vi, afterEach } from 'vitest';
import { INITIAL_STATUSES, BACKTESTS } from '@trading-office/office-fixtures';
import { loadConfig } from '../config';
import { FixtureOfficeReadConnector } from './FixtureOfficeReadConnector';

afterEach(() => vi.useRealTimers());

describe('FixtureOfficeReadConnector', () => {
  it('serves fixture snapshots', async () => {
    const c = new FixtureOfficeReadConnector(loadConfig({}));
    expect(await c.getAgentStatuses()).toEqual(INITIAL_STATUSES);
    expect(await c.getBacktests()).toEqual(BACKTESTS);
    expect((await c.getAgentActivity('researcher')).agentId).toBe('researcher');
  });

  it('start() drives live events and stop() halts them', () => {
    vi.useFakeTimers();
    const c = new FixtureOfficeReadConnector({ ...loadConfig({}), eventTickMs: 50 });
    const types: string[] = [];
    const stop = c.start((e) => types.push(e.type));
    vi.advanceTimersByTime(50);
    expect(types).toContain('agent_status_changed');
    stop();
    const n = types.length;
    vi.advanceTimersByTime(500);
    expect(types.length).toBe(n);
  });
});
