import type {
  AgentActivity,
  AgentStatus,
  BacktestSummary,
  BotHealth,
  Hypothesis,
  InfraStatus,
  KnowledgeEntry,
} from './types';

export const INITIAL_STATUSES: Record<string, AgentStatus> = {
  boss: 'thinking',
  analyst: 'idle',
  researcher: 'thinking',
  critic: 'reviewing',
  builder: 'running',
  evaluator: 'backtesting',
  'perf-monitor': 'idle',
};

/** Plausible status loops per agent for the "simulate activity" toggle. */
export const STATUS_POOLS: Record<string, AgentStatus[]> = {
  boss: ['thinking', 'running', 'waiting', 'thinking'],
  analyst: ['thinking', 'reviewing', 'idle', 'success'],
  researcher: ['thinking', 'running', 'idle', 'thinking'],
  critic: ['reviewing', 'blocked', 'reviewing', 'idle'],
  builder: ['running', 'idle', 'success', 'running'],
  evaluator: ['backtesting', 'success', 'backtesting', 'failed'],
  'perf-monitor': ['idle', 'running', 'failed', 'running'],
};

const TASKS: Record<string, string> = {
  boss: 'Coordinating the BTC mean-reversion research sprint',
  analyst: 'Scoring 12 candidate features for regime detection',
  researcher: 'Sweeping lookback windows on the momentum signal',
  critic: 'Auditing risk on the latest strategy proposal',
  builder: 'Compiling strategy v0.4 into the backtest harness',
  evaluator: 'Running walk-forward backtest on ETH 4h',
  'perf-monitor': 'Watching live paper-trading drawdown',
};

export function agentActivity(agentId: string): AgentActivity {
  const status = INITIAL_STATUSES[agentId] ?? 'idle';
  return {
    agentId,
    status,
    currentTask: status === 'idle' ? null : (TASKS[agentId] ?? 'Working'),
    logs: [
      { ts: '09:41:02', level: 'info', text: `agent ${agentId} picked up task` },
      { ts: '09:41:08', level: 'debug', text: 'loaded dataset shard 3/8' },
      { ts: '09:41:15', level: 'info', text: 'evaluating candidate parameters' },
      { ts: '09:41:21', level: 'warn', text: 'sharpe below threshold on fold 2' },
      { ts: '09:41:30', level: 'info', text: 'continuing sweep' },
    ],
  };
}

export const HYPOTHESES: Hypothesis[] = [
  { id: 'h1', title: 'BTC funding-rate reversion', stage: 'testing', summary: 'Negative funding precedes short-horizon mean reversion.' },
  { id: 'h2', title: 'ETH volatility breakout', stage: 'proposed', summary: 'ATR expansion predicts trend continuation on 4h.' },
  { id: 'h3', title: 'Cross-asset lead-lag', stage: 'validated', summary: 'BTC moves lead alts by ~15m in high-vol regimes.' },
  { id: 'h4', title: 'Weekend liquidity fade', stage: 'rejected', summary: 'No durable edge after fees; drawdown too high.' },
];

export const BACKTESTS: BacktestSummary[] = [
  { id: 'b1', strategy: 'mr-funding', symbol: 'BTCUSDT', period: '2024-Q4', pnlPct: 12.4, sharpe: 1.8, winRatePct: 57, maxDrawdownPct: 6.2 },
  { id: 'b2', strategy: 'vol-breakout', symbol: 'ETHUSDT', period: '2024-Q4', pnlPct: 8.1, sharpe: 1.1, winRatePct: 49, maxDrawdownPct: 9.7 },
  { id: 'b3', strategy: 'lead-lag', symbol: 'SOLUSDT', period: '2024-Q4', pnlPct: -2.3, sharpe: -0.3, winRatePct: 44, maxDrawdownPct: 11.5 },
];

export const BOTS: BotHealth[] = [
  { id: 'bot1', name: 'paper-mr-funding', state: 'running', uptime: '3d 4h', lastHeartbeat: '2s ago' },
  { id: 'bot2', name: 'paper-vol-breakout', state: 'paused', uptime: '—', lastHeartbeat: '12m ago' },
  { id: 'bot3', name: 'shadow-lead-lag', state: 'error', uptime: '0m', lastHeartbeat: '4m ago' },
];

export const KNOWLEDGE: KnowledgeEntry[] = [
  { id: 'k1', title: 'Funding-rate reversion writeup', kind: 'doc', updated: '2026-06-10', tags: ['btc', 'reversion'] },
  { id: 'k2', title: 'Walk-forward harness notes', kind: 'note', updated: '2026-06-09', tags: ['backtest'] },
  { id: 'k3', title: 'Experiment 2026-06-08 vol breakout', kind: 'experiment', updated: '2026-06-08', tags: ['eth', 'breakout'] },
];

export const INFRA: InfraStatus = {
  services: [
    { name: 'office-gateway (mock)', up: true, detail: 'serving fixtures' },
    { name: 'market-data feed', up: true, detail: 'lag 120ms' },
    { name: 'backtest workers', up: true, detail: '3/3 healthy' },
    { name: 'archive store', up: false, detail: 'read-only snapshot' },
  ],
  queues: [
    { name: 'backtest-jobs', depth: 2 },
    { name: 'ingest', depth: 0 },
  ],
  lastSync: '09:41:30',
};

export function cannedBossReply(text: string): string {
  const t = text.toLowerCase();
  if (t.includes('status')) return 'All seven agents are active. Evaluator hit a failed fold; researcher is re-sweeping. (mock)';
  if (t.includes('pause') || t.includes('stop')) return 'No execution authority in Phase 1 — I can only report. Nothing was paused. (mock)';
  return `Acknowledged: "${text}". This is a mock office shell — no trading actions are taken. (mock)`;
}
