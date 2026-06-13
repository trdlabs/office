import { useGateway } from '../../runtime/RuntimeContext';
import { PanelChrome, PanelState } from './PanelChrome';
import { useResource } from './useResource';

export function BotHealthPanel({ onClose }: { onClose: () => void }) {
  const gateway = useGateway();
  const res = useResource(() => gateway.getBotHealth(), []);
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
