import { describe, it, expect } from 'vitest';
import { transcriptReducer, emptyTranscript, isProposalTurn, turnEvidenceView, type OperatorTurn } from './operatorTranscript';

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

function withProposal(): ReturnType<typeof transcriptReducer> {
  let s = transcriptReducer(emptyTranscript, { kind: 'submit', localId: 'L1', text: 'analyse X' });
  s = transcriptReducer(s, { kind: 'accepted', localId: 'L1', operatorMessageId: 'm1', conversationId: 'c1' });
  return transcriptReducer(s, {
    kind: 'event',
    event: { type: 'operator_message_completed', ts: 't', operatorMessageId: 'm1', conversationId: 'c1', replyMessageId: 'r1',
      reply: { replyMessageId: 'r1', operatorMessageId: 'm1', conversationId: 'c1', text: 'Подтвердите запуск анализа.', ts: 't',
        evidence: [{ kind: 'exact_duplicate', label: '⚠ точный дубликат', sourceId: 'pf1' }],
        actions: [{ id: 'confirm', label: 'Подтвердить', style: 'primary' }, { id: 'cancel', label: 'Отмена', style: 'secondary' }],
        pendingInteractionId: 'p1', sessionId: 's1' } },
  });
}

it('completed event carries the proposal fields onto the turn', () => {
  const turn = withProposal().turns[0]!;
  expect(turn.status).toBe('completed');
  expect(turn.replyText).toBe('Подтвердите запуск анализа.');
  expect(turn.actions?.[0]?.id).toBe('confirm');
  expect(turn.evidence?.[0]?.sourceId).toBe('pf1');
  expect(turn.pendingInteractionId).toBe('p1');
  expect(turn.sessionId).toBe('s1');
  expect(turn.resolved).toBeFalsy();
});

it('isProposalTurn is true for an unresolved completed turn with actions', () => {
  const turn = withProposal().turns[0]!;
  expect(isProposalTurn(turn)).toBe(true);
});

it('resolve marks the proposal turn resolved (false-y → true) so buttons hide', () => {
  const s = transcriptReducer(withProposal(), { kind: 'resolve', operatorMessageId: 'm1' });
  const turn = s.turns[0]!;
  expect(turn.resolved).toBe(true);
  expect(isProposalTurn(turn)).toBe(false);
});

it('a completed terminal with empty actions is NOT a proposal (lab not_found/expired/cancel)', () => {
  const turn: OperatorTurn = { localId: 'L', operatorMessageId: 'm', conversationId: 'c', userText: 'u', replyText: 'Не нашёл активного подтверждения.', status: 'completed', actions: [] };
  expect(isProposalTurn(turn)).toBe(false);
});

it('turnEvidenceView projects the reply text + badges (audit-safe)', () => {
  const turn = withProposal().turns[0]!;
  const view = turnEvidenceView(turn);
  expect(view.text).toBe('Подтвердите запуск анализа.');
  expect(view.badges).toHaveLength(1);
  expect(view.badges[0]?.kind).toBe('exact_duplicate');
});

it('completed arriving BEFORE accepted is buffered and applied (Q4)', () => {
  // submit (turn has operatorMessageId=null) → completed for mX arrives first → accepted binds localId→mX
  let s = transcriptReducer(emptyTranscript, { kind: 'submit', localId: 'L1', text: 'go' });
  s = transcriptReducer(s, {
    kind: 'event',
    event: { type: 'operator_message_completed', ts: 't', operatorMessageId: 'mX', conversationId: 'cX', replyMessageId: 'rX',
      reply: { replyMessageId: 'rX', operatorMessageId: 'mX', conversationId: 'cX', text: 'outcome', ts: 't' } },
  });
  // not dropped — held in pendingCompleted, turn still pending
  expect(s.turns[0]!.status).toBe('pending');
  expect(s.pendingCompleted['mX']).toBeDefined();
  s = transcriptReducer(s, { kind: 'accepted', localId: 'L1', operatorMessageId: 'mX', conversationId: 'cX' });
  // applied on accepted; buffer cleared
  expect(s.turns[0]!.status).toBe('completed');
  expect(s.turns[0]!.replyText).toBe('outcome');
  expect(s.pendingCompleted['mX']).toBeUndefined();
});

it('in-order submit → accepted → completed is unchanged (Q4 no regression)', () => {
  let s = transcriptReducer(emptyTranscript, { kind: 'submit', localId: 'L1', text: 'go' });
  s = transcriptReducer(s, { kind: 'accepted', localId: 'L1', operatorMessageId: 'mY', conversationId: 'cY' });
  s = transcriptReducer(s, {
    kind: 'event',
    event: { type: 'operator_message_completed', ts: 't', operatorMessageId: 'mY', conversationId: 'cY', replyMessageId: 'rY',
      reply: { replyMessageId: 'rY', operatorMessageId: 'mY', conversationId: 'cY', text: 'hi', ts: 't' } },
  });
  expect(s.turns[0]!.status).toBe('completed');
  expect(s.turns[0]!.replyText).toBe('hi');
  expect(Object.keys(s.pendingCompleted)).toHaveLength(0);
});

describe('assistant_turn (proactive assistant message)', () => {
  const reply = {
    replyMessageId: 'rm-1',
    operatorMessageId: 'om-A',
    conversationId: 'cv-1',
    text: 'PASS: «idea» · netPnl +12%.',
    ts: '2026-06-22T00:00:00.000Z',
  };

  it('appends a completed assistant-only turn', () => {
    const s = transcriptReducer(emptyTranscript, {
      kind: 'assistant_turn', operatorMessageId: 'om-A', conversationId: 'cv-1', reply,
    });
    expect(s.turns).toHaveLength(1);
    const t = s.turns[0];
    expect(t!.kind).toBe('assistant');
    expect(t!.operatorMessageId).toBe('om-A');
    expect(t!.userText).toBe('');
    expect(t!.replyText).toBe(reply.text);
    expect(t!.status).toBe('completed');
  });

  it('does not disturb existing turns or the pendingCompleted buffer (Q4 intact)', () => {
    const seeded = { ...emptyTranscript, pendingCompleted: { 'om-X': { foo: 1 } as never } };
    const s = transcriptReducer(seeded, {
      kind: 'assistant_turn', operatorMessageId: 'om-A', conversationId: 'cv-1', reply,
    });
    expect(s.pendingCompleted).toEqual(seeded.pendingCompleted);
  });

  it('two assistant_turns append in arrival order', () => {
    let s = transcriptReducer(emptyTranscript, { kind: 'assistant_turn', operatorMessageId: 'om-A', conversationId: 'cv-1', reply });
    s = transcriptReducer(s, { kind: 'assistant_turn', operatorMessageId: 'om-B', conversationId: 'cv-1', reply: { ...reply, operatorMessageId: 'om-B', text: 'FAIL.' } });
    expect(s.turns.map((t) => t.operatorMessageId)).toEqual(['om-A', 'om-B']);
  });
});
