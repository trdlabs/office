import { useState, type FormEvent } from 'react';
import { useGateway } from '../../runtime/RuntimeContext';
import type { BossMessage } from '../../runtime/types';
import { PanelChrome } from './PanelChrome';

export function BossCommandPanel({ onClose }: { onClose: () => void }) {
  const gateway = useGateway();
  const [messages, setMessages] = useState<BossMessage[]>([]);
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);

  async function send(e: FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    const user: BossMessage = { id: `u${messages.length}`, role: 'user', text: trimmed, ts: '' };
    setMessages((m) => [...m, user]);
    setText('');
    setPending(true);
    const reply = await gateway.sendBossCommand(trimmed);
    setMessages((m) => [...m, reply]);
    setPending(false);
  }

  return (
    <PanelChrome title="Boss · Orchestrator" badge="mock · no execution authority" onClose={onClose}>
      <div className="chat">
        {messages.length === 0 && <p className="panel__state">Ask for a status report. Commands are mock-only.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`chat__msg chat__msg--${m.role}`}>{m.text}</div>
        ))}
        {pending && <div className="chat__msg chat__msg--assistant">…</div>}
      </div>
      <form className="chat__form" onSubmit={send}>
        <input className="chat__input" value={text} placeholder="Message the orchestrator…" onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="btn btn--primary" disabled={pending}>Send</button>
      </form>
    </PanelChrome>
  );
}
