// Single source of truth for the status union lives in the kit; re-export it
// here so panels/store/gateway share exactly what scene.setAgentStatus expects.
import type { AgentStatus } from '@trading-office/office-visual-kit';

export type { AgentStatus };
export type AgentStatusMap = Record<string, AgentStatus>;

export interface TraceLine {
  ts: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  text: string;
}

export interface AgentActivity {
  agentId: string;
  status: AgentStatus;
  currentTask: string | null;
  logs: TraceLine[];
}

export interface Hypothesis {
  id: string;
  title: string;
  stage: 'proposed' | 'testing' | 'validated' | 'rejected';
  summary: string;
}

export interface BacktestSummary {
  id: string;
  strategy: string;
  symbol: string;
  period: string;
  pnlPct: number;
  sharpe: number;
  winRatePct: number;
  maxDrawdownPct: number;
}

export interface BotHealth {
  id: string;
  name: string;
  state: 'running' | 'paused' | 'error';
  uptime: string;
  lastHeartbeat: string;
}

export interface KnowledgeEntry {
  id: string;
  title: string;
  kind: 'doc' | 'experiment' | 'note';
  updated: string;
  tags: string[];
}

export interface InfraService {
  name: string;
  up: boolean;
  detail: string;
}

export interface InfraStatus {
  services: InfraService[];
  queues: { name: string; depth: number }[];
  lastSync: string;
}

export interface BossMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  ts: string;
}
