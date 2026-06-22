import { describe, it, expect, vi } from 'vitest';
import { createDownstreamBacktestWatcher } from './DownstreamBacktestWatcher';
import type { LabAgentEvent } from '../connector/tradinglab/labDtos';

const GUARDS = { idleMs: 10_000, maxMs: 60_000, bootstrapRetries: 3, bootstrapIntervalMs: 1, summaryRetries: 2, summaryIntervalMs: 1 };

function ev(partial: Partial<LabAgentEvent>): LabAgentEvent {
  return { id: 'e', ts: 't', type: 'x', taskId: 'tk', level: 'info', summary: '', ...partial };
}

function harness(overrides: { summary?: unknown } = {}) {
  let emit!: (e: LabAgentEvent) => void;
  const bridge = { subscribeAppended: (cb: (e: LabAgentEvent) => void) => { emit = cb; return () => {}; } };
  const published: any[] = [];
  const bus = { publish: (e: any) => published.push(e) };
  const client = {
    getAgentEvents: vi.fn(async (_q: { taskId: string }) => [ev({ taskId: 'rc-1', correlationId: 'corr-1' })]),
    getCompletionSummary: vi.fn(async (_id: string) => (overrides.summary === undefined ? { kind: 'backtest.completed' } : overrides.summary)),
  };
  let ids = 0;
  const newIds = () => ({ operatorMessageId: `om-${++ids}`, replyMessageId: `rm-${ids}` });
  const render = (_s: any) => 'RENDERED';
  const watcher = createDownstreamBacktestWatcher({ bridge: bridge as any, client: client as any, bus, newIds, render, guards: GUARDS });
  return { watcher, get emit() { return emit; }, published, client };
}

const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

describe('DownstreamBacktestWatcher', () => {
  it('publishes one operator_assistant_message per backtest.result_ready', async () => {
    const h = harness();
    h.watcher.register('rc-1', 'cv-1');
    await flush(); // bootstrap resolves corr-1
    h.emit(ev({ type: 'backtest.result_ready', taskId: 'bt-1', correlationId: 'corr-1' }));
    await flush();
    expect(h.published).toHaveLength(1);
    expect(h.published[0].type).toBe('operator_assistant_message');
    expect(h.published[0].conversationId).toBe('cv-1');
    expect(h.published[0].reply.text).toBe('RENDERED');
  });

  it('dedupes a replayed taskId', async () => {
    const h = harness();
    h.watcher.register('rc-1', 'cv-1');
    await flush();
    h.emit(ev({ type: 'backtest.result_ready', taskId: 'bt-1', correlationId: 'corr-1' }));
    await flush();
    h.emit(ev({ type: 'backtest.result_ready', taskId: 'bt-1', correlationId: 'corr-1' }));
    await flush();
    expect(h.published).toHaveLength(1);
  });

  it('ignores a foreign correlationId', async () => {
    const h = harness();
    h.watcher.register('rc-1', 'cv-1');
    await flush();
    h.emit(ev({ type: 'backtest.result_ready', taskId: 'bt-9', correlationId: 'other' }));
    await flush();
    expect(h.published).toHaveLength(0);
  });

  it('ignores non-backtest event types', async () => {
    const h = harness();
    h.watcher.register('rc-1', 'cv-1');
    await flush();
    h.emit(ev({ type: 'hypothesis.passed', taskId: 'bt-1', correlationId: 'corr-1' }));
    await flush();
    expect(h.published).toHaveLength(0);
  });

  it('falls back to a generic text when the summary stays null', async () => {
    vi.useFakeTimers();
    try {
      const h = harness({ summary: null });
      h.watcher.register('rc-1', 'cv-1');
      await vi.advanceTimersByTimeAsync(0); // bootstrap resolves corr-1
      h.emit(ev({ type: 'backtest.result_ready', taskId: 'bt-1', correlationId: 'corr-1' }));
      await vi.runAllTimersAsync(); // drain all summary-retry sleeps
      expect(h.published).toHaveLength(1);
      expect(h.published[0].reply.text).toContain('Бэктест');
    } finally {
      vi.useRealTimers();
    }
  });

  it('tears down a registration after idleMs (no publish for late events)', async () => {
    vi.useFakeTimers();
    try {
      const h = harness();
      h.watcher.register('rc-1', 'cv-1');
      await vi.advanceTimersByTimeAsync(0); // bootstrap
      await vi.advanceTimersByTimeAsync(GUARDS.idleMs + 1); // idle teardown
      h.emit(ev({ type: 'backtest.result_ready', taskId: 'bt-1', correlationId: 'corr-1' }));
      await vi.advanceTimersByTimeAsync(0);
      expect(h.published).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('suppresses publish when teardown races the summary fetch (M3)', async () => {
    // Build a deferred so we can control when getCompletionSummary resolves.
    let resolveDeferred!: (v: { kind: string } | null) => void;
    const deferred = new Promise<{ kind: string } | null>((res) => { resolveDeferred = res; });

    let emit!: (e: LabAgentEvent) => void;
    const bridge = { subscribeAppended: (cb: (e: LabAgentEvent) => void) => { emit = cb; return () => {}; } };
    const published: any[] = [];
    const bus = { publish: (e: any) => published.push(e) };
    const client = {
      getAgentEvents: vi.fn(async (_q: { taskId: string }) => [ev({ taskId: 'rc-1', correlationId: 'corr-1' })]),
      getCompletionSummary: vi.fn((_id: string) => deferred),
    };
    let ids = 0;
    const newIds = () => ({ operatorMessageId: `om-${++ids}`, replyMessageId: `rm-${ids}` });
    const render = (_s: any) => 'RENDERED';
    const watcher = createDownstreamBacktestWatcher({ bridge: bridge as any, client: client as any, bus, newIds, render, guards: GUARDS });

    // Step 1: register + let bootstrap resolve correlationId.
    watcher.register('rc-1', 'cv-1');
    await flush(); // bootstrap: getAgentEvents resolves corr-1

    // Step 2: emit the result_ready event — surface() starts and is now awaiting the deferred.
    emit(ev({ type: 'backtest.result_ready', taskId: 'bt-1', correlationId: 'corr-1' }));

    // Step 3: tear down while surface() is still awaiting getCompletionSummary.
    watcher.stop();

    // Step 4: resolve the deferred summary — surface() unblocks.
    resolveDeferred({ kind: 'backtest.completed' });
    await flush();

    // Step 5: assert no ghost message was published.
    expect(published).toHaveLength(0);
  });
});
