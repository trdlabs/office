import { useGateway } from '../../runtime/RuntimeContext';
import { isGap, sourceState } from '../infraSources';
import { PanelChrome, PanelState } from './PanelChrome';
import { useResource } from './useResource';

export function BotHealthPanel({ onClose }: { onClose: () => void }) {
  const gateway = useGateway();
  const res = useResource(() => gateway.getBotHealth(), []);
  const infra = useResource(() => gateway.getInfraStatus(), []);
  const botGap = isGap(sourceState(infra.data, 'bot-health'));
  if (botGap) {
    return (
      <PanelChrome title="Bot status" onClose={onClose}>
        <p className="panel__empty">Bot runtime monitoring is not connected yet</p>
      </PanelChrome>
    );
  }
  return (
    <PanelChrome title="Bot status" onClose={onClose}>
      <PanelState resource={res} />
      {res.data?.map((bot) => (
        <div key={bot.id} className="row">
          <span>{bot.name}</span>
          <span className="tag">{bot.state} · up {bot.uptime} · {bot.lastHeartbeat}</span>
        </div>
      ))}
    </PanelChrome>
  );
}
