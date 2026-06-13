import type { z } from 'zod';
import type { AgentStatus } from '@trading-office/office-visual-kit';
import type {
  agentStatusMapSchema,
  traceLineSchema,
  agentActivitySchema,
  hypothesisSchema,
  backtestSummarySchema,
  botHealthSchema,
  knowledgeEntrySchema,
  infraServiceSchema,
  infraStatusSchema,
  operatorMessageSchema,
  operatorMessageAcceptedSchema,
  operatorReplySchema,
} from './schemas';

export type { AgentStatus };
export type AgentStatusMap = z.infer<typeof agentStatusMapSchema>;
export type TraceLine = z.infer<typeof traceLineSchema>;
export type AgentActivity = z.infer<typeof agentActivitySchema>;
export type Hypothesis = z.infer<typeof hypothesisSchema>;
export type BacktestSummary = z.infer<typeof backtestSummarySchema>;
export type BotHealth = z.infer<typeof botHealthSchema>;
export type KnowledgeEntry = z.infer<typeof knowledgeEntrySchema>;
export type InfraService = z.infer<typeof infraServiceSchema>;
export type InfraStatus = z.infer<typeof infraStatusSchema>;
export type OperatorMessage = z.infer<typeof operatorMessageSchema>;
export type OperatorMessageAccepted = z.infer<typeof operatorMessageAcceptedSchema>;
export type OperatorReply = z.infer<typeof operatorReplySchema>;
