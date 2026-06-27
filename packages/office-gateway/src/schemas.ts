import { z } from 'zod';
import type { AgentStatus } from '@trading-office/office-visual-kit';

// AgentStatus' union SSOT is the kit; validate structurally at the wire (string),
// keep the precise union at the type level via z.custom<AgentStatus>().
export const agentStatusSchema = z.custom<AgentStatus>((v) => typeof v === 'string');
export const agentStatusMapSchema = z.record(z.string(), agentStatusSchema);

export const traceLineSchema = z.object({
  ts: z.string(),
  level: z.enum(['debug', 'info', 'warn', 'error']),
  text: z.string(),
});

export const agentActivitySchema = z.object({
  agentId: z.string(),
  status: agentStatusSchema,
  currentTask: z.string().nullable(),
  logs: z.array(traceLineSchema),
});

export const traceReasonCodeSchema = z.enum(['tracing-disabled', 'phoenix-unreachable', 'no-traces']);

export const traceSpanSchema = z.object({
  spanId: z.string(),
  parentSpanId: z.string().nullable(),
  name: z.string(),
  kind: z.enum(['AGENT', 'LLM', 'TOOL', 'CHAIN']),
  startTime: z.string(),
  latencyMs: z.number(),
  status: z.enum(['ok', 'error']),
  llm: z.object({ model: z.string().optional(), tokensIn: z.number().optional(), tokensOut: z.number().optional() }).optional(),
});

export const traceSchema = z.object({
  traceId: z.string(),
  startTime: z.string(),
  status: z.enum(['ok', 'error']),
  latencyMs: z.number(),
  tokens: z.object({ prompt: z.number().optional(), completion: z.number().optional(), total: z.number().optional() }).optional(),
  costUsd: z.number().nullable().optional(),
  rootName: z.string(),
  spans: z.array(traceSpanSchema),
});

export const agentTracesSchema = z.object({
  agentId: z.string(),
  reasonCode: traceReasonCodeSchema.nullable(),
  traces: z.array(traceSchema),
});

export const hypothesisSchema = z.object({
  id: z.string(),
  title: z.string(),
  stage: z.enum(['proposed', 'testing', 'validated', 'rejected']),
  summary: z.string(),
});

export const backtestSummarySchema = z.object({
  id: z.string(),
  strategy: z.string().nullable(),
  symbol: z.string().nullable(),
  period: z.string().nullable(),
  pnlPct: z.number().nullable(),
  sharpe: z.number().nullable(),
  winRatePct: z.number().nullable(),
  maxDrawdownPct: z.number().nullable(),
});

export const botHealthSchema = z.object({
  id: z.string(),
  name: z.string(),
  state: z.enum(['running', 'paused', 'error']),
  uptime: z.string(),
  lastHeartbeat: z.string(),
});

export const knowledgeEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(['doc', 'experiment', 'note']),
  updated: z.string(),
  tags: z.array(z.string()),
});

export const infraServiceSchema = z.object({ name: z.string(), up: z.boolean(), detail: z.string() });

export const infraSourceDomainSchema = z.enum([
  'office-server',
  'trading-lab-read-api',
  'trading-lab-read',
  'trading-lab-stream',
  'knowledge',
  'bot-health',
  'platform-ops-api',
  'platform-runtime',
  'platform-market',
  'platform-execution',
  'platform-coverage',
]);
export const infraSourceStateSchema = z.enum(['live', 'degraded', 'error', 'gap', 'fixture']);
export const infraSourceSchema = z.object({
  domain: infraSourceDomainSchema,
  state: infraSourceStateSchema,
  detail: z.string(),
});

export const infraStatusSchema = z.object({
  services: z.array(infraServiceSchema),
  queues: z.array(z.object({ name: z.string(), depth: z.number() })),
  lastSync: z.string(),
  sources: z.array(infraSourceSchema).optional(),
});

export const operatorMessageSchema = z.object({
  text: z.string(),
  source: z.enum(['web']),
  target: z.enum(['orchestrator']),
  floorId: z.string(),
});
export const operatorMessageAcceptedSchema = z.object({
  operatorMessageId: z.string(),
  conversationId: z.string(),
  status: z.literal('accepted'),
});
export const operatorEvidenceBadgeSchema = z.object({
  kind: z.enum(['interpretation', 'exact_duplicate', 'similar', 'warning']),
  label: z.string(),
  sourceId: z.string().optional(),
});
export const operatorActionSchema = z.object({
  id: z.enum(['confirm', 'cancel']),
  label: z.string(),
  style: z.enum(['primary', 'secondary']),
});
export const operatorConfirmSchema = z.object({
  pendingInteractionId: z.string(),
  sessionId: z.string(),
  decision: z.enum(['confirm', 'cancel']),
});

export const operatorReplySchema = z.object({
  replyMessageId: z.string(),
  operatorMessageId: z.string(),
  conversationId: z.string(),
  text: z.string(),
  ts: z.string(),
  evidence: z.array(operatorEvidenceBadgeSchema).optional(),
  actions: z.array(operatorActionSchema).optional(),
  pendingInteractionId: z.string().optional(),
  sessionId: z.string().optional(),
});

export const officeErrorSchema = z.object({ code: z.string(), message: z.string() });
export const officeErrorBodySchema = z.object({ error: officeErrorSchema });

export const officeEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('agent_statuses_snapshot'), ts: z.string(), statuses: agentStatusMapSchema }),
  z.object({ type: z.literal('agent_status_changed'), ts: z.string(), agentId: z.string(), status: agentStatusSchema }),
  z.object({ type: z.literal('agent_trace_appended'), ts: z.string(), agentId: z.string(), line: traceLineSchema }),
  z.object({ type: z.literal('operator_message_accepted'), ts: z.string(), operatorMessageId: z.string(), conversationId: z.string() }),
  z.object({ type: z.literal('operator_message_progress'), ts: z.string(), operatorMessageId: z.string(), conversationId: z.string(), replyMessageId: z.string(), stage: z.string().optional(), note: z.string().optional() }),
  z.object({ type: z.literal('operator_message_delta'), ts: z.string(), operatorMessageId: z.string(), conversationId: z.string(), replyMessageId: z.string(), textDelta: z.string() }),
  z.object({ type: z.literal('operator_message_completed'), ts: z.string(), operatorMessageId: z.string(), conversationId: z.string(), replyMessageId: z.string(), reply: operatorReplySchema }),
  z.object({ type: z.literal('operator_message_failed'), ts: z.string(), operatorMessageId: z.string(), conversationId: z.string(), replyMessageId: z.string().optional(), error: officeErrorSchema }),
  z.object({
    type: z.literal('operator_assistant_message'),
    ts: z.string(),
    operatorMessageId: z.string(),
    conversationId: z.string(),
    reply: operatorReplySchema,
  }),
  z.object({ type: z.literal('system_notice'), ts: z.string(), level: z.enum(['info', 'warn', 'error']), text: z.string() }),
  z.object({ type: z.literal('office_error'), ts: z.string(), error: officeErrorSchema }),
  z.object({ type: z.literal('heartbeat'), ts: z.string() }),
]);
