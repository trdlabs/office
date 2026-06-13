import { describe, expect, it } from 'vitest';
import {
  agentActivitySchema,
  backtestSummarySchema,
  infraStatusSchema,
  operatorMessageSchema,
  operatorMessageAcceptedSchema,
  officeErrorBodySchema,
  officeEventSchema,
} from './schemas';

describe('contract schemas round-trip', () => {
  it('accepts a valid AgentActivity', () => {
    const v = {
      agentId: 'researcher',
      status: 'thinking',
      currentTask: 'sweeping windows',
      logs: [{ ts: '09:41', level: 'info', text: 'go' }],
    };
    expect(agentActivitySchema.parse(v)).toEqual(v);
  });

  it('rejects a malformed BacktestSummary (missing sharpe)', () => {
    const bad = { id: 'b1', strategy: 's', symbol: 'BTCUSDT', period: 'Q4', pnlPct: 1, winRatePct: 50, maxDrawdownPct: 5 };
    expect(() => backtestSummarySchema.parse(bad)).toThrow();
  });

  it('accepts a valid InfraStatus', () => {
    const v = { services: [{ name: 'x', up: true, detail: 'ok' }], queues: [{ name: 'q', depth: 0 }], lastSync: '09:41' };
    expect(infraStatusSchema.parse(v)).toEqual(v);
  });

  it('round-trips an OperatorMessage and its accepted response', () => {
    const msg = { text: 'status?', source: 'web', target: 'orchestrator', floorId: 'trading-lab' };
    expect(operatorMessageSchema.parse(msg)).toEqual(msg);
    const acc = { operatorMessageId: 'm1', conversationId: 'c1', status: 'accepted' };
    expect(operatorMessageAcceptedSchema.parse(acc)).toEqual(acc);
  });

  it('rejects an OperatorMessage with a non-web source it does not know', () => {
    expect(() => operatorMessageSchema.parse({ text: 'x', source: 'sms', target: 'orchestrator', floorId: 'trading-lab' })).toThrow();
  });

  it('shapes an error body', () => {
    const e = { error: { code: 'not_found', message: 'no such agent' } };
    expect(officeErrorBodySchema.parse(e)).toEqual(e);
  });
});

describe('OfficeEvent schema', () => {
  it('accepts a heartbeat event', () => {
    const e = { type: 'heartbeat', ts: '2024-01-01T00:00:00Z' };
    expect(officeEventSchema.parse(e)).toEqual(e);
  });

  it('accepts an agent_status_changed event', () => {
    const e = { type: 'agent_status_changed', ts: '2024-01-01T00:00:00Z', agentId: 'researcher', status: 'thinking' };
    expect(officeEventSchema.parse(e)).toEqual(e);
  });

  it('rejects an event with an unknown type', () => {
    expect(() => officeEventSchema.parse({ type: 'unknown_event', ts: '2024-01-01T00:00:00Z' })).toThrow();
  });
});
