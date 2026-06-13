import { useGateway } from '../../runtime/RuntimeContext';
import { PanelChrome, PanelState } from './PanelChrome';
import { useResource } from './useResource';

export function InfraStatusPanel({ onClose }: { onClose: () => void }) {
  const gateway = useGateway();
  const res = useResource(() => gateway.getInfraStatus(), []);
  return (
    <PanelChrome title="Data node / Infra" onClose={onClose}>
      <PanelState resource={res} />
      {res.data && (
        <>
          <h3>Services</h3>
          {res.data.services.map((s) => (
            <div key={s.name} className="row">
              <span>{s.up ? '🟢' : '🔴'} {s.name}</span>
              <span className="panel__state">{s.detail}</span>
            </div>
          ))}
          <h3>Queues</h3>
          {res.data.queues.map((qd) => (
            <div key={qd.name} className="row"><span>{qd.name}</span><span className="tag">{qd.depth}</span></div>
          ))}
          <p className="panel__state">last sync {res.data.lastSync}</p>
        </>
      )}
    </PanelChrome>
  );
}
