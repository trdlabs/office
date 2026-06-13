import { PanelChrome } from './PanelChrome';

export function UnknownPanel({ panelKey, onClose }: { panelKey: string; onClose: () => void }) {
  return (
    <PanelChrome title="Not available" onClose={onClose}>
      <p className="panel__state">No panel is registered for "{panelKey}".</p>
    </PanelChrome>
  );
}
