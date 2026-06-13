import type { OfficeGateway } from './OfficeGateway';
import type {
  AgentActivity,
  AgentStatusMap,
  BacktestSummary,
  BotHealth,
  Hypothesis,
  InfraStatus,
  KnowledgeEntry,
  OfficeEvent,
  OperatorMessage,
  OperatorMessageAccepted,
} from './types';
import {
  agentActivity,
  BACKTESTS,
  BOTS,
  HYPOTHESES,
  INFRA,
  INITIAL_STATUSES,
  KNOWLEDGE,
  operatorReplyChunks,
  STATUS_POOLS,
} from '@trading-office/office-fixtures';

const nowIso = (): string => new Date().toISOString();

export class MockOfficeGateway implements OfficeGateway {
  private readonly latencyMs: number;
  private readonly tickMs: number;
  private counter = 0;
  private readonly subscribers = new Set<(e: OfficeEvent) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private tick = 0;

  constructor(opts: { latencyMs?: number; tickMs?: number } = {}) {
    this.latencyMs = opts.latencyMs ?? 220;
    this.tickMs = opts.tickMs ?? 2600;
  }

  private delay<T>(value: T): Promise<T> {
    return this.latencyMs <= 0 ? Promise.resolve(value) : new Promise((r) => setTimeout(() => r(value), this.latencyMs));
  }
  private emit(e: OfficeEvent): void { for (const fn of this.subscribers) fn(e); }

  getAgentStatuses(): Promise<AgentStatusMap> { return this.delay({ ...INITIAL_STATUSES }); }
  getAgentActivity(agentId: string): Promise<AgentActivity> { return this.delay(agentActivity(agentId)); }
  getHypotheses(): Promise<Hypothesis[]> { return this.delay(HYPOTHESES); }
  getBacktests(): Promise<BacktestSummary[]> { return this.delay(BACKTESTS); }
  getBotHealth(): Promise<BotHealth[]> { return this.delay(BOTS); }
  getKnowledge(): Promise<KnowledgeEntry[]> { return this.delay(KNOWLEDGE); }
  getInfraStatus(): Promise<InfraStatus> { return this.delay(INFRA); }

  sendOperatorMessage(msg: OperatorMessage): Promise<OperatorMessageAccepted> {
    const k = ++this.counter;
    const operatorMessageId = `m${k}`;
    const conversationId = `c${k}`;
    const replyMessageId = `r${k}`;
    this.emit({ type: 'operator_message_accepted', ts: nowIso(), operatorMessageId, conversationId });
    const chunks = operatorReplyChunks(msg.text);
    let acc = '';
    chunks.forEach((chunk, i) => setTimeout(() => {
      acc += chunk;
      this.emit({ type: 'operator_message_delta', ts: nowIso(), operatorMessageId, conversationId, replyMessageId, textDelta: chunk });
      if (i === chunks.length - 1) {
        this.emit({ type: 'operator_message_completed', ts: nowIso(), operatorMessageId, conversationId, replyMessageId, reply: { replyMessageId, operatorMessageId, conversationId, text: acc, ts: nowIso() } });
      }
    }, (i + 1) * 120));
    return this.delay({ operatorMessageId, conversationId, status: 'accepted' });
  }

  subscribeOfficeEvents(cb: (e: OfficeEvent) => void): () => void {
    this.subscribers.add(cb);
    cb({ type: 'agent_statuses_snapshot', ts: nowIso(), statuses: { ...INITIAL_STATUSES } });
    if (!this.timer) this.timer = setInterval(() => this.tickStatuses(), this.tickMs);
    return () => {
      this.subscribers.delete(cb);
      if (this.subscribers.size === 0 && this.timer) { clearInterval(this.timer); this.timer = null; }
    };
  }

  private tickStatuses(): void {
    this.tick += 1;
    for (const id of Object.keys(STATUS_POOLS)) {
      const pool = STATUS_POOLS[id]!;
      this.emit({ type: 'agent_status_changed', ts: nowIso(), agentId: id, status: pool[this.tick % pool.length]! });
    }
  }
}
