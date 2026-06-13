import type { AgentActivity, AgentStatus } from '@trading-office/office-gateway';
import { INITIAL_STATUSES } from './snapshots';

/** Plausible status loops per agent for the simulated event producer. */
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
  const status: AgentStatus = INITIAL_STATUSES[agentId] ?? 'idle';
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
