import type { AgentStatusMap, AgentActivity, Hypothesis, BacktestSummary } from '@trading-office/office-gateway';
import type { TradingLabHttpClient } from './TradingLabHttpClient';
import { mapAgentStatuses, mapAgentActivity, mapHypothesis, mapBacktest } from './mappers';

export class TradingLabReadConnector {
  constructor(private readonly client: TradingLabHttpClient) {}

  async getAgentStatuses(): Promise<AgentStatusMap> {
    const { data } = await this.client.getAgents();
    return mapAgentStatuses(data);
  }
  async getAgentActivity(agentId: string): Promise<AgentActivity> {
    return mapAgentActivity(await this.client.getAgent(agentId));
  }
  async getHypotheses(): Promise<Hypothesis[]> {
    const { data } = await this.client.getHypotheses();
    return data.map(mapHypothesis);
  }
  async getBacktests(): Promise<BacktestSummary[]> {
    const { data } = await this.client.getBacktests();
    return data.map(mapBacktest);
  }
}
