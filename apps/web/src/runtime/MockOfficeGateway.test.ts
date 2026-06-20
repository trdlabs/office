import { describe, expect, it, vi, afterEach } from 'vitest';
import type { OfficeEvent } from '@trading-office/office-gateway';
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

  it('confirmAction emits accepted + completed and returns accepted', async () => {
    const gw = new MockOfficeGateway({ latencyMs: 0 });
    const events: OfficeEvent[] = [];
    gw.subscribeOfficeEvents((e) => events.push(e));
    const accepted = await gw.confirmAction({ pendingInteractionId: 'p1', sessionId: 's1', decision: 'confirm' });
    await new Promise((r) => setTimeout(r, 80));
    const completed = events.find((e) => e.type === 'operator_message_completed');
    expect(accepted.status).toBe('accepted');
    expect(completed && completed.type === 'operator_message_completed' && completed.operatorMessageId).toBe(accepted.operatorMessageId);
    const acceptedEvent = events.find((e) => e.type === 'operator_message_accepted');
    expect(acceptedEvent && acceptedEvent.type === 'operator_message_accepted' && acceptedEvent.operatorMessageId).toBe(accepted.operatorMessageId);
  });

  it('subscribeOfficeEvents emits an initial snapshot and can be unsubscribed', () => {
    const types: string[] = [];
    const off = gw.subscribeOfficeEvents((e) => types.push(e.type));
    expect(types[0]).toBe('agent_statuses_snapshot');
    expect(typeof off).toBe('function');
    off();
  });
});
