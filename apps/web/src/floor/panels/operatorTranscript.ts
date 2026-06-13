import type { OfficeEvent } from '@trading-office/office-gateway';

export interface OperatorTurn {
  localId: string;
  operatorMessageId: string | null;
  conversationId: string | null;
  userText: string;
  replyText: string;
  status: 'pending' | 'streaming' | 'completed' | 'failed';
  error?: string;
}

export interface OperatorTranscriptState {
  turns: OperatorTurn[];
}

export const emptyTranscript: OperatorTranscriptState = { turns: [] };

export type TranscriptAction =
  | { kind: 'submit'; localId: string; text: string }
  | { kind: 'accepted'; localId: string; operatorMessageId: string; conversationId: string }
  | { kind: 'submit_failed'; localId: string; error: string }
  | { kind: 'event'; event: OfficeEvent };

function mapById(
  state: OperatorTranscriptState,
  operatorMessageId: string,
  fn: (t: OperatorTurn) => OperatorTurn,
): OperatorTranscriptState {
  if (!state.turns.some((t) => t.operatorMessageId === operatorMessageId)) return state;
  return { turns: state.turns.map((t) => (t.operatorMessageId === operatorMessageId ? fn(t) : t)) };
}

export function transcriptReducer(state: OperatorTranscriptState, action: TranscriptAction): OperatorTranscriptState {
  switch (action.kind) {
    case 'submit':
      return {
        turns: [
          ...state.turns,
          { localId: action.localId, operatorMessageId: null, conversationId: null, userText: action.text, replyText: '', status: 'pending' },
        ],
      };
    case 'accepted':
      return {
        turns: state.turns.map((t) =>
          t.localId === action.localId
            ? { ...t, operatorMessageId: action.operatorMessageId, conversationId: action.conversationId, status: 'streaming' }
            : t,
        ),
      };
    case 'submit_failed':
      return {
        turns: state.turns.map((t) =>
          t.localId === action.localId ? { ...t, status: 'failed', error: action.error } : t,
        ),
      };
    case 'event': {
      const e = action.event;
      if (e.type === 'operator_message_delta') return mapById(state, e.operatorMessageId, (t) => ({ ...t, replyText: t.replyText + e.textDelta, status: 'streaming' }));
      if (e.type === 'operator_message_completed') return mapById(state, e.operatorMessageId, (t) => ({ ...t, replyText: e.reply.text, status: 'completed' }));
      if (e.type === 'operator_message_failed') return mapById(state, e.operatorMessageId, (t) => ({ ...t, status: 'failed', error: e.error.message }));
      return state;
    }
  }
}
