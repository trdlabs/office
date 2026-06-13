import { useGateway, useAgentStatuses } from '../../runtime/RuntimeContext';
import { PanelChrome, PanelState } from './PanelChrome';
import { useResource } from './useResource';

export function AgentActivityPanel({ agentId, onClose }: { agentId: string; onClose: () => void }) {
  const gateway = useGateway();
  const statuses = useAgentStatuses();
  const res = useResource(() => gateway.getAgentActivity(agentId), [agentId]);
  const status = statuses[agentId] ?? res.data?.status ?? 'idle';

  return (
    <PanelChrome title={`Agent · ${agentId}`} onClose={onClose}>
      <div className="row">
        <span>Status</span>
        <span className="status-pill">{status}</span>
      </div>
      <PanelState resource={res} />
      {res.data && (
        <>
          <p className="row"><span>Task</span><span>{res.data.currentTask ?? '—'}</span></p>
          <h3>Logs / traces</h3>
          <div className="trace">
            {res.data.logs.map((l, i) => (
              <div key={i}>{l.ts} [{l.level}] {l.text}</div>
            ))}
          </div>
        </>
      )}
    </PanelChrome>
  );
}
