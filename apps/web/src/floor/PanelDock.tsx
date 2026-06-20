import { type ReactElement } from 'react';
import { type PanelKind } from './panelRegistry';
import { type ObjectPanelTarget } from './objectPanels';
import { AgentActivityPanel } from './panels/AgentActivityPanel';
import { OperatorChatPanel } from './panels/OperatorChatPanel';
import { OperatorEvidencePanel } from './panels/OperatorEvidencePanel';
import { HypothesisPanel } from './panels/HypothesisPanel';
import { BacktestPanel } from './panels/BacktestPanel';
import { BotHealthPanel } from './panels/BotHealthPanel';
import { KnowledgePanel } from './panels/KnowledgePanel';
import { InfraStatusPanel } from './panels/InfraStatusPanel';
import { UnknownPanel } from './panels/UnknownPanel';
import type { OperatorEvidenceView } from './panels/operatorTranscript';

// Typed Record<ObjectPanelTarget, …>: a missing or extra key is a compile error,
// keeping this in lockstep with the registry's known object targets.
const OBJECT_PANELS: Record<ObjectPanelTarget, (onClose: () => void) => ReactElement> = {
  'hypothesis-pipeline': (onClose) => <HypothesisPanel onClose={onClose} />,
  'backtest-summary': (onClose) => <BacktestPanel onClose={onClose} />,
  'bot-health': (onClose) => <BotHealthPanel onClose={onClose} />,
  'knowledge-base': (onClose) => <KnowledgePanel onClose={onClose} />,
  'infra-status': (onClose) => <InfraStatusPanel onClose={onClose} />,
};

function renderPanel(
  panelKind: PanelKind,
  onClose: () => void,
  evidenceView: OperatorEvidenceView | null | undefined,
  onShowEvidence: ((view: OperatorEvidenceView) => void) | undefined,
) {
  switch (panelKind.kind) {
    case 'operator-chat':
      return <OperatorChatPanel onClose={onClose} onShowEvidence={onShowEvidence} />;
    case 'operator-evidence':
      return evidenceView ? <OperatorEvidencePanel view={evidenceView} onClose={onClose} /> : null;
    case 'agent-activity':
      return <AgentActivityPanel agentId={panelKind.agentId} onClose={onClose} />;
    case 'object':
      // panelKind.panelTarget is ObjectPanelTarget, so the lookup is total.
      return OBJECT_PANELS[panelKind.panelTarget](onClose);
    case 'unknown':
      return <UnknownPanel panelKey={panelKind.key} onClose={onClose} />;
    default:
      return null;
  }
}

/** Stable key so dock content remounts per distinct panel (not on every render). */
function panelContentKey(panelKind: PanelKind): string {
  switch (panelKind.kind) {
    case 'operator-chat': return 'operator';
    case 'operator-evidence': return 'operator-evidence';
    case 'agent-activity': return `agent:${panelKind.agentId}`;
    case 'object': return `obj:${panelKind.panelTarget}`;
    case 'unknown': return `unknown:${panelKind.key}`;
    default: return 'none';
  }
}

export function PanelDock({
  open,
  side,
  panelKind,
  onClose,
  evidenceView,
  onShowEvidence,
}: {
  open: boolean;
  side: 'left' | 'right';
  panelKind: PanelKind;
  onClose: () => void;
  evidenceView?: OperatorEvidenceView | null;
  onShowEvidence?: (view: OperatorEvidenceView) => void;
}) {
  return (
    <aside className="dock" data-side={side} data-open={open} aria-hidden={!open}>
      {open && (
        <div key={panelContentKey(panelKind)} className="dock__content">
          {renderPanel(panelKind, onClose, evidenceView, onShowEvidence)}
        </div>
      )}
    </aside>
  );
}
