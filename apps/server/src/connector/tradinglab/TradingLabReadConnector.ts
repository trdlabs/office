import type { AgentStatusMap, AgentActivity, Hypothesis, BacktestSummary } from '@trading-office/office-gateway';
import type { TradingLabHttpClient } from './TradingLabHttpClient';
import { mapAgentStatuses, mapAgentActivity, mapHypothesis, mapBacktest, mapOfficeAgentIdToLab, NO_LAB_SOURCE_AGENTS } from './mappers';

export class TradingLabReadConnector {
  constructor(
    private readonly client: TradingLabHttpClient,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async getAgentStatuses(): Promise<AgentStatusMap> {
    const { data } = await this.client.getAgents();
    const statuses = mapAgentStatuses(data);
    // Documented no-source office agents → honest idle, so the floor doesn't keep a misleading initial status.
    for (const id of NO_LAB_SOURCE_AGENTS) {
      if (!(id in statuses)) statuses[id] = 'idle';
    }
    return statuses;
  }
  async getAgentActivity(agentId: string): Promise<AgentActivity> {
    const labId = mapOfficeAgentIdToLab(agentId);
    if (!labId) {
      // No trading-lab source for this office agent (e.g. evaluator, perf-monitor) — honest gap, NO lab call.
      return {
        agentId,
        status: 'idle',
        currentTask: null,
        logs: [{ ts: this.now(), level: 'info', text: 'No trading-lab source connected yet' }],
      };
    }
    // mapAgentActivity maps the lab agentId back to the office id (e.g. system → boss).
    return mapAgentActivity(await this.client.getAgent(labId));
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
