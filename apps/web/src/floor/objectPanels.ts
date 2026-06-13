/**
 * Canonical object-panel targets — the single source of truth shared by the
 * panel registry (route resolution) and the dock (target → component map).
 * Adding/removing a target here forces both to stay in sync: the registry's
 * KNOWN set derives from this list, and the dock's OBJECT_PANELS map is typed
 * Record<ObjectPanelTarget, …> so a missing/extra panel is a compile error.
 */
export const OBJECT_PANEL_TARGETS = [
  'hypothesis-pipeline',
  'backtest-summary',
  'bot-health',
  'knowledge-base',
  'infra-status',
] as const;

export type ObjectPanelTarget = (typeof OBJECT_PANEL_TARGETS)[number];
