import type { OfficeEvent, OperatorEvidenceBadge, OperatorAction } from '@trading-office/office-gateway';

type CompletedReply = Extract<OfficeEvent, { type: 'operator_message_completed' }>['reply'];
type AssistantReply = Extract<OfficeEvent, { type: 'operator_assistant_message' }>['reply'];

export interface OperatorTurn {
  localId: string;
  operatorMessageId: string | null;
  conversationId: string | null;
  userText: string;
  replyText: string;
  status: 'pending' | 'streaming' | 'completed' | 'failed';
  error?: string;
  evidence?: OperatorEvidenceBadge[];
  actions?: OperatorAction[];
  pendingInteractionId?: string;
  sessionId?: string;
  resolved?: boolean;
  kind?: 'user' | 'assistant';
}

export interface OperatorTranscriptState {
  turns: OperatorTurn[];
  pendingCompleted: Record<string, CompletedReply>;
}

export const emptyTranscript: OperatorTranscriptState = { turns: [], pendingCompleted: {} };

export type TranscriptAction =
  | { kind: 'submit'; localId: string; text: string }
  | { kind: 'accepted'; localId: string; operatorMessageId: string; conversationId: string }
  | { kind: 'submit_failed'; localId: string; error: string }
  | { kind: 'event'; event: OfficeEvent }
  | { kind: 'resolve'; operatorMessageId: string }
  | { kind: 'assistant_turn'; operatorMessageId: string; conversationId: string; reply: AssistantReply };

function mapById(
  state: OperatorTranscriptState,
  operatorMessageId: string,
  fn: (t: OperatorTurn) => OperatorTurn,
): OperatorTranscriptState {
  if (!state.turns.some((t) => t.operatorMessageId === operatorMessageId)) return state;
  return { ...state, turns: state.turns.map((t) => (t.operatorMessageId === operatorMessageId ? fn(t) : t)) };
}

function withCompleted(turn: OperatorTurn, reply: CompletedReply): OperatorTurn {
  return {
    ...turn,
    replyText: reply.text,
    status: 'completed',
    evidence: reply.evidence,
    actions: reply.actions,
    pendingInteractionId: reply.pendingInteractionId,
    sessionId: reply.sessionId,
  };
}

export function transcriptReducer(state: OperatorTranscriptState, action: TranscriptAction): OperatorTranscriptState {
  switch (action.kind) {
    case 'submit':
      return {
        ...state,
        turns: [
          ...state.turns,
          { localId: action.localId, operatorMessageId: null, conversationId: null, userText: action.text, replyText: '', status: 'pending' },
        ],
      };
    case 'accepted': {
      const turns = state.turns.map((t) =>
        t.localId === action.localId
          ? { ...t, operatorMessageId: action.operatorMessageId, conversationId: action.conversationId, status: 'streaming' as const }
          : t,
      );
      const buffered = state.pendingCompleted[action.operatorMessageId];
      if (!buffered) return { ...state, turns };
      const { [action.operatorMessageId]: _applied, ...restPending } = state.pendingCompleted;
      return {
        ...state,
        turns: turns.map((t) => (t.operatorMessageId === action.operatorMessageId ? withCompleted(t, buffered) : t)),
        pendingCompleted: restPending,
      };
    }
    case 'submit_failed':
      return {
        ...state,
        turns: state.turns.map((t) =>
          t.localId === action.localId ? { ...t, status: 'failed', error: action.error } : t,
        ),
      };
    case 'resolve':
      return mapById(state, action.operatorMessageId, (t) => ({ ...t, resolved: true }));
    case 'assistant_turn': {
      const turn: OperatorTurn = {
        localId: action.operatorMessageId,
        operatorMessageId: action.operatorMessageId,
        conversationId: action.conversationId,
        userText: '',
        replyText: action.reply.text,
        status: 'completed',
        evidence: action.reply.evidence,
        actions: action.reply.actions,
        pendingInteractionId: action.reply.pendingInteractionId,
        sessionId: action.reply.sessionId,
        resolved: true,
        kind: 'assistant',
      };
      return { ...state, turns: [...state.turns, turn] };
    }
    case 'event': {
      const e = action.event;
      if (e.type === 'operator_message_delta') return mapById(state, e.operatorMessageId, (t) => ({ ...t, replyText: t.replyText + e.textDelta, status: 'streaming' }));
      if (e.type === 'operator_message_completed') {
        const hasTurn = state.turns.some((t) => t.operatorMessageId === e.operatorMessageId);
        if (!hasTurn) {
          return { ...state, pendingCompleted: { ...state.pendingCompleted, [e.operatorMessageId]: e.reply } };
        }
        return mapById(state, e.operatorMessageId, (t) => withCompleted(t, e.reply));
      }
      if (e.type === 'operator_message_failed') return mapById(state, e.operatorMessageId, (t) => ({ ...t, status: 'failed', error: e.error.message }));
      return state;
    }
  }
}

export interface OperatorEvidenceView {
  text: string;
  badges: OperatorEvidenceBadge[];
}

/** A completed turn that still offers actions and hasn't been acted on — render confirm/cancel + badges. */
export function isProposalTurn(turn: OperatorTurn): boolean {
  return turn.status === 'completed' && !!turn.actions && turn.actions.length > 0 && !turn.resolved;
}

/** Audit-safe projection for the left-dock evidence panel — reply text + the turn's badges, no network. */
export function turnEvidenceView(turn: OperatorTurn): OperatorEvidenceView {
  return { text: turn.replyText, badges: turn.evidence ?? [] };
}
