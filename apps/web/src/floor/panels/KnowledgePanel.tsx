import { useState } from 'react';
import { useGateway } from '../../runtime/RuntimeContext';
import { isGap, sourceState } from '../infraSources';
import { PanelChrome, PanelState } from './PanelChrome';
import { useResource } from './useResource';

export function KnowledgePanel({ onClose }: { onClose: () => void }) {
  const gateway = useGateway();
  const res = useResource(() => gateway.getKnowledge(), []);
  const infra = useResource(() => gateway.getInfraStatus(), []);
  const knowledgeGap = isGap(sourceState(infra.data, 'knowledge'));
  const [q, setQ] = useState('');
  const rows = (res.data ?? []).filter((k) => k.title.toLowerCase().includes(q.toLowerCase()));
  if (knowledgeGap) {
    return (
      <PanelChrome title="Archive / Knowledge" onClose={onClose}>
        <p className="panel__empty">Knowledge source is not connected yet</p>
      </PanelChrome>
    );
  }
  return (
    <PanelChrome title="Archive / Knowledge" onClose={onClose}>
      <input className="login__input" placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />
      <PanelState resource={res} />
      {rows.map((k) => (
        <div key={k.id} className="row">
          <span>{k.title}</span>
          <span className="tag">{k.kind} · {k.updated}</span>
        </div>
      ))}
    </PanelChrome>
  );
}
