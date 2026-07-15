import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createScorecardFollower, type ScorecardFollowerDeps } from './ScorecardFollower';
import type { ScorecardFetchResult } from '../connector/tradinglab/TradingLabHttpClient';
import type { LabAgentEvent } from '../connector/tradinglab/labDtos';

const GUARDS = { bootstrapRetries: 2, bootstrapIntervalMs: 10, ttlMs: 1000, fetchRetries: 2, fetchIntervalMs: 10 };
const flush = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); }; // microtasks only — no TTL
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }
const evt = (taskId: string, cid: string, type = 'x'): LabAgentEvent => ({ id: 'e', ts: 't', type, taskId, correlationId: cid, level: 'info', summary: '' });
const built = (cid: string): LabAgentEvent => evt('tk', cid, 'cycle.scorecard.built');

function makeHarness(opts: {
  events?: (taskId: string) => Promise<LabAgentEvent[]> | LabAgentEvent[];
  fetch?: () => Promise<ScorecardFetchResult>;
  throwOnPublish?: boolean;
} = {}) {
  const published: { conversationId: string; text: string }[] = [];
  let onEvent: (e: LabAgentEvent) => void = () => {};
  let getEventsCalls = 0;
  let fetchCalls = 0;
  const deps: ScorecardFollowerDeps = {
    bridge: { subscribeAppended: (cb) => { onEvent = cb; return () => {}; } },
    client: {
      getAgentEvents: async ({ taskId }) => { getEventsCalls++; return opts.events ? opts.events(taskId) : [evt(taskId, 'corr-1')]; },
      getScorecardMarkdown: async () => { fetchCalls++; return opts.fetch ? opts.fetch() : { kind: 'not_found' }; },
    },
    bus: { publish: (e: any) => { if (opts.throwOnPublish) throw new Error('subscriber blew up'); published.push({ conversationId: e.conversationId, text: e.reply.text }); } },
    newIds: () => ({ operatorMessageId: 'op', replyMessageId: 'rp' }),
    guards: GUARDS, now: () => 't', sleep: async () => {},
  };
  const follower = createScorecardFollower(deps);
  return { follower, published, emit: (e: LabAgentEvent) => onEvent(e), getEventsCalls: () => getEventsCalls, fetchCalls: () => fetchCalls };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('happy path: bootstrap -> event -> ok -> publishes scorecard once', async () => {
  const seq: ScorecardFetchResult[] = [{ kind: 'not_found' }, { kind: 'ok', markdown: '## SC' }];
  const h = makeHarness({ fetch: async () => seq.shift()! });
  h.follower.register('anchor-1', 'conv-1');
  await flush(); // bootstrap + recovery probe (not_found) -> idle; TTL NOT fired
  expect(h.published).toHaveLength(0);
  h.emit(built('corr-1'));
  await flush();
  expect(h.published).toEqual([{ conversationId: 'conv-1', text: '## SC' }]);
});

it('recovery probe wins: scorecard already exists before the live event', async () => {
  const h = makeHarness({ fetch: async () => ({ kind: 'ok', markdown: '## early' }) });
  h.follower.register('anchor-1', 'conv-1');
  await flush();
  expect(h.published).toEqual([{ conversationId: 'conv-1', text: '## early' }]);
});

it('replayed event and duplicate register do not re-publish', async () => {
  const h = makeHarness({ fetch: async () => ({ kind: 'ok', markdown: '## SC' }) });
  h.follower.register('anchor-1', 'conv-1');
  await flush();
  h.emit(built('corr-1'));                    // replay after done
  h.follower.register('anchor-1', 'conv-1');  // duplicate register after done
  await flush();
  expect(h.published).toHaveLength(1);
});

it('bootstrap exhaustion publishes unavailable once, tombstones anchor, no second bootstrap', async () => {
  const h = makeHarness({ events: () => [] }); // never yields correlationId
  h.follower.register('anchor-1', 'conv-1');
  await flush();
  expect(h.published).toEqual([{ conversationId: 'conv-1', text: expect.stringContaining('недоступ') }]);
  const callsAfterFirst = h.getEventsCalls();
  h.follower.register('anchor-1', 'conv-1'); // must be a no-op (doneByTask)
  await flush();
  expect(h.published).toHaveLength(1);
  expect(h.getEventsCalls()).toBe(callsAfterFirst); // no re-bootstrap
});

it('two register(sameTask) before bootstrap completes -> exactly one bootstrap', async () => {
  const gate = deferred<LabAgentEvent[]>();
  const h = makeHarness({ events: () => gate.promise });
  h.follower.register('anchor-1', 'conv-1');
  h.follower.register('anchor-1', 'conv-1'); // second must be dropped by pendingByTask
  expect(h.getEventsCalls()).toBe(1);        // only one bootstrap loop started its first getAgentEvents
  gate.resolve([evt('anchor-1', 'corr-1')]);
  await flush();
  expect(h.getEventsCalls()).toBe(1);
});

it('successful bootstrap blocks a repeat register before completion (activeByTask)', async () => {
  const fetchGate = deferred<ScorecardFetchResult>();
  const h = makeHarness({ fetch: () => fetchGate.promise });
  h.follower.register('anchor-1', 'conv-1');
  await flush(); // bootstrap done, recovery probe now awaiting fetchGate (state='fetching')
  const callsAfterBootstrap = h.getEventsCalls();
  h.follower.register('anchor-1', 'conv-1'); // must be a no-op (activeByTask), NOT a second bootstrap
  await flush();
  expect(h.getEventsCalls()).toBe(callsAfterBootstrap);
  fetchGate.resolve({ kind: 'ok', markdown: '## SC' });
  await flush();
  expect(h.published).toEqual([{ conversationId: 'conv-1', text: '## SC' }]);
});

it('TTL with no event publishes unavailable once', async () => {
  const h = makeHarness({ fetch: async () => ({ kind: 'not_found' }) });
  h.follower.register('anchor-1', 'conv-1');
  await flush(); // recovery probe not_found -> idle
  expect(h.published).toHaveLength(0);
  await vi.advanceTimersByTimeAsync(GUARDS.ttlMs + 1);
  expect(h.published).toEqual([{ conversationId: 'conv-1', text: expect.stringContaining('недоступ') }]);
});

it('permanent error publishes unavailable once, no retry', async () => {
  const h = makeHarness({ fetch: async () => ({ kind: 'permanent' }) });
  h.follower.register('anchor-1', 'conv-1');
  await flush();
  expect(h.published).toEqual([{ conversationId: 'conv-1', text: expect.stringContaining('недоступ') }]);
  expect(h.fetchCalls()).toBe(1); // permanent is not retried
});

it('transient then ok within fetchRetries publishes scorecard', async () => {
  const seq: ScorecardFetchResult[] = [{ kind: 'transient' }, { kind: 'ok', markdown: '## SC' }];
  const h = makeHarness({ fetch: async () => seq.shift()! });
  h.follower.register('anchor-1', 'conv-1');
  await flush();
  expect(h.published).toEqual([{ conversationId: 'conv-1', text: '## SC' }]);
});

it('transient-exhausted -> idle -> a later event wakes the follower to success', async () => {
  let phase: 'exhaust' | 'ok' = 'exhaust';
  const h = makeHarness({ fetch: async () => (phase === 'exhaust' ? { kind: 'transient' } : { kind: 'ok', markdown: '## SC' }) });
  h.follower.register('anchor-1', 'conv-1');
  await flush(); // probe: transient x (fetchRetries+1) -> idle, no publish
  expect(h.published).toHaveLength(0);
  phase = 'ok';
  h.emit(built('corr-1'));
  await flush();
  expect(h.published).toEqual([{ conversationId: 'conv-1', text: '## SC' }]);
});

it('coalesced wake-up: event during a real in-flight not_found fetch is honored', async () => {
  const probe = deferred<ScorecardFetchResult>();
  let n = 0;
  const h = makeHarness({ fetch: () => { n++; return n === 1 ? probe.promise : Promise.resolve({ kind: 'ok', markdown: '## SC' }); } });
  h.follower.register('anchor-1', 'conv-1');
  await flush(); // bootstrap done; recovery probe awaiting `probe` -> state='fetching'
  h.emit(built('corr-1')); // arrives during fetch -> resolveRequested = true (no parallel fetch)
  probe.resolve({ kind: 'not_found' });
  await flush(); // resolve tail sees resolveRequested -> re-resolve -> ok -> publish
  expect(h.published).toEqual([{ conversationId: 'conv-1', text: '## SC' }]);
  expect(h.fetchCalls()).toBe(2);
});

it('TTL during a real in-flight fetch defers, then finalizes as unavailable (no orphan)', async () => {
  const probe = deferred<ScorecardFetchResult>();
  const h = makeHarness({ fetch: () => probe.promise });
  h.follower.register('anchor-1', 'conv-1');
  await flush(); // state='fetching', awaiting probe
  await vi.advanceTimersByTimeAsync(GUARDS.ttlMs + 1); // onTtl during fetching -> expired=true, NO publish yet
  expect(h.published).toHaveLength(0);
  probe.resolve({ kind: 'not_found' });
  await flush(); // finalize: expired -> complete(unavailable)
  expect(h.published).toEqual([{ conversationId: 'conv-1', text: expect.stringContaining('недоступ') }]);
});

it('chained cycle: onboard anchor still bootstraps correlationId and publishes', async () => {
  const h = makeHarness({
    events: (taskId) => (taskId === 'onboard-1' ? [evt('onboard-1', 'corr-1', 'strategy.onboard')] : []),
    fetch: async () => ({ kind: 'ok', markdown: '## SC' }),
  });
  h.follower.register('onboard-1', 'conv-1');
  await flush();
  expect(h.published).toEqual([{ conversationId: 'conv-1', text: '## SC' }]);
});

it('cycle with zero downstream backtests: publishes purely from the built event', async () => {
  // No backtest events anywhere; correlationId learned from a non-backtest event; only the
  // cycle.scorecard.built event drives publication (the follower is independent of any backtest watcher).
  const seq: ScorecardFetchResult[] = [{ kind: 'not_found' }, { kind: 'ok', markdown: '## SC' }];
  const h = makeHarness({ events: () => [evt('anchor-1', 'corr-1', 'research.run_cycle.started')], fetch: async () => seq.shift()! });
  h.follower.register('anchor-1', 'conv-1');
  await flush();
  h.emit(built('corr-1'));
  await flush();
  expect(h.published).toEqual([{ conversationId: 'conv-1', text: '## SC' }]);
});

it('subscriber exception in publish does not strand the reg (terminal recorded first)', async () => {
  const h = makeHarness({ fetch: async () => ({ kind: 'ok', markdown: '## SC' }), throwOnPublish: true });
  h.follower.register('anchor-1', 'conv-1');
  await flush(); // complete() records terminal FIRST, then publish throws and is swallowed
  const fetchesAfter = h.fetchCalls();
  h.emit(built('corr-1'));                    // no live reg -> no-op
  h.follower.register('anchor-1', 'conv-1');  // doneByTask -> no-op
  await flush();
  expect(h.fetchCalls()).toBe(fetchesAfter);  // no re-fetch; reg was not left 'fetching'
});

it('stop() during an in-flight bootstrap neither publishes nor arms a timer', async () => {
  const gate = deferred<LabAgentEvent[]>();
  const h = makeHarness({ events: () => gate.promise });
  h.follower.register('anchor-1', 'conv-1');
  h.follower.stop();
  gate.resolve([evt('anchor-1', 'corr-1')]);
  await flush();
  expect(h.published).toHaveLength(0);
});

it('stop() during an in-flight scorecard fetch does not publish', async () => {
  const probe = deferred<ScorecardFetchResult>();
  const h = makeHarness({ fetch: () => probe.promise });
  h.follower.register('anchor-1', 'conv-1');
  await flush(); // state='fetching', awaiting probe
  h.follower.stop();
  probe.resolve({ kind: 'ok', markdown: '## SC' });
  await flush();
  expect(h.published).toHaveLength(0);
});
