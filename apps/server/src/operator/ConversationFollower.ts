import type { OfficeEvent, OperatorReply } from '@trading-office/office-gateway';
import type { LabAgentEvent } from '../connector/tradinglab/labDtos';
import type { TradingLabHttpClient } from '../connector/tradinglab/TradingLabHttpClient';
import type { TradingLabStreamBridge } from '../connector/tradinglab/TradingLabStreamBridge';
import { successTypesFor, isFailureType } from '../connector/tradinglab/terminalTaxonomy';
import { isNoiseEventType } from './summaryFilter';

export interface FollowerIds { operatorMessageId: string; conversationId: string; replyMessageId: string }
export interface FollowerGuards {
  maxMs: number;
  idleMs: number;
  maxDeltas: number;
  bootstrapRetries: number;
  bootstrapIntervalMs: number;
}
export interface ConversationFollowerDeps {
  ids: FollowerIds;
  taskId: string;
  taskType?: string;
  /** When the chat response carried plannedNextStep, the chained task's type. Presence means a chain
   *  is expected: the ORIGINAL task's success-terminal advances (streamed as a progress delta) to
   *  waiting for THIS type's terminal, instead of completing the turn. */
  nextTaskType?: string;
  emit: (e: OfficeEvent) => void;
  client: Pick<TradingLabHttpClient, 'getAgentEvents'>;
  bridge: Pick<TradingLabStreamBridge, 'subscribeAppended'>;
  guards: FollowerGuards;
  now?: () => string;
  sleep?: (ms: number) => Promise<void>;
  schedule?: (ms: number, cb: () => void) => () => void;
}

export class ConversationFollower {
  private readonly now: () => string;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly schedule: (ms: number, cb: () => void) => () => void;
  private done = false;
  private deltaCount = 0;
  private chainAdvanced = false;
  private readonly accumulated: string[] = [];

  constructor(private readonly deps: ConversationFollowerDeps) {
    this.now = deps.now ?? (() => new Date().toISOString());
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.schedule = deps.schedule ?? ((ms, cb) => { const h = setTimeout(cb, ms); return () => clearTimeout(h); });
  }

  async run(): Promise<void> {
    const correlationId = await this.bootstrap();
    if (this.done) return;
    if (!correlationId) {
      this.finishCompleted('Live task progress is unavailable.');
      return;
    }
    await this.follow(correlationId);
  }

  // Liveness: each getAgentEvents poll is bounded by TradingLabHttpClient's per-request timeout
  // (requestTimeoutMs) — a hung upstream aborts and we retry, so bootstrap cannot hang forever.
  // After bootstrapRetries without a correlationId we degrade honestly (run() → "unavailable").
  private async bootstrap(): Promise<string | undefined> {
    for (let i = 0; i < this.deps.guards.bootstrapRetries && !this.done; i++) {
      try {
        const { data } = await this.deps.client.getAgentEvents({ taskId: this.deps.taskId });
        const hit = data.find((e) => e.correlationId);
        if (hit?.correlationId) return hit.correlationId;
      } catch {
        /* retry */
      }
      await this.sleep(this.deps.guards.bootstrapIntervalMs);
    }
    return undefined;
  }

  private follow(correlationId: string): Promise<void> {
    return new Promise<void>((resolve) => {
      let unsub: () => void = () => {};
      let cancelIdle: () => void = () => {};
      const finish = (fn: () => void): void => {
        if (this.done) return;
        fn();
        cancelMax();
        cancelIdle();
        unsub();
        resolve();
      };
      const resetIdle = (): void => {
        cancelIdle();
        cancelIdle = this.schedule(this.deps.guards.idleMs, () => finish(() => this.finishCompleted('live progress stream ended')));
      };
      const cancelMax = this.schedule(this.deps.guards.maxMs, () => finish(() => this.finishCompleted('live progress stream ended')));

      unsub = this.deps.bridge.subscribeAppended((e: LabAgentEvent) => {
        if (this.done) return;
        if (e.correlationId !== correlationId) return; // explicit-field correlation ONLY
        resetIdle();
        if (isFailureType(e.type)) {
          finish(() => this.finishFailed(e.summary));
          return;
        }
        // Success-terminal detection against the CURRENTLY expected task type (the original task, or —
        // after a planned chain advances — the chained task). For a planned chain, the original task's
        // terminal does NOT complete: it streams as a progress delta and we advance to await the chained
        // task's terminal. We never assert success for a chained task whose terminal type is unknown.
        const expectedType = this.chainAdvanced ? this.deps.nextTaskType : this.deps.taskType;
        if (expectedType && successTypesFor(expectedType).includes(e.type)) {
          if (this.deps.nextTaskType && !this.chainAdvanced) {
            this.chainAdvanced = true;
            this.emitDelta(e.summary);
            return;
          }
          finish(() => this.finishCompleted());
          return;
        }
        if (!isNoiseEventType(e.type)) {
          this.emitDelta(e.summary);
          if (this.deltaCount >= this.deps.guards.maxDeltas) {
            finish(() => this.finishCompleted('live progress stream ended'));
          }
        }
      });

      resetIdle();
    });
  }

  private emitDelta(text: string): void {
    this.accumulated.push(text);
    this.deltaCount++;
    this.deps.emit({
      type: 'operator_message_delta',
      ts: this.now(),
      operatorMessageId: this.deps.ids.operatorMessageId,
      conversationId: this.deps.ids.conversationId,
      replyMessageId: this.deps.ids.replyMessageId,
      textDelta: `${text}\n`,
    });
  }

  private finishCompleted(extra?: string): void {
    this.done = true;
    const body = this.accumulated.join('\n');
    const text = [body, extra].filter(Boolean).join(body && extra ? ' · ' : '') || 'Done.';
    const reply: OperatorReply = {
      replyMessageId: this.deps.ids.replyMessageId,
      operatorMessageId: this.deps.ids.operatorMessageId,
      conversationId: this.deps.ids.conversationId,
      text,
      ts: this.now(),
    };
    this.deps.emit({
      type: 'operator_message_completed',
      ts: this.now(),
      operatorMessageId: this.deps.ids.operatorMessageId,
      conversationId: this.deps.ids.conversationId,
      replyMessageId: this.deps.ids.replyMessageId,
      reply,
    });
  }

  private finishFailed(message: string): void {
    this.done = true;
    this.deps.emit({
      type: 'operator_message_failed',
      ts: this.now(),
      operatorMessageId: this.deps.ids.operatorMessageId,
      conversationId: this.deps.ids.conversationId,
      replyMessageId: this.deps.ids.replyMessageId,
      error: { code: 'task_failed', message },
    });
  }
}
