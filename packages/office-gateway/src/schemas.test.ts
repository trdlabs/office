import { describe, expect, it } from 'vitest';
import {
  agentActivitySchema,
  backtestSummarySchema,
  infraStatusSchema,
  operatorMessageSchema,
  operatorMessageAcceptedSchema,
  officeErrorBodySchema,
  officeEventSchema,
  operatorReplySchema,
  operatorConfirmSchema,
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

describe('operator confirm wire', () => {
  it('operatorReplySchema accepts an evidence/actions proposal reply', () => {
    const r = operatorReplySchema.parse({
      replyMessageId: 'r1', operatorMessageId: 'm1', conversationId: 'c1', text: 'proposal', ts: 't',
      evidence: [{ kind: 'exact_duplicate', label: '⚠ точный дубликат', sourceId: 'p1' }],
      actions: [{ id: 'confirm', label: 'Подтвердить', style: 'primary' }],
      pendingInteractionId: 'p1', sessionId: 's1',
    });
    expect(r.actions?.[0]!.id).toBe('confirm');
    expect(r.evidence?.[0]!.sourceId).toBe('p1');
  });

  it('operatorReplySchema still accepts a plain text reply (back-compat)', () => {
    const r = operatorReplySchema.parse({ replyMessageId: 'r', operatorMessageId: 'm', conversationId: 'c', text: 'hi', ts: 't' });
    expect(r.actions).toBeUndefined();
  });

  it('operatorConfirmSchema validates a confirm request', () => {
    const v = operatorConfirmSchema.parse({ pendingInteractionId: 'p1', sessionId: 's1', decision: 'confirm' });
    expect(v.decision).toBe('confirm');
    expect(() => operatorConfirmSchema.parse({ pendingInteractionId: 'p', sessionId: 's', decision: 'maybe' })).toThrow();
  });
});

describe('operator_assistant_message event', () => {
  const valid = {
    type: 'operator_assistant_message',
    ts: '2026-06-22T00:00:00.000Z',
    operatorMessageId: 'om-1',
    conversationId: 'cv-1',
    reply: {
      replyMessageId: 'rm-1',
      operatorMessageId: 'om-1',
      conversationId: 'cv-1',
      text: 'PASS: «idea» · netPnl +12%.',
      ts: '2026-06-22T00:00:00.000Z',
    },
  };

  it('parses a valid proactive assistant message', () => {
    const r = officeEventSchema.parse(valid);
    expect(r.type).toBe('operator_assistant_message');
  });

  it('rejects when reply is missing', () => {
    const { reply, ...noReply } = valid;
    expect(() => officeEventSchema.parse(noReply)).toThrow();
  });
});

describe('phase-3 contract widening', () => {
  it('accepts a backtest with null metrics + null descriptors', () => {
    const parsed = backtestSummarySchema.parse({
      id: 'b1', strategy: null, symbol: null, period: null,
      pnlPct: null, sharpe: null, winRatePct: null, maxDrawdownPct: null,
    });
    expect(parsed.pnlPct).toBeNull();
    expect(parsed.strategy).toBeNull();
  });

  it('still accepts a fully-populated backtest', () => {
    const parsed = backtestSummarySchema.parse({
      id: 'b2', strategy: 'mr', symbol: 'BTC', period: '30d',
      pnlPct: 4.2, sharpe: 1.1, winRatePct: 55, maxDrawdownPct: -8,
    });
    expect(parsed.pnlPct).toBe(4.2);
  });

  it('round-trips InfraStatus.sources', () => {
    const parsed = infraStatusSchema.parse({
      services: [], queues: [], lastSync: '2026-06-14T00:00:00.000Z',
      sources: [
        { domain: 'office-server', state: 'live', detail: 'ok' },
        { domain: 'knowledge', state: 'gap', detail: 'source not connected yet' },
      ],
    });
    expect(parsed.sources?.[1]?.state).toBe('gap');
  });
});
