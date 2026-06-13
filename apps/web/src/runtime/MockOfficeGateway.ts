import type { OfficeGateway } from './OfficeGateway';
import type {
  AgentActivity,
  AgentStatusMap,
  BacktestSummary,
  BossMessage,
  BotHealth,
  Hypothesis,
  InfraStatus,
  KnowledgeEntry,
} from './types';
import {
  agentActivity,
  BACKTESTS,
  BOTS,
  cannedBossReply,
  HYPOTHESES,
  INFRA,
  INITIAL_STATUSES,
  KNOWLEDGE,
  STATUS_POOLS,
} from './fixtures';

export class MockOfficeGateway implements OfficeGateway {
  private readonly latencyMs: number;
  private readonly tickMs: number;
  private seq = 0;

  constructor(opts: { latencyMs?: number; tickMs?: number } = {}) {
    this.latencyMs = opts.latencyMs ?? 220;
    this.tickMs = opts.tickMs ?? 2600;
  }

  private delay<T>(value: T): Promise<T> {
    if (this.latencyMs <= 0) return Promise.resolve(value);
    return new Promise((resolve) => setTimeout(() => resolve(value), this.latencyMs));
  }

  getAgentActivity(agentId: string): Promise<AgentActivity> {
    return this.delay(agentActivity(agentId));
  }
  getHypotheses(): Promise<Hypothesis[]> {
    return this.delay(HYPOTHESES);
  }
  getBacktests(): Promise<BacktestSummary[]> {
    return this.delay(BACKTESTS);
  }
  getBotHealth(): Promise<BotHealth[]> {
    return this.delay(BOTS);
  }
  getKnowledge(): Promise<KnowledgeEntry[]> {
    return this.delay(KNOWLEDGE);
  }
  getInfraStatus(): Promise<InfraStatus> {
    return this.delay(INFRA);
  }

  sendBossCommand(text: string): Promise<BossMessage> {
    // INERT: returns a canned transcript reply only. No side effects.
    this.seq += 1;
    const msg: BossMessage = {
      id: `m${this.seq}`,
      role: 'assistant',
      text: cannedBossReply(text),
      ts: '09:42:00',
    };
    return this.delay(msg);
  }

  subscribeAgentStatuses(cb: (statuses: AgentStatusMap) => void): () => void {
    const ids = Object.keys(STATUS_POOLS);
    let tick = 0;
    const timer = setInterval(() => {
      tick += 1;
      const next: AgentStatusMap = { ...INITIAL_STATUSES };
      for (const id of ids) {
        const pool = STATUS_POOLS[id]!;
        next[id] = pool[tick % pool.length]!;
      }
      cb(next);
    }, this.tickMs);
    return () => clearInterval(timer);
  }
}
