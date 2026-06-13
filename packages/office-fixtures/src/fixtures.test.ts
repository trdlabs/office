import { describe, expect, it } from 'vitest';
import {
  agentStatusMapSchema,
  hypothesisSchema,
  backtestSummarySchema,
  botHealthSchema,
  knowledgeEntrySchema,
  infraStatusSchema,
  agentActivitySchema,
} from '@trading-office/office-gateway';
import { INITIAL_STATUSES, HYPOTHESES, BACKTESTS, BOTS, KNOWLEDGE, INFRA, agentActivity } from './index';

describe('fixtures are valid wire payloads', () => {
  it('INITIAL_STATUSES', () => { expect(() => agentStatusMapSchema.parse(INITIAL_STATUSES)).not.toThrow(); });
  it('HYPOTHESES', () => { for (const h of HYPOTHESES) expect(() => hypothesisSchema.parse(h)).not.toThrow(); });
  it('BACKTESTS', () => { for (const b of BACKTESTS) expect(() => backtestSummarySchema.parse(b)).not.toThrow(); });
  it('BOTS', () => { for (const b of BOTS) expect(() => botHealthSchema.parse(b)).not.toThrow(); });
  it('KNOWLEDGE', () => { for (const k of KNOWLEDGE) expect(() => knowledgeEntrySchema.parse(k)).not.toThrow(); });
  it('INFRA', () => { expect(() => infraStatusSchema.parse(INFRA)).not.toThrow(); });
  it('agentActivity(any)', () => { expect(() => agentActivitySchema.parse(agentActivity('researcher'))).not.toThrow(); });
});
