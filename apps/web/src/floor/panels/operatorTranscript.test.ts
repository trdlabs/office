import { describe, it, expect } from 'vitest';
import { transcriptReducer, emptyTranscript } from './operatorTranscript';

describe('transcriptReducer', () => {
  it('drives a turn through submit → accepted → delta → completed', () => {
    let s = emptyTranscript;
    s = transcriptReducer(s, { kind: 'submit', localId: 'L1', text: 'status?' });
    expect(s.turns[0]!.status).toBe('pending');
    s = transcriptReducer(s, { kind: 'accepted', localId: 'L1', operatorMessageId: 'm1', conversationId: 'c1' });
    expect(s.turns[0]!.status).toBe('streaming');
    s = transcriptReducer(s, { kind: 'event', event: { type: 'operator_message_delta', ts: '1', operatorMessageId: 'm1', conversationId: 'c1', replyMessageId: 'r1', textDelta: 'All ' } });
    s = transcriptReducer(s, { kind: 'event', event: { type: 'operator_message_delta', ts: '2', operatorMessageId: 'm1', conversationId: 'c1', replyMessageId: 'r1', textDelta: 'good.' } });
    expect(s.turns[0]!.replyText).toBe('All good.');
    s = transcriptReducer(s, { kind: 'event', event: { type: 'operator_message_completed', ts: '3', operatorMessageId: 'm1', conversationId: 'c1', replyMessageId: 'r1', reply: { replyMessageId: 'r1', operatorMessageId: 'm1', conversationId: 'c1', text: 'All good. (no execution authority)', ts: '3' } } });
    expect(s.turns[0]!.status).toBe('completed');
    expect(s.turns[0]!.replyText).toContain('no execution authority');
  });

  it('ignores events for messages it does not know', () => {
    const before = transcriptReducer(emptyTranscript, { kind: 'submit', localId: 'L1', text: 'x' });
    const after = transcriptReducer(before, { kind: 'event', event: { type: 'operator_message_delta', ts: '1', operatorMessageId: 'other', conversationId: 'c9', replyMessageId: 'r9', textDelta: 'zzz' } });
    expect(after).toEqual(before);
  });

  it('marks a turn failed (operator_message_failed event)', () => {
    let s = transcriptReducer(emptyTranscript, { kind: 'submit', localId: 'L1', text: 'x' });
    s = transcriptReducer(s, { kind: 'accepted', localId: 'L1', operatorMessageId: 'm1', conversationId: 'c1' });
    s = transcriptReducer(s, { kind: 'event', event: { type: 'operator_message_failed', ts: '2', operatorMessageId: 'm1', conversationId: 'c1', error: { code: 'x', message: 'boom' } } });
    expect(s.turns[0]!.status).toBe('failed');
    expect(s.turns[0]!.error).toBe('boom');
  });

  it('marks a turn failed when the HTTP submit itself fails', () => {
    let s = transcriptReducer(emptyTranscript, { kind: 'submit', localId: 'L1', text: 'x' });
    s = transcriptReducer(s, { kind: 'submit_failed', localId: 'L1', error: 'server unavailable' });
    expect(s.turns[0]!.status).toBe('failed');
    expect(s.turns[0]!.error).toBe('server unavailable');
  });
});
