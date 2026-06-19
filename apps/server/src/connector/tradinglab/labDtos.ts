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
// Credential probe (GET /v1/authz) — auth-gated, so a 200 confirms the read token is accepted.
export interface LabAuthz { status: 'ok' }

// Completion summary — hand-mirrored from trading-lab CompletionSummary contract (lab spec §4).
// Returned by GET /v1/tasks/:taskId/completion-summary. Only fields the office renders are declared.
export interface LabProfileRef { id: string; coreIdea: string; direction: string }
export interface LabHypothesisRef { id: string; thesis: string; confidence: number | null; status: string | null }
export interface LabCompletionMetrics {
  netPnlUsd: number | null; netPnlPct: number | null; winRate: number | null;
  profitFactor: number | null; maxDrawdownPct: number | null; sharpe: number | null; totalTrades: number | null;
}
export interface LabSummaryLinks { taskId: string; profileId?: string; hypothesisId?: string; backtestRunId?: string }
export type LabCompletionDecision = 'PASS' | 'FAIL' | 'MODIFY' | 'INCONCLUSIVE' | 'PAPER_CANDIDATE';

export type LabCompletionSummary =
  | { kind: 'strategy.onboard'; taskId: string; status: string;
      profile: LabProfileRef | null; nextStep?: { taskType: string }; links: LabSummaryLinks; warnings: string[] }
  | { kind: 'research.run_cycle'; taskId: string; status: string; profile: LabProfileRef | null;
      counts: { proposed: number; validated: number; rejected: number; deduped: number; criticReviews: number; backtestsEnqueued: number };
      topHypotheses: LabHypothesisRef[]; nextStep?: { taskType: string }; links: LabSummaryLinks; warnings: string[] }
  | { kind: 'backtest.completed'; taskId: string; status: string; profile: LabProfileRef | null;
      hypothesis: LabHypothesisRef | null; decision: LabCompletionDecision;
      metrics: LabCompletionMetrics; reasons: string[]; willRetry: boolean; links: LabSummaryLinks; warnings: string[] };
