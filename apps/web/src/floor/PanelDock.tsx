import { type PanelKind } from './panelRegistry';

// STUB for Milestone 4 — replaced in Task 5.3 by the registry-driven dock that
// renders the real panels. Minimal here so FloorScreen's route↔scene/dock
// behavior is reviewable at the M4 checkpoint. Same props as the real dock.
function panelLabel(panelKind: PanelKind): string {
  switch (panelKind.kind) {
    case 'boss-command':
      return 'Boss · Orchestrator';
    case 'agent-activity':
      return `Agent · ${panelKind.agentId}`;
    case 'object':
      return `Panel · ${panelKind.panelTarget}`;
    case 'unknown':
      return `Not available · ${panelKind.key}`;
    default:
      return '';
  }
}

export function PanelDock({
  open,
  panelKind,
  onClose,
}: {
  open: boolean;
  panelKind: PanelKind;
  onClose: () => void;
}) {
  return (
    <aside className="dock" data-open={open} aria-hidden={!open}>
      {open && (
        <section className="panel">
          <header className="panel__head">
            <h2 className="panel__title">{panelLabel(panelKind)}</h2>
            <button className="panel__close" onClick={onClose} aria-label="Close panel">
              ×
            </button>
          </header>
          <div className="panel__body">
            <p className="panel__state">Panel content arrives in Milestone 5.</p>
          </div>
        </section>
      )}
    </aside>
  );
}
