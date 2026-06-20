import type { RouteSelection } from './floorSelection';
import { OBJECT_PANEL_TARGETS, type ObjectPanelTarget } from './objectPanels';

export interface FloorAgentInfo {
  id: string;
  role: string;
}

export type PanelKind =
  | { kind: 'operator-chat' }
  | { kind: 'operator-evidence' }
  | { kind: 'agent-activity'; agentId: string }
  | { kind: 'object'; panelTarget: ObjectPanelTarget }
  | { kind: 'exit' }
  | { kind: 'none' }
  | { kind: 'unknown'; key: string };

const KNOWN_OBJECT_PANELS = new Set<string>(OBJECT_PANEL_TARGETS);

export function resolvePanel(sel: RouteSelection, agents: FloorAgentInfo[]): PanelKind {
  if (sel.operator) return { kind: 'operator-chat' }; // global shell surface — not a floor entity
  if (sel.agentId) {
    const agent = agents.find((a) => a.id === sel.agentId);
    if (!agent) return { kind: 'unknown', key: `agent:${sel.agentId}` };
    return { kind: 'agent-activity', agentId: agent.id }; // boss included — no special case
  }
  if (sel.panelTarget) {
    if (sel.panelTarget === 'exit') return { kind: 'exit' };
    if (KNOWN_OBJECT_PANELS.has(sel.panelTarget)) {
      return { kind: 'object', panelTarget: sel.panelTarget as ObjectPanelTarget };
    }
    return { kind: 'unknown', key: `panel:${sel.panelTarget}` };
  }
  return { kind: 'none' };
}

/** The entity the scene should select/focus for a given panel (null = clear). */
export function selectedEntityId(
  kind: PanelKind,
  panelTargetToObjectId: Record<string, string>,
): string | null {
  switch (kind.kind) {
    case 'agent-activity':
      return kind.agentId;
    case 'object':
      return panelTargetToObjectId[kind.panelTarget] ?? null;
    case 'operator-chat': // global surface — selects no floor entity
      return null;
    default:
      return null;
  }
}

/** Panel kinds that occupy a side dock (exit/none never open a dock). */
export function opensDock(kind: PanelKind): boolean {
  return (
    kind.kind === 'operator-chat' ||
    kind.kind === 'operator-evidence' ||
    kind.kind === 'agent-activity' ||
    kind.kind === 'object' ||
    kind.kind === 'unknown'
  );
}
