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
  /** True when the chat response carried plannedNextStep: a chain is expected, so the first task's
   *  success-terminal is NOT the plan's terminal — keep streaming and finish honestly via guard. */
  expectChain?: boolean;
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
        // A planned chain (expectChain) means the first task's success-terminal is NOT plan-complete;
        // keep streaming the chained task's deltas and let the guard finish honestly (we don't know the
        // chained task's terminal type, so we never assert success on its behalf).
        if (!this.deps.expectChain && this.deps.taskType && successTypesFor(this.deps.taskType).includes(e.type)) {
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
