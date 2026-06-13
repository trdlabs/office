import { describe, it, expect } from 'vitest';
import type { OperatorMessage } from '@trading-office/office-gateway';
import { OfficeEventBus } from '../events/OfficeEventBus';
import { assertNoExecutionAuthority, ExecutionAuthorityError } from '../guard/noExecutionAuthority';
import { handleOperatorMessage } from './responder';

const msg: OperatorMessage = { text: 'what is the status?', source: 'web', target: 'orchestrator', floorId: 'trading-lab' };

describe('handleOperatorMessage (inert)', () => {
  it('returns accepted and emits a full lifecycle with paired ids', () => {
    const bus = new OfficeEventBus();
    const events: any[] = [];
    bus.subscribe((e) => events.push(e));
    const accepted = handleOperatorMessage(msg, bus, (fn) => fn()); // synchronous schedule
    expect(accepted.status).toBe('accepted');
    const types = events.map((e) => e.type);
    expect(types[0]).toBe('operator_message_accepted');
    expect(types).toContain('operator_message_delta');
    expect(types[types.length - 1]).toBe('operator_message_completed');
    const completed = events.at(-1);
    expect(completed.operatorMessageId).toBe(accepted.operatorMessageId);
    expect(completed.conversationId).toBe(accepted.conversationId);
    expect(completed.reply.replyMessageId).toBe(completed.replyMessageId);
    expect(completed.reply.text.toLowerCase()).toContain('no execution authority');
  });
});

describe('assertNoExecutionAuthority', () => {
  it('passes an orchestrator-targeted message', () => {
    expect(assertNoExecutionAuthority(msg)).toBe(msg);
  });
  it('refuses any other target', () => {
    const bad = { ...msg, target: 'executor' } as unknown as OperatorMessage;
    expect(() => assertNoExecutionAuthority(bad)).toThrow(ExecutionAuthorityError);
  });
});
