export interface RouteSelection {
  agentId?: string;
  panelTarget?: string;
  operator?: boolean;
}

/** Stable string key for effect deps. */
export function selectionKey(sel: RouteSelection): string {
  return `${sel.agentId ?? ''}|${sel.panelTarget ?? ''}|${sel.operator ? 'op' : ''}`;
}
