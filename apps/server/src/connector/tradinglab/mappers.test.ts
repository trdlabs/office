import { describe, it, expect } from 'vitest';
import { mapAgentId, mapAgentStatus, mapAgentStatuses, mapAgentActivity, mapHypothesis, mapBacktest, mapOfficeAgentIdToLab, NO_LAB_SOURCE_AGENTS } from './mappers';
import type { LabAgentActivity, LabAgentSummary, LabBacktest, LabHypothesisListItem } from './labDtos';

describe('agent id + status mapping', () => {
  it('maps lab ids to office ids (system → boss)', () => {
    expect(mapAgentId('analyst')).toBe('analyst');
    expect(mapAgentId('system')).toBe('boss');
  });
  it('maps lifecycle with per-agent busy flavor', () => {
    expect(mapAgentStatus('builder', 'idle')).toBe('idle');
    expect(mapAgentStatus('builder', 'succeeded')).toBe('success');
    expect(mapAgentStatus('builder', 'failed')).toBe('failed');
    expect(mapAgentStatus('builder', 'working')).toBe('running');
    expect(mapAgentStatus('critic', 'working')).toBe('reviewing');
    expect(mapAgentStatus('researcher', 'working')).toBe('thinking');
  });
  it('builds an AgentStatusMap keyed by office ids', () => {
    const agents: LabAgentSummary[] = [
      { agentId: 'analyst', status: 'working', currentTaskId: 't1', lastEvent: null },
      { agentId: 'system', status: 'idle', currentTaskId: null, lastEvent: null },
    ];
    expect(mapAgentStatuses(agents)).toEqual({ analyst: 'thinking', boss: 'idle' });
  });
});

describe('hypothesis mapping (validated/rejected only)', () => {
  it('maps fields and stage', () => {
    const h: LabHypothesisListItem = {
      id: 'h1', profileId: 'p', thesis: 'Funding reverts', targetBehavior: 'short MR',
      status: 'validated', confidence: 0.7,
      expectedEffect: { metric: 'pnl', direction: 'increase' },
      createdAt: 'x', updatedAt: 'y',
    };
    expect(mapHypothesis(h)).toEqual({ id: 'h1', title: 'Funding reverts', summary: 'short MR', stage: 'validated' });
  });
});

describe('backtest mapping (null-honest, winRate x100)', () => {
  it('keeps nulls (never 0) and scales winRate', () => {
    const b: LabBacktest = {
      id: 'b1', hypothesisId: 'h1', status: 'completed',
      metrics: { netPnlUsd: null, netPnlPct: 4.2, totalTrades: null, winRate: 0.55, profitFactor: null, maxDrawdownPct: -8, expectancyUsd: null, sharpe: null, topTradeContributionPct: null },
      submittedAt: 'x', finishedAt: null, createdAt: 'x', updatedAt: 'y',
    };
    expect(mapBacktest(b)).toEqual({
      id: 'b1', strategy: null, symbol: null, period: null,
      pnlPct: 4.2, sharpe: null, winRatePct: 55, maxDrawdownPct: -8,
    });
  });
});

describe('office → lab reverse id mapping', () => {
  it('maps boss → system and identity for the lab-sourced agents', () => {
    expect(mapOfficeAgentIdToLab('boss')).toBe('system');
    expect(mapOfficeAgentIdToLab('analyst')).toBe('analyst');
    expect(mapOfficeAgentIdToLab('builder')).toBe('builder');
  });
  it('returns null for office agents with no lab source', () => {
    expect(mapOfficeAgentIdToLab('evaluator')).toBeNull();
    expect(mapOfficeAgentIdToLab('perf-monitor')).toBeNull();
    expect(NO_LAB_SOURCE_AGENTS).toEqual(['evaluator', 'perf-monitor']);
  });
});

describe('activity mapping', () => {
  it('maps currentTask + trace → logs', () => {
    const a: LabAgentActivity = {
      agentId: 'researcher', status: 'working',
      currentTask: { id: 't1', type: 'research.run_cycle', status: 'working' },
      trace: [{ id: 'e1', ts: '2026-06-14T00:00:00Z', type: 'research.run_cycle.started', taskId: 't1', level: 'info', summary: 'Research Run Cycle Started' }],
    };
    const out = mapAgentActivity(a);
    expect(out.agentId).toBe('researcher');
    expect(out.status).toBe('thinking');
    expect(out.currentTask).toBe('Research Run Cycle');
    expect(out.logs).toEqual([{ ts: '2026-06-14T00:00:00Z', level: 'info', text: 'Research Run Cycle Started' }]);
  });
});
