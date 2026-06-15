import type { OfficeReadConnector } from './OfficeReadConnector';
import type {
  OfficeEvent, AgentStatusMap, AgentActivity, Hypothesis, BacktestSummary, BotHealth, KnowledgeEntry, InfraStatus,
} from '@trading-office/office-gateway';
import type { TradingLabReadConnector } from './tradinglab/TradingLabReadConnector';
import type { InfraAggregator } from './InfraAggregator';
import type { PlatformMonitoringConnector } from './platform/PlatformMonitoringConnector';

export interface CompositeDeps {
  read: Pick<TradingLabReadConnector, 'getAgentStatuses' | 'getAgentActivity' | 'getHypotheses' | 'getBacktests'>;
  infra: Pick<InfraAggregator, 'getInfraStatus'>;
  /** M2 injects the real SSE bridge; M1 passes a no-op. */
  startBridge: (emit: (e: OfficeEvent) => void) => () => void;
  platform?: Pick<PlatformMonitoringConnector, 'getBotHealth'>;
}

export class CompositeOfficeReadConnector implements OfficeReadConnector {
  constructor(private readonly deps: CompositeDeps) {}

  getAgentStatuses(): Promise<AgentStatusMap> { return this.deps.read.getAgentStatuses(); }
  getAgentActivity(agentId: string): Promise<AgentActivity> { return this.deps.read.getAgentActivity(agentId); }
  getHypotheses(): Promise<Hypothesis[]> { return this.deps.read.getHypotheses(); }
  getBacktests(): Promise<BacktestSummary[]> { return this.deps.read.getBacktests(); }

  // Honest gaps — no fixtures in trading-lab mode.
  async getKnowledge(): Promise<KnowledgeEntry[]> { return []; }
  async getBotHealth(): Promise<BotHealth[]> {
    return this.deps.platform ? this.deps.platform.getBotHealth() : [];
  }

  getInfraStatus(): Promise<InfraStatus> { return this.deps.infra.getInfraStatus(); }

  start(emit: (e: OfficeEvent) => void): () => void { return this.deps.startBridge(emit); }
}
