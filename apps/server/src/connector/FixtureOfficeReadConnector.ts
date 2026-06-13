import {
  agentActivity,
  BACKTESTS,
  BOTS,
  HYPOTHESES,
  INFRA,
  INITIAL_STATUSES,
  KNOWLEDGE,
} from '@trading-office/office-fixtures';
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
import type { OfficeServerConfig } from '../config';
import { createFixtureEventProducer } from '../events/fixtureEventProducer';
import type { OfficeReadConnector } from './OfficeReadConnector';

export class FixtureOfficeReadConnector implements OfficeReadConnector {
  constructor(private readonly config: OfficeServerConfig) {}

  private delay<T>(value: T): Promise<T> {
    const ms = this.config.fixtureLatencyMs;
    return ms > 0 ? new Promise((r) => setTimeout(() => r(value), ms)) : Promise.resolve(value);
  }

  getAgentStatuses(): Promise<AgentStatusMap> { return this.delay({ ...INITIAL_STATUSES }); }
  getAgentActivity(agentId: string): Promise<AgentActivity> { return this.delay(agentActivity(agentId)); }
  getHypotheses(): Promise<Hypothesis[]> { return this.delay(HYPOTHESES); }
  getBacktests(): Promise<BacktestSummary[]> { return this.delay(BACKTESTS); }
  getBotHealth(): Promise<BotHealth[]> { return this.delay(BOTS); }
  getKnowledge(): Promise<KnowledgeEntry[]> { return this.delay(KNOWLEDGE); }
  getInfraStatus(): Promise<InfraStatus> { return this.delay(INFRA); }

  start(emit: (e: OfficeEvent) => void): () => void {
    return createFixtureEventProducer(emit, this.config.eventTickMs);
  }
}
