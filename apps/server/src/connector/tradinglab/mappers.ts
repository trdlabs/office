import type { AgentStatus, AgentStatusMap, AgentActivity, Hypothesis, BacktestSummary, TraceLine } from '@trading-office/office-gateway';
import type { LabAgentActivity, LabAgentId, LabAgentSummary, LabBacktest, LabHypothesisListItem, LabLifecycle } from './labDtos';

const ID_MAP: Record<LabAgentId, string> = {
  analyst: 'analyst', researcher: 'researcher', critic: 'critic', builder: 'builder', system: 'boss',
};
export const mapAgentId = (id: LabAgentId): string => ID_MAP[id];

// Reverse map: office agent id → trading-lab agent id. Office agents with no lab source → null.
const OFFICE_TO_LAB: Record<string, LabAgentId> = {
  boss: 'system',
  analyst: 'analyst',
  researcher: 'researcher',
  critic: 'critic',
  builder: 'builder',
};
/** Office floor agents with NO trading-lab source (documented gap) — surfaced as honest idle. */
export const NO_LAB_SOURCE_AGENTS = ['evaluator', 'perf-monitor'] as const;
export function mapOfficeAgentIdToLab(officeId: string): LabAgentId | null {
  return OFFICE_TO_LAB[officeId] ?? null;
}

// per-agent "busy" flavor for the working lifecycle
const WORKING_FLAVOR: Record<string, AgentStatus> = { critic: 'reviewing', builder: 'running' };
export function mapAgentStatus(labId: LabAgentId, lifecycle: LabLifecycle): AgentStatus {
  switch (lifecycle) {
    case 'idle': return 'idle';
    case 'succeeded': return 'success';
    case 'failed': return 'failed';
    case 'working': return WORKING_FLAVOR[mapAgentId(labId)] ?? 'thinking';
  }
}

export function mapAgentStatuses(agents: LabAgentSummary[]): AgentStatusMap {
  const out: AgentStatusMap = {};
  for (const a of agents) out[mapAgentId(a.agentId)] = mapAgentStatus(a.agentId, a.status);
  return out;
}

export function humanize(type: string): string {
  return type.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function mapAgentActivity(a: LabAgentActivity): AgentActivity {
  const logs: TraceLine[] = a.trace.map((e) => ({ ts: e.ts, level: e.level, text: e.summary }));
  return {
    agentId: mapAgentId(a.agentId),
    status: mapAgentStatus(a.agentId, a.status),
    currentTask: a.currentTask ? humanize(a.currentTask.type) : null,
    logs,
  };
}

export function mapHypothesis(h: LabHypothesisListItem): Hypothesis {
  return { id: h.id, title: h.thesis, summary: h.targetBehavior, stage: h.status };
}

// winRate is a fraction (0..1) on the lab side — confirm in M1 calibration; ×100 here for the office percent field.
export function mapBacktest(b: LabBacktest): BacktestSummary {
  const m = b.metrics;
  return {
    id: b.id,
    strategy: null,
    symbol: null,
    period: null,
    pnlPct: m.netPnlPct,
    sharpe: m.sharpe,
    winRatePct: m.winRate === null ? null : Math.round(m.winRate * 10000) / 100,
    maxDrawdownPct: m.maxDrawdownPct,
  };
}
