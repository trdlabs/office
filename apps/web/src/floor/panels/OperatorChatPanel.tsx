import { useEffect, useReducer, useRef, useState, type FormEvent } from 'react';
import { useGateway } from '../../runtime/RuntimeContext';
import { PanelChrome } from './PanelChrome';
import { emptyTranscript, transcriptReducer } from './operatorTranscript';

export function OperatorChatPanel({ onClose }: { onClose: () => void }) {
  const gateway = useGateway();
  const [state, dispatch] = useReducer(transcriptReducer, emptyTranscript);
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const localSeq = useRef(0);

  useEffect(() => {
    if (!gateway.subscribeOfficeEvents) return;
    return gateway.subscribeOfficeEvents((event) => dispatch({ kind: 'event', event }));
  }, [gateway]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    const localId = `L${(localSeq.current += 1)}`;
    dispatch({ kind: 'submit', localId, text: trimmed });
    setText('');
    setPending(true);
    try {
      const accepted = await gateway.sendOperatorMessage({ text: trimmed, source: 'web', target: 'orchestrator', floorId: 'trading-lab' });
      dispatch({ kind: 'accepted', localId, operatorMessageId: accepted.operatorMessageId, conversationId: accepted.conversationId });
    } catch (err) {
      dispatch({ kind: 'submit_failed', localId, error: err instanceof Error ? err.message : 'send failed' });
    } finally {
      setPending(false);
    }
  }

  return (
    <PanelChrome title="Operator chat · Orchestrator" badge="no execution authority" onClose={onClose}>
      <div className="chat">
        {state.turns.length === 0 && <p className="panel__state">Message the orchestrator. Read-only — no execution authority.</p>}
        {state.turns.map((t) => (
          <div key={t.localId}>
            <div className="chat__msg chat__msg--user">{t.userText}</div>
            {t.status === 'failed' ? (
              <div className="chat__msg chat__msg--assistant">Failed: {t.error}</div>
            ) : (
              (t.replyText || t.status === 'streaming') && (
                <div className="chat__msg chat__msg--assistant">{t.replyText || '…'}</div>
              )
            )}
          </div>
        ))}
      </div>
      <form className="chat__form" onSubmit={send}>
        <input className="chat__input" value={text} placeholder="Message the orchestrator…" onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="btn btn--primary" disabled={pending}>Send</button>
      </form>
    </PanelChrome>
  );
}
