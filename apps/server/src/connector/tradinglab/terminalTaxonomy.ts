// taskType-prefix → confirmed task-completion event `type`s.
// Confirmed against trading-lab source via the calibration procedure. An EMPTY successTypes for a
// matched prefix means the follower degrades honestly
// (streams correlated deltas, finalizes via guard timeout with "live progress stream ended").
export interface TerminalRule {
  prefixes: string[];
  successTypes: string[];
}

export const TERMINAL_TAXONOMY: TerminalRule[] = [
  { prefixes: ['strategy.onboard', 'strategy.analyze_source'], successTypes: ['strategy_analyst.completed', 'strategy.onboard.deduped'] },
  { prefixes: ['research.run_cycle'], successTypes: ['research.run_cycle.completed'] },
  { prefixes: ['hypothesis.build'], successTypes: ['evaluation.completed'] },
];

export const FAILURE_SUFFIXES = ['failed', 'rejected', 'error'];
export const PLAN_ADVANCE_FAILED = 'chat.plan.advance_failed';

export function successTypesFor(taskType: string): string[] {
  return TERMINAL_TAXONOMY.find((r) => r.prefixes.some((p) => taskType.startsWith(p)))?.successTypes ?? [];
}
export function isFailureType(type: string): boolean {
  if (type === PLAN_ADVANCE_FAILED) return true;
  const suffix = type.split(/[._]/).pop() ?? '';
  return FAILURE_SUFFIXES.includes(suffix);
}
