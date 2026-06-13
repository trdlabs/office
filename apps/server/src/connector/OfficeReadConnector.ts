import type {
  AgentActivity,
  AgentStatusMap,
  BacktestSummary,
  BotHealth,
  Hypothesis,
  InfraStatus,
  KnowledgeEntry,
  OfficeEvent,
} from '@trading-office/office-gateway';

/**
 * The office's single read boundary. READ-ONLY BY DESIGN: there is no write /
 * execute / command method, so the office cannot command an agent system —
 * the no-execution-authority guarantee is structural (enforced by this type).
 *
 * Phase 3 implements this same port as a CompositeOfficeConnector composing a
 * TradingLabReadConnector + a read-only PlatformMonitoringConnector.
 */
export interface OfficeReadConnector {
  getAgentStatuses(): Promise<AgentStatusMap>;
  getAgentActivity(agentId: string): Promise<AgentActivity>;
  getHypotheses(): Promise<Hypothesis[]>;
  getBacktests(): Promise<BacktestSummary[]>;
  getBotHealth(): Promise<BotHealth[]>;
  getKnowledge(): Promise<KnowledgeEntry[]>;
  getInfraStatus(): Promise<InfraStatus>;
  /** Begin the live event source; returns a stop function. */
  start(emit: (e: OfficeEvent) => void): () => void;
}
