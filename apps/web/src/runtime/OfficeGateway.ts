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

/**
 * The single boundary the browser crosses for office data. Read-only except
 * sendBossCommand, which in Phase 1 is INERT (mock transcript only — no side
 * effects, no trading/platform actions). Phase 2 swaps the implementation for
 * a real office-gateway client; no panel changes required.
 */
export interface OfficeGateway {
  getAgentActivity(agentId: string): Promise<AgentActivity>;
  getHypotheses(): Promise<Hypothesis[]>;
  getBacktests(): Promise<BacktestSummary[]>;
  getBotHealth(): Promise<BotHealth[]>;
  getKnowledge(): Promise<KnowledgeEntry[]>;
  getInfraStatus(): Promise<InfraStatus>;
  sendBossCommand(text: string): Promise<BossMessage>;
  subscribeAgentStatuses?(cb: (statuses: AgentStatusMap) => void): () => void;
}
