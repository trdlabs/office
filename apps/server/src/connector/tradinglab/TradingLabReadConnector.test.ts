import { describe, it, expect, vi } from 'vitest';
import { TradingLabHttpClient } from './TradingLabHttpClient';
import { TradingLabReadConnector } from './TradingLabReadConnector';

const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
const cfg = { readUrl: 'http://lab:3100', readToken: 't', requestTimeoutMs: 1000 };
const conn = (fetchImpl: typeof fetch) => new TradingLabReadConnector(new TradingLabHttpClient({ ...cfg, fetchImpl }));

describe('TradingLabReadConnector', () => {
  it('maps /v1/agents (cursor envelope) → AgentStatusMap with office ids', async () => {
    const c = conn(vi.fn(async () => json({ data: [
      { agentId: 'analyst', status: 'working', currentTaskId: null, lastEvent: null },
      { agentId: 'system', status: 'idle', currentTaskId: null, lastEvent: null },
    ], cursor: null })) as unknown as typeof fetch);
    expect(await c.getAgentStatuses()).toEqual({ analyst: 'thinking', boss: 'idle' });
  });

  it('maps /v1/hypotheses (page envelope) → Hypothesis[]', async () => {
    const c = conn(vi.fn(async () => json({ data: [
      { id: 'h1', profileId: 'p', thesis: 'T', targetBehavior: 'B', status: 'rejected', confidence: 0.2, expectedEffect: { metric: 'm', direction: 'decrease' }, createdAt: 'x', updatedAt: 'y' },
    ], page: { nextCursor: null, limit: 20 } })) as unknown as typeof fetch);
    expect(await c.getHypotheses()).toEqual([{ id: 'h1', title: 'T', summary: 'B', stage: 'rejected' }]);
  });

  it('maps /v1/backtests → BacktestSummary[] preserving nulls', async () => {
    const c = conn(vi.fn(async () => json({ data: [
      { id: 'b1', hypothesisId: 'h1', status: 'completed', metrics: { netPnlUsd: null, netPnlPct: null, totalTrades: null, winRate: null, profitFactor: null, maxDrawdownPct: null, expectancyUsd: null, sharpe: null, topTradeContributionPct: null }, submittedAt: 'x', finishedAt: null, createdAt: 'x', updatedAt: 'y' },
    ], page: { nextCursor: null, limit: 20 } })) as unknown as typeof fetch);
    expect((await c.getBacktests())[0]).toMatchObject({ id: 'b1', pnlPct: null, winRatePct: null, strategy: null });
  });
});
