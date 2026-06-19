import type { LabCompletionSummary, LabCompletionMetrics } from '../connector/tradinglab/labDtos';

const pct = (x: number | null): string | null => (x === null ? null : `${Math.round(x * 100)}%`);
const n2 = (x: number | null): string | null => (x === null ? null : `${Math.round(x * 100) / 100}`);

// winRate arrives as a 0..1 fraction (→ pct()); netPnlPct / maxDrawdownPct already arrive as
// percentage NUMBERS (e.g. 12 = 12%) — render them raw. Do NOT wrap them in pct() (→ 1200%).
function metricsLine(m: LabCompletionMetrics): string {
  const parts: string[] = [];
  if (m.netPnlUsd !== null) parts.push(`PnL ${m.netPnlUsd}${m.netPnlPct !== null ? ` (${m.netPnlPct}%)` : ''}`);
  if (m.winRate !== null) parts.push(`win ${pct(m.winRate)}`);
  if (m.profitFactor !== null) parts.push(`PF ${n2(m.profitFactor)}`);
  if (m.maxDrawdownPct !== null) parts.push(`maxDD ${m.maxDrawdownPct}%`);
  if (m.sharpe !== null) parts.push(`sharpe ${n2(m.sharpe)}`);
  if (m.totalTrades !== null) parts.push(`trades ${m.totalTrades}`);
  return parts.join(', ');
}

function degraded(warnings: readonly string[]): string {
  return warnings.length ? `\n\n⚠️ часть данных недоступна (${warnings.join(', ')})` : '';
}

export function renderCompletionSummary(s: LabCompletionSummary): string {
  switch (s.kind) {
    case 'strategy.onboard': {
      const head = s.profile
        ? `Профиль создан: «${s.profile.coreIdea}» (${s.profile.direction}).`
        : 'Профиль создан.';
      const next = s.nextStep ? ` Дальше: ${s.nextStep.taskType}.` : '';
      return `${head}${next}${degraded(s.warnings)}`;
    }
    case 'research.run_cycle': {
      const c = s.counts;
      const dedup = c.deduped > 0 ? `, ${c.deduped} дубл.` : '';
      const head = `Гипотезы: ${c.proposed} предложено, ${c.validated} валидно, ${c.rejected} отклонено${dedup} · ${c.backtestsEnqueued} бэктест(ов) в очереди.`;
      const top = s.topHypotheses.length
        ? `\n${s.topHypotheses.map((h) => `• ${h.thesis}${h.confidence !== null ? ` (conf ${n2(h.confidence)})` : ''}`).join('\n')}`
        : '';
      return `${head}${top}${degraded(s.warnings)}`;
    }
    case 'backtest.completed': {
      const subj = s.hypothesis ? `«${s.hypothesis.thesis}»` : 'гипотеза';
      const metrics = metricsLine(s.metrics);
      const head = `${s.decision}: ${subj}${metrics ? ` · ${metrics}` : ''}.`;
      const reasons = s.reasons.length ? `\n${s.reasons.map((r) => `— ${r}`).join('\n')}` : '';
      const retry = s.willRetry ? '\nПовтор цикла запланирован.' : '';
      return `${head}${reasons}${retry}${degraded(s.warnings)}`;
    }
  }
}
