import { describe, expect, it, vi, afterEach } from 'vitest';
import { MockOfficeGateway } from './MockOfficeGateway';

const gw = new MockOfficeGateway({ latencyMs: 0 });
afterEach(() => vi.useRealTimers());

describe('MockOfficeGateway', () => {
  it('returns agent activity with logs', async () => {
    const a = await gw.getAgentActivity('researcher');
    expect(a.agentId).toBe('researcher');
    expect(a.logs.length).toBeGreaterThan(0);
  });

  it('returns non-empty backtests with the right shape', async () => {
    const rows = await gw.getBacktests();
    expect(rows.length).toBeGreaterThan(0);
    expect(typeof rows[0]!.sharpe).toBe('number');
  });

  it('sendOperatorMessage is accepted and inert', async () => {
    const acc = await gw.sendOperatorMessage({ text: 'pause all bots', source: 'web', target: 'orchestrator', floorId: 'trading-lab' });
    expect(acc.status).toBe('accepted');
    expect(acc.operatorMessageId).toBeTruthy();
    expect(acc.conversationId).toBeTruthy();
  });

  it('subscribeOfficeEvents emits an initial snapshot and can be unsubscribed', () => {
    const types: string[] = [];
    const off = gw.subscribeOfficeEvents((e) => types.push(e.type));
    expect(types[0]).toBe('agent_statuses_snapshot');
    expect(typeof off).toBe('function');
    off();
  });
});
