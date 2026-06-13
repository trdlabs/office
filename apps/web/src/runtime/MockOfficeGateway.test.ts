import { describe, expect, it } from 'vitest';
import { MockOfficeGateway } from './MockOfficeGateway';

const gw = new MockOfficeGateway({ latencyMs: 0 });

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

  it('sendBossCommand returns an assistant message and is inert', async () => {
    const msg = await gw.sendBossCommand('pause all bots');
    expect(msg.role).toBe('assistant');
    expect(msg.text.toLowerCase()).toContain('no execution authority');
  });

  it('subscribeAgentStatuses can be unsubscribed', () => {
    const off = gw.subscribeAgentStatuses(() => {});
    expect(typeof off).toBe('function');
    off();
  });
});
