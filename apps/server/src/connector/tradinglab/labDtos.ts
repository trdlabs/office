// Hand-mirrored from trading-lab — DO NOT import the trading-lab package.
// Only the fields the office actually reads are declared.

export type LabAgentId = 'analyst' | 'researcher' | 'critic' | 'builder' | 'system';
export type LabLifecycle = 'idle' | 'working' | 'succeeded' | 'failed';

export interface LabAgentEvent {
  id: string;
  ts: string;
  type: string;
  taskId: string;
  correlationId?: string;
  level: 'info' | 'warn' | 'error';
  summary: string;
  payloadSummary?: Record<string, unknown>;
}

export interface LabAgentSummary {
  agentId: LabAgentId;
  status: LabLifecycle;
  currentTaskId: string | null;
  lastEvent: LabAgentEvent | null;
}

export interface LabAgentActivity {
  agentId: LabAgentId;
  status: LabLifecycle;
  currentTask: { id: string; type: string; status: LabLifecycle } | null;
  trace: LabAgentEvent[];
}

export interface LabExpectedEffect {
  metric: string;
  direction: 'increase' | 'decrease';
  magnitude?: string;
}

export interface LabHypothesisListItem {
  id: string;
  profileId: string;
  thesis: string;
  targetBehavior: string;
  status: 'validated' | 'rejected';
  confidence: number;
  expectedEffect: LabExpectedEffect;
  createdAt: string;
  updatedAt: string;
}

export interface LabBacktestMetrics {
  netPnlUsd: number | null;
  netPnlPct: number | null;
  totalTrades: number | null;
  winRate: number | null;
  profitFactor: number | null;
  maxDrawdownPct: number | null;
  expectancyUsd: number | null;
  sharpe: number | null;
  topTradeContributionPct: number | null;
}

export interface LabBacktest {
  id: string;
  hypothesisId: string;
  status: string;
  metrics: LabBacktestMetrics;
  submittedAt: string;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// List envelopes (note the two shapes).
export interface LabPageEnvelope<T> {
  data: T[];
  page: { nextCursor: string | null; limit: number };
}
export interface LabCursorEnvelope<T> {
  data: T[];
  cursor: string | null;
}

// Chat ingress response — discriminated on `kind`. TaskStatus terminal = completed|failed|rejected.
export type LabTaskStatus = 'accepted' | 'queued' | 'running' | 'completed' | 'failed' | 'rejected';
export type LabChatResponse =
  | { kind: 'task_created'; sessionId: string; taskId: string; taskType: string; status: LabTaskStatus; plannedNextStep?: { taskType: string; after: string } }
  | { kind: 'task_status'; sessionId: string; taskId: string; status: LabTaskStatus }
  | { kind: 'needs_clarification'; sessionId: string; question: string; missing: string[] }
  | { kind: 'out_of_scope'; sessionId: string; message: string }
  | { kind: 'capability_not_available'; sessionId: string; capability: string; message: string }
  | { kind: 'help'; sessionId: string; message: string; supportedIntents: string[] }
  | { kind: 'rejected'; sessionId: string; reason: string; issues?: unknown[] }
  | { kind: 'error'; sessionId: string; message: string };

export interface LabHealth { status: 'ok' }
export interface LabReady { status: 'ok' | 'degraded'; checks: { db: boolean } }
