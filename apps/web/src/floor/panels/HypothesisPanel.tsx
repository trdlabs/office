import { useGateway } from '../../runtime/RuntimeContext';
import { PanelChrome, PanelState } from './PanelChrome';
import { useResource } from './useResource';

export function HypothesisPanel({ onClose }: { onClose: () => void }) {
  const gateway = useGateway();
  const res = useResource(() => gateway.getHypotheses(), []);
  return (
    <PanelChrome title="Hypotheses" onClose={onClose}>
      <PanelState resource={res} />
      {res.data?.map((h) => (
        <div key={h.id} className="row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <div className="row"><strong>{h.title}</strong><span className="tag">{h.stage}</span></div>
          <span className="panel__state">{h.summary}</span>
        </div>
      ))}
    </PanelChrome>
  );
}
