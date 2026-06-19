import { describe, it, expect } from 'vitest';
import { renderCompletionSummary } from './completionSummaryRender';
import type { LabCompletionSummary } from '../connector/tradinglab/labDtos';

describe('renderCompletionSummary', () => {
  it('onboard → profile + next step', () => {
    const s: LabCompletionSummary = { kind: 'strategy.onboard', taskId: 't', status: 'completed', profile: { id: 'p1', coreIdea: 'fade pumps', direction: 'short' }, nextStep: { taskType: 'research.run_cycle' }, links: { taskId: 't', profileId: 'p1' }, warnings: [] };
    const text = renderCompletionSummary(s);
    expect(text).toContain('fade pumps');
    expect(text).toContain('research.run_cycle');
  });

  it('run_cycle → counts + top hypotheses', () => {
    const s: LabCompletionSummary = { kind: 'research.run_cycle', taskId: 't', status: 'completed', profile: { id: 'p1', coreIdea: 'fade pumps', direction: 'short' }, counts: { proposed: 5, validated: 2, rejected: 3, deduped: 0, criticReviews: 2, backtestsEnqueued: 2 }, topHypotheses: [{ id: 'hB', thesis: 'short the pump', confidence: 0.9, status: 'validated' }], links: { taskId: 't', profileId: 'p1' }, warnings: [] };
    const text = renderCompletionSummary(s);
    expect(text).toContain('2'); // validated
    expect(text).toContain('short the pump');
  });

  it('backtest.completed → decision + key metrics + retry note', () => {
    const s: LabCompletionSummary = { kind: 'backtest.completed', taskId: 't', status: 'completed', profile: null, hypothesis: { id: 'h1', thesis: 'short the pump', confidence: 0.6, status: 'validated' }, decision: 'PASS', metrics: { netPnlUsd: 420, netPnlPct: 12, winRate: 0.58, profitFactor: 1.8, maxDrawdownPct: 9, sharpe: 1.1, totalTrades: 30 }, reasons: ['profit factor above threshold'], willRetry: false, links: { taskId: 't', backtestRunId: 'b1' }, warnings: [] };
    const text = renderCompletionSummary(s);
    expect(text).toContain('PASS');
    expect(text).toContain('1.8'); // profit factor
    expect(text).toContain('58'); // win rate %
  });

  it('appends a degraded-data note when warnings are present', () => {
    const s: LabCompletionSummary = { kind: 'strategy.onboard', taskId: 't', status: 'completed', profile: null, links: { taskId: 't' }, warnings: ['profile_read_failed'] };
    const text = renderCompletionSummary(s);
    expect(text).toContain('Профиль создан'); // null-profile fallback head
    expect(text).toContain('⚠'); // partial-data marker
  });
});
