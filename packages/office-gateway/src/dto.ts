import type { z } from 'zod';
import type { AgentStatus } from '@trading-office/office-visual-kit';
import type {
  agentStatusMapSchema,
  traceLineSchema,
  agentActivitySchema,
  traceReasonCodeSchema,
  traceSpanSchema,
  traceSchema,
  agentTracesSchema,
  hypothesisSchema,
  backtestSummarySchema,
  botHealthSchema,
  knowledgeEntrySchema,
  infraServiceSchema,
  infraSourceDomainSchema,
  infraSourceStateSchema,
  infraSourceSchema,
  infraStatusSchema,
  operatorMessageSchema,
  operatorMessageAcceptedSchema,
  operatorReplySchema,
  operatorConfirmSchema,
  operatorEvidenceBadgeSchema,
  operatorActionSchema,
} from './schemas';

export type { AgentStatus };
export type AgentStatusMap = z.infer<typeof agentStatusMapSchema>;
export type TraceLine = z.infer<typeof traceLineSchema>;
export type AgentActivity = z.infer<typeof agentActivitySchema>;
export type TraceReasonCode = z.infer<typeof traceReasonCodeSchema>;
export type TraceSpan = z.infer<typeof traceSpanSchema>;
export type Trace = z.infer<typeof traceSchema>;
export type AgentTraces = z.infer<typeof agentTracesSchema>;
export type Hypothesis = z.infer<typeof hypothesisSchema>;
export type BacktestSummary = z.infer<typeof backtestSummarySchema>;
export type BotHealth = z.infer<typeof botHealthSchema>;
export type KnowledgeEntry = z.infer<typeof knowledgeEntrySchema>;
export type InfraService = z.infer<typeof infraServiceSchema>;
export type InfraSourceDomain = z.infer<typeof infraSourceDomainSchema>;
export type InfraSourceState = z.infer<typeof infraSourceStateSchema>;
export type InfraSource = z.infer<typeof infraSourceSchema>;
export type InfraStatus = z.infer<typeof infraStatusSchema>;
export type OperatorMessage = z.infer<typeof operatorMessageSchema>;
export type OperatorMessageAccepted = z.infer<typeof operatorMessageAcceptedSchema>;
export type OperatorReply = z.infer<typeof operatorReplySchema>;
export type OperatorConfirm = z.infer<typeof operatorConfirmSchema>;
export type OperatorEvidenceBadge = z.infer<typeof operatorEvidenceBadgeSchema>;
export type OperatorAction = z.infer<typeof operatorActionSchema>;
