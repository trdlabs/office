import type { LabAgentEvent, LabCompletionSummary } from '../connector/tradinglab/labDtos';
import type { OfficeEvent } from '@trading-office/office-gateway';

const FALLBACK_TEXT = 'Бэктест гипотезы завершён.';

export interface BacktestWatchGuards {
  idleMs: number;
  maxMs: number;
  bootstrapRetries: number;
  bootstrapIntervalMs: number;
  summaryRetries: number;
  summaryIntervalMs: number;
}

export interface DownstreamBacktestWatcherDeps {
  bridge: { subscribeAppended(cb: (e: LabAgentEvent) => void): () => void };
  client: {
    getAgentEvents(q: { taskId: string }): Promise<LabAgentEvent[]>;
    getCompletionSummary(taskId: string): Promise<LabCompletionSummary | null>;
  };
  bus: { publish(e: OfficeEvent): void };
  newIds: () => { operatorMessageId: string; replyMessageId: string };
  render: (s: LabCompletionSummary) => string;
  guards: BacktestWatchGuards;
}

export interface DownstreamBacktestWatcher {
  register(runCycleTaskId: string, conversationId: string): void;
  stop(): void;
}

interface Registration {
  conversationId: string;
  correlationId?: string;
  seen: Set<string>;
  idleTimer?: ReturnType<typeof setTimeout>;
  maxTimer?: ReturnType<typeof setTimeout>;
  done: boolean;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createDownstreamBacktestWatcher(deps: DownstreamBacktestWatcherDeps): DownstreamBacktestWatcher {
  const { guards } = deps;
  const regs = new Map<string, Registration>();
  const unsub = deps.bridge.subscribeAppended(onEvent);

  function teardown(taskId: string): void {
    const reg = regs.get(taskId);
    if (!reg) return;
    reg.done = true;
    if (reg.idleTimer) clearTimeout(reg.idleTimer);
    if (reg.maxTimer) clearTimeout(reg.maxTimer);
    regs.delete(taskId);
  }

  function armIdle(taskId: string, reg: Registration): void {
    if (reg.idleTimer) clearTimeout(reg.idleTimer);
    reg.idleTimer = setTimeout(() => teardown(taskId), guards.idleMs);
  }

  function register(runCycleTaskId: string, conversationId: string): void {
    if (regs.has(runCycleTaskId)) return;
    const reg: Registration = { conversationId, seen: new Set(), done: false };
    reg.maxTimer = setTimeout(() => teardown(runCycleTaskId), guards.maxMs);
    armIdle(runCycleTaskId, reg);
    regs.set(runCycleTaskId, reg);
    void bootstrap(runCycleTaskId, reg);
  }

  async function bootstrap(taskId: string, reg: Registration): Promise<void> {
    for (let i = 0; i <= guards.bootstrapRetries && !reg.done; i++) {
      const events = await deps.client.getAgentEvents({ taskId }).catch(() => []);
      const cid = events.find((e) => e.correlationId)?.correlationId;
      if (cid) { reg.correlationId = cid; return; }
      if (i < guards.bootstrapRetries) await sleep(guards.bootstrapIntervalMs);
    }
  }

  function onEvent(e: LabAgentEvent): void {
    if (e.type !== 'backtest.result_ready' || !e.correlationId) return;
    for (const [taskId, reg] of regs) {
      if (reg.done || reg.correlationId !== e.correlationId) continue;
      if (reg.seen.has(e.taskId)) return;
      reg.seen.add(e.taskId);
      armIdle(taskId, reg);
      void surface(reg, e).catch(() => {});
      return;
    }
  }

  async function fetchSummary(taskId: string): Promise<LabCompletionSummary | null> {
    for (let i = 0; i <= guards.summaryRetries; i++) {
      const s = await deps.client.getCompletionSummary(taskId);
      if (s) return s;
      if (i < guards.summaryRetries) await sleep(guards.summaryIntervalMs);
    }
    return null;
  }

  async function surface(reg: Registration, e: LabAgentEvent): Promise<void> {
    const summary = await fetchSummary(e.taskId);
    if (reg.done) return;
    const text = summary ? deps.render(summary) : FALLBACK_TEXT;
    const { operatorMessageId, replyMessageId } = deps.newIds();
    const ts = new Date().toISOString();
    deps.bus.publish({
      type: 'operator_assistant_message',
      ts,
      operatorMessageId,
      conversationId: reg.conversationId,
      reply: { replyMessageId, operatorMessageId, conversationId: reg.conversationId, text, ts },
    });
  }

  function stop(): void {
    for (const taskId of [...regs.keys()]) teardown(taskId);
    unsub();
  }

  return { register, stop };
}
