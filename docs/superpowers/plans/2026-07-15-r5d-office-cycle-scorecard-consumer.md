# R5d — Office Cycle-Scorecard Consumer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a Lab research cycle closes, Office reacts to the `cycle.scorecard.built` agent event, fetches the scorecard Markdown from Lab, and posts it into the operator conversation — behind an off-by-default flag.

**Architecture:** A new `ScorecardFollower` (event-driven, independent of `DownstreamBacktestWatcher`) subscribes to the stream bridge, bootstraps `correlationId` from the anchor task's agent events, constructs the canonical `/v1` scorecard path (branded type — Office never trusts a DTO URL), fetches `text/markdown` via a new client method, and publishes an operator message. A single `complete()` helper makes every terminal path publish once and drop the live registration; a `stopped` guard makes shutdown async-safe.

**Tech Stack:** TypeScript, Node, Vitest, Hono/`@trading-office/server`. No new deps. Office must NOT import the trading-lab package.

**Spec:** `docs/superpowers/specs/2026-07-15-r5d-office-cycle-scorecard-consumer-design.md`. **Upstream contract:** trading-lab R5c-lab (`lab/docs/superpowers/specs/2026-07-15-r5c-lab-cycle-scorecard-markdown-spec.md`, PR trdlabs/lab#180).

## Global Constraints

- **No trading-lab import** — every Lab contract is hand-mirrored in `apps/server/src/connector/tradinglab/labDtos.ts` (existing convention).
- **Security invariant:** Office never follows a DTO-supplied URL. The scorecard path is CONSTRUCTED from a `correlationId` obtained via the trusted agent-event stream, in the single canonical shape, passed as a branded `ValidatedScorecardPath`. `getScorecardMarkdown` accepts only that branded type.
- **Flag off by default:** `OPERATOR_CYCLE_SCORECARD` gates everything; enabled only in `trading-lab` connector mode; independent of `OPERATOR_DOWNSTREAM_BACKTESTS`.
- **Process-local at-most-once only:** dedup via in-memory `doneBy*` sets; a process restart may re-publish (acceptable — operator content is idempotent). Do not claim durable exactly-once.
- **Canonical scorecard path (must match Lab):** `/v1/cycles/${encodeURIComponent(correlationId)}/scorecard?format=markdown`.
- **Publish shape (reuse the watcher's):** `bus.publish({ type: 'operator_assistant_message', ts, operatorMessageId, conversationId, reply: { replyMessageId, operatorMessageId, conversationId, text, ts } })`.
- **Commands (run in the office repo):**
  - Single test file: `npm test -w @trading-office/server -- <path>` (→ `vitest run <path>`)
  - Full server suite: `npm test -w @trading-office/server`
  - Typecheck: `npm run typecheck -w @trading-office/server`

## Reference — existing office shapes this plan builds on

```ts
// apps/server/src/connector/tradinglab/labDtos.ts
export interface LabAgentEvent { id: string; ts: string; type: string; taskId: string; correlationId?: string; level: 'info'|'warn'|'error'; summary: string; payloadSummary?: Record<string, unknown> }
export interface LabSummaryLinks { taskId: string; profileId?: string; hypothesisId?: string; backtestRunId?: string } // R5d adds scorecardUrl?

// apps/server/src/connector/tradinglab/TradingLabHttpClient.ts — has `this.fetchImpl`, `this.deps.{readUrl,readToken,requestTimeoutMs}`, and `upstream(code,msg,reason)` for getJson. getAgentEvents returns LabPageEnvelope<LabAgentEvent> (.data is the array).

// apps/server/src/operator/DownstreamBacktestWatcher.ts — bootstrap pattern:
//   for i in 0..bootstrapRetries: events = await getAgentEvents({taskId}).catch(()=>[]); cid = events.find(e=>e.correlationId)?.correlationId; if cid return; sleep(interval)
//   publish via bus.publish({...operator_assistant_message...}); register(runCycleTaskId, conversationId); NO correlationId param.

// apps/server/src/operator/TradingLabOperatorResponder.ts:emitFromLabResponse — on task_created:
//   if (resp.taskType === 'research.run_cycle' || resp.plannedNextStep?.taskType === 'research.run_cycle') onRunCycleTask?.(resp.taskId, ids.conversationId);

// apps/server/src/config.ts — num(env,key,def) / str(env,key,def); bool gate pattern: env.OPERATOR_X === 'true' && connectorMode === 'trading-lab'.

// apps/server/src/index.ts — builds responderDeps with onRunCycleTask; has a shutdown() that should stop watchers.
```

---

### Task 1: Path contract (branded type + builder) and DTO field

**Files:**
- Create: `apps/server/src/operator/scorecardPath.ts`
- Modify: `apps/server/src/connector/tradinglab/labDtos.ts` (`LabSummaryLinks`)
- Test: `apps/server/src/operator/scorecardPath.test.ts`

**Interfaces:**
- Produces: `type ValidatedScorecardPath` and `buildScorecardPath(correlationId: string): ValidatedScorecardPath`.

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/operator/scorecardPath.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildScorecardPath } from './scorecardPath';

describe('buildScorecardPath', () => {
  // Local canonical-path regression test. This guards the OFFICE builder against a
  // local change only — it cannot detect a change to Lab's route (Office cannot see
  // Lab's router). Real cross-repo drift is caught by staging/E2E. Canonical shape is
  // defined by the R5c-lab spec (trdlabs/lab#180).
  it('builds the canonical /v1 scorecard markdown path', () => {
    expect(buildScorecardPath('c1')).toBe('/v1/cycles/c1/scorecard?format=markdown');
  });
  it('percent-encodes the correlationId', () => {
    expect(buildScorecardPath('a/b c')).toBe('/v1/cycles/a%2Fb%20c/scorecard?format=markdown');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w @trading-office/server -- src/operator/scorecardPath.test.ts`
Expected: FAIL — module `./scorecardPath` not found.

- [ ] **Step 3: Implement the path contract**

Create `apps/server/src/operator/scorecardPath.ts`:

```ts
// Office constructs this path from a correlationId it obtained via the trusted agent-event
// stream — it never follows a DTO-supplied URL (security invariant, R5c-lab spec). The branded
// type is the only value getScorecardMarkdown accepts, so no un-validated string can reach fetch.
export type ValidatedScorecardPath = string & { readonly __scorecardPath: unique symbol };

export function buildScorecardPath(correlationId: string): ValidatedScorecardPath {
  return `/v1/cycles/${encodeURIComponent(correlationId)}/scorecard?format=markdown` as ValidatedScorecardPath;
}
```

- [ ] **Step 4: Add the DTO field**

In `apps/server/src/connector/tradinglab/labDtos.ts`, extend `LabSummaryLinks` (mirrors R5c-lab; declared for contract fidelity, NOT consumed at runtime):

```ts
export interface LabSummaryLinks { taskId: string; profileId?: string; hypothesisId?: string; backtestRunId?: string; scorecardUrl?: string }
```

- [ ] **Step 5: Run to verify pass + typecheck**

Run: `npm test -w @trading-office/server -- src/operator/scorecardPath.test.ts`
Expected: PASS.
Run: `npm run typecheck -w @trading-office/server`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/operator/scorecardPath.ts apps/server/src/operator/scorecardPath.test.ts apps/server/src/connector/tradinglab/labDtos.ts
git commit -m "feat(r5d): branded ValidatedScorecardPath + buildScorecardPath; LabSummaryLinks.scorecardUrl"
```

---

### Task 2: `getScorecardMarkdown` on `TradingLabHttpClient`

**Files:**
- Modify: `apps/server/src/connector/tradinglab/TradingLabHttpClient.ts`
- Test: `apps/server/src/connector/tradinglab/TradingLabHttpClient.test.ts` (extend if present; else create)

**Interfaces:**
- Consumes: `ValidatedScorecardPath` (Task 1).
- Produces: `type ScorecardFetchResult` and `TradingLabHttpClient.getScorecardMarkdown(path: ValidatedScorecardPath): Promise<ScorecardFetchResult>`.

- [ ] **Step 1: Write the failing tests**

Add to the client test file (mirror the file's existing fake-`fetchImpl` construction — build a client with a stub `fetchImpl` returning a `Response`):

```ts
import { buildScorecardPath } from '../../operator/scorecardPath';
// ... within the existing describe, using the file's helper to make a client with a fake fetchImpl:

it('getScorecardMarkdown: 200 text/markdown -> ok', async () => {
  const client = makeClient(async () => new Response('## Scorecard', { status: 200, headers: { 'content-type': 'text/markdown; charset=utf-8' } }));
  const r = await client.getScorecardMarkdown(buildScorecardPath('c1'));
  expect(r).toEqual({ kind: 'ok', markdown: '## Scorecard' });
});
it('getScorecardMarkdown: 404 -> not_found', async () => {
  const client = makeClient(async () => new Response('', { status: 404 }));
  expect(await client.getScorecardMarkdown(buildScorecardPath('c1'))).toEqual({ kind: 'not_found' });
});
it('getScorecardMarkdown: 500 -> transient', async () => {
  const client = makeClient(async () => new Response('', { status: 500 }));
  expect(await client.getScorecardMarkdown(buildScorecardPath('c1'))).toEqual({ kind: 'transient' });
});
it('getScorecardMarkdown: network error -> transient', async () => {
  const client = makeClient(async () => { throw new Error('boom'); });
  expect(await client.getScorecardMarkdown(buildScorecardPath('c1'))).toEqual({ kind: 'transient' });
});
it('getScorecardMarkdown: 401 -> permanent', async () => {
  const client = makeClient(async () => new Response('', { status: 401 }));
  expect(await client.getScorecardMarkdown(buildScorecardPath('c1'))).toEqual({ kind: 'permanent' });
});
it('getScorecardMarkdown: 200 non-markdown content-type -> permanent', async () => {
  const client = makeClient(async () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }));
  expect(await client.getScorecardMarkdown(buildScorecardPath('c1'))).toEqual({ kind: 'permanent' });
});
it('getScorecardMarkdown: sends accept text/markdown + bearer + readUrl prefix', async () => {
  let seenUrl = ''; let seenAccept = '';
  const client = makeClient(async (url: string, init: RequestInit) => {
    seenUrl = url; seenAccept = (init.headers as Record<string,string>).accept;
    return new Response('# ok', { status: 200, headers: { 'content-type': 'text/markdown' } });
  });
  await client.getScorecardMarkdown(buildScorecardPath('c1'));
  expect(seenUrl.endsWith('/v1/cycles/c1/scorecard?format=markdown')).toBe(true);
  expect(seenAccept).toBe('text/markdown');
});
```

> If the client test file lacks a `makeClient(fetchImpl)` helper, add one mirroring how `TradingLabHttpClient` is constructed elsewhere: `new TradingLabHttpClient({ readUrl: 'http://lab', readToken: 't', requestTimeoutMs: 1000, fetchImpl })`.

- [ ] **Step 2: Run to verify failure**

Run: `npm test -w @trading-office/server -- src/connector/tradinglab/TradingLabHttpClient.test.ts`
Expected: FAIL — `getScorecardMarkdown` is not a function.

- [ ] **Step 3: Implement the method**

In `TradingLabHttpClient.ts`, add the result type near the top exports and the method (self-contained — never throws; classification lives on the result, mirroring `getCompletionSummary`'s degrade contract):

```ts
export type ScorecardFetchResult =
  | { kind: 'ok'; markdown: string }
  | { kind: 'not_found' }
  | { kind: 'transient' }
  | { kind: 'permanent' };
```

```ts
  /** Fetch the cycle scorecard as Markdown. Never throws — classification rides on the result:
   *  not_found (wait for the event), transient (bounded retry), permanent (non-retriable). */
  async getScorecardMarkdown(path: ValidatedScorecardPath): Promise<ScorecardFetchResult> {
    const headers: Record<string, string> = { accept: 'text/markdown', Authorization: `Bearer ${this.deps.readToken}` };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.deps.requestTimeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.deps.readUrl}${path}`, { headers, signal: ctrl.signal });
    } catch {
      return { kind: 'transient' }; // network failure or client timeout (AbortError)
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 404) return { kind: 'not_found' };
    if (res.status === 401 || res.status === 403) return { kind: 'permanent' };
    if (res.status >= 500) return { kind: 'transient' };
    if (res.status >= 400) return { kind: 'permanent' };
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('text/markdown')) return { kind: 'permanent' }; // misrouted/HTML must not be published as a scorecard
    try {
      return { kind: 'ok', markdown: await res.text() };
    } catch {
      return { kind: 'transient' };
    }
  }
```

Add the import at the top: `import type { ValidatedScorecardPath } from '../../operator/scorecardPath';`

- [ ] **Step 4: Run to verify pass + typecheck**

Run: `npm test -w @trading-office/server -- src/connector/tradinglab/TradingLabHttpClient.test.ts`
Expected: PASS (7 new cases).
Run: `npm run typecheck -w @trading-office/server` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/connector/tradinglab/TradingLabHttpClient.ts apps/server/src/connector/tradinglab/TradingLabHttpClient.test.ts
git commit -m "feat(r5d): TradingLabHttpClient.getScorecardMarkdown with ok/not_found/transient/permanent"
```

---

### Task 3: `ScorecardFollower` state machine

**Files:**
- Create: `apps/server/src/operator/ScorecardFollower.ts`
- Test: `apps/server/src/operator/ScorecardFollower.test.ts`

**Interfaces:**
- Consumes: `ValidatedScorecardPath` + `buildScorecardPath` (Task 1); `ScorecardFetchResult` (Task 2); `LabAgentEvent`, `OfficeEvent`.
- Produces: `interface ScorecardFollowGuards`, `interface ScorecardFollowerDeps`, `interface ScorecardFollower`, `function createScorecardFollower(deps): ScorecardFollower`.

- [ ] **Step 1: Write the failing tests**

Create `apps/server/src/operator/ScorecardFollower.test.ts`. Use fake timers and controllable fakes:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createScorecardFollower } from './ScorecardFollower';
import type { ScorecardFetchResult } from '../connector/tradinglab/TradingLabHttpClient';
import type { LabAgentEvent } from '../connector/tradinglab/labDtos';

const GUARDS = { bootstrapRetries: 2, bootstrapIntervalMs: 10, ttlMs: 1000, fetchRetries: 2, fetchIntervalMs: 10 };

function makeHarness(opts: {
  events?: (taskId: string) => LabAgentEvent[];
  fetch?: () => ScorecardFetchResult;
} = {}) {
  const published: { conversationId: string; text: string }[] = [];
  let onEvent: (e: LabAgentEvent) => void = () => {};
  const fetchSeq: ScorecardFetchResult[] = [];
  const follower = createScorecardFollower({
    bridge: { subscribeAppended: (cb) => { onEvent = cb; return () => {}; } },
    client: {
      getAgentEvents: async ({ taskId }) => (opts.events ? opts.events(taskId) : [{ id: 'e', ts: 't', type: 'x', taskId, correlationId: 'corr-1', level: 'info', summary: '' }]),
      getScorecardMarkdown: async () => (fetchSeq.length ? fetchSeq.shift()! : (opts.fetch ? opts.fetch() : { kind: 'not_found' })),
    },
    bus: { publish: (e: any) => published.push({ conversationId: e.conversationId, text: e.reply.text }) },
    newIds: () => ({ operatorMessageId: 'op', replyMessageId: 'rp' }),
    guards: GUARDS,
    now: () => '2026-07-15T00:00:00.000Z',
    sleep: async () => {},
  });
  return { follower, published, emit: (e: LabAgentEvent) => onEvent(e), fetchSeq };
}
const builtEvent = (cid: string): LabAgentEvent => ({ id: 'b', ts: 't', type: 'cycle.scorecard.built', taskId: 'tk', correlationId: cid, level: 'info', summary: '' });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('happy path: bootstrap -> event -> ok -> publishes scorecard once', async () => {
  const h = makeHarness();
  h.fetchSeq.push({ kind: 'not_found' }); // recovery probe
  h.fetchSeq.push({ kind: 'ok', markdown: '## SC' }); // on event
  h.follower.register('anchor-1', 'conv-1');
  await vi.runAllTimersAsync(); // finish bootstrap + recovery probe
  h.emit(builtEvent('corr-1'));
  await vi.runAllTimersAsync();
  expect(h.published).toEqual([{ conversationId: 'conv-1', text: '## SC' }]);
});

it('recovery probe wins: scorecard already exists before the live event', async () => {
  const h = makeHarness({ fetch: () => ({ kind: 'ok', markdown: '## early' }) });
  h.follower.register('anchor-1', 'conv-1');
  await vi.runAllTimersAsync();
  expect(h.published).toEqual([{ conversationId: 'conv-1', text: '## early' }]);
});

it('replayed event and duplicate register do not re-publish', async () => {
  const h = makeHarness({ fetch: () => ({ kind: 'ok', markdown: '## SC' }) });
  h.follower.register('anchor-1', 'conv-1');
  await vi.runAllTimersAsync();
  h.emit(builtEvent('corr-1'));           // replay
  h.follower.register('anchor-1', 'conv-1'); // duplicate
  await vi.runAllTimersAsync();
  expect(h.published).toHaveLength(1);
});

it('bootstrap exhaustion publishes unavailable once and tombstones the anchor', async () => {
  const h = makeHarness({ events: () => [] }); // never yields correlationId
  h.follower.register('anchor-1', 'conv-1');
  await vi.runAllTimersAsync();
  expect(h.published).toEqual([{ conversationId: 'conv-1', text: expect.stringContaining('недоступ') }]);
  h.follower.register('anchor-1', 'conv-1'); // no re-bootstrap
  await vi.runAllTimersAsync();
  expect(h.published).toHaveLength(1);
});

it('TTL with no event publishes unavailable once', async () => {
  const h = makeHarness({ fetch: () => ({ kind: 'not_found' }) });
  h.follower.register('anchor-1', 'conv-1');
  await vi.runAllTimersAsync(); // bootstrap + recovery probe (not_found) -> idle
  await vi.advanceTimersByTimeAsync(GUARDS.ttlMs + 1);
  expect(h.published).toEqual([{ conversationId: 'conv-1', text: expect.stringContaining('недоступ') }]);
});

it('permanent error publishes unavailable once, no retry', async () => {
  const h = makeHarness({ fetch: () => ({ kind: 'permanent' }) });
  h.follower.register('anchor-1', 'conv-1');
  await vi.runAllTimersAsync();
  expect(h.published).toEqual([{ conversationId: 'conv-1', text: expect.stringContaining('недоступ') }]);
});

it('transient then ok within fetchRetries publishes scorecard', async () => {
  const h = makeHarness();
  h.fetchSeq.push({ kind: 'transient' });          // recovery probe attempt 1
  h.fetchSeq.push({ kind: 'ok', markdown: '## SC' }); // retry
  h.follower.register('anchor-1', 'conv-1');
  await vi.runAllTimersAsync();
  expect(h.published).toEqual([{ conversationId: 'conv-1', text: '## SC' }]);
});

it('coalesced wake-up: event during an in-flight not_found fetch is honored', async () => {
  // recovery probe resolves not_found; an event arrives during it; follower re-resolves -> ok
  const h = makeHarness();
  h.fetchSeq.push({ kind: 'not_found' }); // recovery probe
  h.fetchSeq.push({ kind: 'ok', markdown: '## SC' }); // re-resolve triggered by coalesced event
  h.follower.register('anchor-1', 'conv-1');
  // let bootstrap complete, then emit while the recovery probe is resolving
  await vi.advanceTimersByTimeAsync(GUARDS.bootstrapIntervalMs * (GUARDS.bootstrapRetries + 1));
  h.emit(builtEvent('corr-1'));
  await vi.runAllTimersAsync();
  expect(h.published).toEqual([{ conversationId: 'conv-1', text: '## SC' }]);
});

it('chained cycle: onboard anchor still bootstraps correlationId and publishes', async () => {
  const h = makeHarness({
    events: (taskId) => (taskId === 'onboard-1' ? [{ id: 'e', ts: 't', type: 'strategy.onboard', taskId, correlationId: 'corr-1', level: 'info', summary: '' }] : []),
    fetch: () => ({ kind: 'ok', markdown: '## SC' }),
  });
  h.follower.register('onboard-1', 'conv-1');
  await vi.runAllTimersAsync();
  expect(h.published).toEqual([{ conversationId: 'conv-1', text: '## SC' }]);
});

it('stop() during an in-flight bootstrap neither publishes nor arms a timer', async () => {
  let resolveEvents!: (v: LabAgentEvent[]) => void;
  const gate = new Promise<LabAgentEvent[]>((r) => { resolveEvents = r; });
  const published: any[] = [];
  let onEvent: (e: LabAgentEvent) => void = () => {};
  const follower = createScorecardFollower({
    bridge: { subscribeAppended: (cb) => { onEvent = cb; return () => {}; } },
    client: { getAgentEvents: () => gate, getScorecardMarkdown: async () => ({ kind: 'ok', markdown: 'x' }) },
    bus: { publish: (e: any) => published.push(e) },
    newIds: () => ({ operatorMessageId: 'op', replyMessageId: 'rp' }),
    guards: GUARDS, now: () => 't', sleep: async () => {},
  });
  follower.register('anchor-1', 'conv-1');
  follower.stop();
  resolveEvents([{ id: 'e', ts: 't', type: 'x', taskId: 'anchor-1', correlationId: 'corr-1', level: 'info', summary: '' }]);
  await vi.runAllTimersAsync();
  expect(published).toHaveLength(0);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -w @trading-office/server -- src/operator/ScorecardFollower.test.ts`
Expected: FAIL — `./ScorecardFollower` not found.

- [ ] **Step 3: Implement the follower**

Create `apps/server/src/operator/ScorecardFollower.ts`:

```ts
import type { LabAgentEvent } from '../connector/tradinglab/labDtos';
import type { ScorecardFetchResult } from '../connector/tradinglab/TradingLabHttpClient';
import type { OfficeEvent } from '@trading-office/office-gateway';
import { buildScorecardPath, type ValidatedScorecardPath } from './scorecardPath';

const UNAVAILABLE_TEXT = 'Scorecard за цикл недоступен.';
const DONE_CAP = 500; // bounded dedup memory

export interface ScorecardFollowGuards {
  bootstrapRetries: number;
  bootstrapIntervalMs: number;
  ttlMs: number;
  fetchRetries: number;
  fetchIntervalMs: number;
}

export interface ScorecardFollowerDeps {
  bridge: { subscribeAppended(cb: (e: LabAgentEvent) => void): () => void };
  client: {
    getAgentEvents(q: { taskId: string }): Promise<LabAgentEvent[]>;
    getScorecardMarkdown(path: ValidatedScorecardPath): Promise<ScorecardFetchResult>;
  };
  bus: { publish(e: OfficeEvent): void };
  newIds: () => { operatorMessageId: string; replyMessageId: string };
  guards: ScorecardFollowGuards;
  now?: () => string;
  sleep?: (ms: number) => Promise<void>;
}

export interface ScorecardFollower {
  register(anchorTaskId: string, conversationId: string): void;
  stop(): void;
}

interface Reg {
  anchorTaskId: string;
  conversationId: string;
  correlationId: string;
  state: 'idle' | 'fetching' | 'done';
  resolveRequested: boolean;
  expired: boolean;
  ttlTimer?: ReturnType<typeof setTimeout>;
}

// Bounded FIFO membership set for process-local dedup.
function boundedSet(cap: number) {
  const q: string[] = [];
  const s = new Set<string>();
  return {
    has: (k: string) => s.has(k),
    add: (k: string) => { if (s.has(k)) return; s.add(k); q.push(k); if (q.length > cap) { const old = q.shift()!; s.delete(old); } },
  };
}

export function createScorecardFollower(deps: ScorecardFollowerDeps): ScorecardFollower {
  const { guards } = deps;
  const now = deps.now ?? (() => new Date().toISOString());
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  const pendingByTask = new Set<string>();
  const byCorrelation = new Map<string, Reg>();
  const doneByTask = boundedSet(DONE_CAP);
  const doneByCorrelation = boundedSet(DONE_CAP);
  let stopped = false;

  const unsub = deps.bridge.subscribeAppended(onEvent);

  function publish(conversationId: string, text: string): void {
    const { operatorMessageId, replyMessageId } = deps.newIds();
    const ts = now();
    deps.bus.publish({
      type: 'operator_assistant_message',
      ts,
      operatorMessageId,
      conversationId,
      reply: { replyMessageId, operatorMessageId, conversationId, text, ts },
    } as OfficeEvent);
  }

  // Single terminal helper: publish once, drop the live reg, record bounded tombstones.
  function complete(reg: Reg, text: string): void {
    if (stopped) return;
    publish(reg.conversationId, text);
    if (reg.ttlTimer) clearTimeout(reg.ttlTimer);
    reg.state = 'done';
    byCorrelation.delete(reg.correlationId);
    doneByCorrelation.add(reg.correlationId);
    doneByTask.add(reg.anchorTaskId);
  }

  function register(anchorTaskId: string, conversationId: string): void {
    if (stopped) return;
    if (pendingByTask.has(anchorTaskId) || doneByTask.has(anchorTaskId)) return;
    pendingByTask.add(anchorTaskId);
    void bootstrap(anchorTaskId, conversationId);
  }

  async function bootstrap(anchorTaskId: string, conversationId: string): Promise<void> {
    let correlationId: string | undefined;
    for (let i = 0; i <= guards.bootstrapRetries && !stopped; i++) {
      const events = await deps.client.getAgentEvents({ taskId: anchorTaskId }).catch(() => []);
      if (stopped) return;
      correlationId = events.find((e) => e.correlationId)?.correlationId;
      if (correlationId) break;
      if (i < guards.bootstrapRetries) await sleep(guards.bootstrapIntervalMs);
    }
    if (stopped) return;
    pendingByTask.delete(anchorTaskId);
    if (!correlationId) {
      // Exhaustion: no correlationId ever seen -> honest terminal. Publish unavailable once and
      // tombstone the anchor so a later re-register does not re-bootstrap.
      doneByTask.add(anchorTaskId);
      publish(conversationId, UNAVAILABLE_TEXT);
      return;
    }
    if (byCorrelation.has(correlationId) || doneByCorrelation.has(correlationId)) return;
    const reg: Reg = { anchorTaskId, conversationId, correlationId, state: 'idle', resolveRequested: false, expired: false };
    reg.ttlTimer = setTimeout(() => onTtl(reg), guards.ttlMs);
    byCorrelation.set(correlationId, reg);
    await resolve(reg); // recovery probe — covers an event that fired before/during bootstrap
  }

  function onEvent(e: LabAgentEvent): void {
    if (stopped || e.type !== 'cycle.scorecard.built' || !e.correlationId) return;
    const reg = byCorrelation.get(e.correlationId);
    if (!reg) return; // unknown or already completed
    if (reg.state === 'idle') void resolve(reg);
    else if (reg.state === 'fetching') reg.resolveRequested = true; // coalesce — no parallel fetch
  }

  async function resolve(reg: Reg): Promise<void> {
    if (stopped || reg.state !== 'idle') return;
    reg.state = 'fetching';
    reg.resolveRequested = false;
    const path = buildScorecardPath(reg.correlationId);
    let result: ScorecardFetchResult = { kind: 'transient' };
    for (let i = 0; i <= guards.fetchRetries && !stopped; i++) {
      result = await deps.client.getScorecardMarkdown(path);
      if (stopped) return;
      if (result.kind !== 'transient') break;
      if (i < guards.fetchRetries) await sleep(guards.fetchIntervalMs);
    }
    if (stopped || reg.state === 'done') return;

    if (result.kind === 'ok') { complete(reg, result.markdown); return; }
    if (result.kind === 'permanent') { complete(reg, UNAVAILABLE_TEXT); return; }
    // not_found or transient-exhausted -> unresolved; never publish unavailable here.
    if (reg.expired) { complete(reg, UNAVAILABLE_TEXT); return; }
    reg.state = 'idle';
    if (reg.resolveRequested) { reg.resolveRequested = false; await resolve(reg); }
    // else: wait for the next event or TTL.
  }

  function onTtl(reg: Reg): void {
    if (stopped || reg.state === 'done') return;
    if (reg.state === 'fetching') { reg.expired = true; return; } // fetch-completion finalizes
    complete(reg, UNAVAILABLE_TEXT); // idle
  }

  function stop(): void {
    stopped = true;
    for (const reg of byCorrelation.values()) if (reg.ttlTimer) clearTimeout(reg.ttlTimer);
    unsub();
  }

  return { register, stop };
}
```

> Note on the coalesced-wake-up test: because `resolve` sets `state='fetching'` synchronously before its first `await`, an event that arrives during the fetch takes the `resolveRequested=true` branch; when the fetch returns `not_found`, `resolve`'s tail re-runs `resolve`. Verify the OfficeEvent shape compiles against `@trading-office/office-gateway`'s `OfficeEvent` union (the `operator_assistant_message` variant the watcher already publishes) — adjust the `as OfficeEvent` cast only if the gateway type requires additional fields the watcher also sets.

- [ ] **Step 4: Run to verify pass + typecheck**

Run: `npm test -w @trading-office/server -- src/operator/ScorecardFollower.test.ts`
Expected: PASS (all cases: happy, recovery-probe, replay/dup, exhaustion, TTL, permanent, transient-retry, coalesced, chained, stop-safety).
Run: `npm run typecheck -w @trading-office/server` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/operator/ScorecardFollower.ts apps/server/src/operator/ScorecardFollower.test.ts
git commit -m "feat(r5d): ScorecardFollower — event-driven, single-flight, coalesced wake-up, TTL-safe, stop-safe"
```

---

### Task 4: Config + env surface

**Files:**
- Modify: `apps/server/src/config.ts` (`OfficeServerConfig` + `loadConfig`)
- Modify: `.env.example` (office repo root or apps/server — match where the file lives)
- Test: `apps/server/src/config.test.ts`

**Interfaces:**
- Produces: `config.cycleScorecard: { enabled: boolean; guards: ScorecardFollowGuards }`.

- [ ] **Step 1: Write the failing config tests**

Add to `apps/server/src/config.test.ts`:

```ts
it('cycleScorecard defaults: disabled, sane guards', () => {
  const c = loadConfig({});
  expect(c.cycleScorecard.enabled).toBe(false);
  expect(c.cycleScorecard.guards.ttlMs).toBe(3_600_000);
  expect(c.cycleScorecard.guards.fetchRetries).toBe(3);
});
it('OPERATOR_CYCLE_SCORECARD only enables in trading-lab mode', () => {
  expect(loadConfig({ OPERATOR_CYCLE_SCORECARD: 'true' }).cycleScorecard.enabled).toBe(false); // fixture mode
  const c = loadConfig({ OPERATOR_CYCLE_SCORECARD: 'true', OFFICE_CONNECTOR_MODE: 'trading-lab', TRADING_LAB_READ_URL: 'http://l', TRADING_LAB_READ_TOKEN: 't' });
  expect(c.cycleScorecard.enabled).toBe(true);
});
it('scorecard guards read from env', () => {
  const c = loadConfig({ OFFICE_SCORECARD_TTL_MS: '5000', OFFICE_SCORECARD_FETCH_RETRIES: '1' });
  expect(c.cycleScorecard.guards.ttlMs).toBe(5000);
  expect(c.cycleScorecard.guards.fetchRetries).toBe(1);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -w @trading-office/server -- src/config.test.ts`
Expected: FAIL — `cycleScorecard` missing on config.

- [ ] **Step 3: Implement config**

In `config.ts`: import the guards type and add the interface field, then populate in `loadConfig`.

Add to `OfficeServerConfig`:

```ts
  cycleScorecard: { enabled: boolean; guards: ScorecardFollowGuards };
```

Add the import at top: `import type { ScorecardFollowGuards } from './operator/ScorecardFollower';`

In the `loadConfig` return object (after `downstreamBacktests`), add:

```ts
    cycleScorecard: {
      enabled: env.OPERATOR_CYCLE_SCORECARD === 'true' && connectorMode === 'trading-lab',
      guards: {
        ttlMs: num(env, 'OFFICE_SCORECARD_TTL_MS', 3_600_000),
        bootstrapRetries: num(env, 'OFFICE_SCORECARD_BOOTSTRAP_RETRIES', 8),
        bootstrapIntervalMs: num(env, 'OFFICE_SCORECARD_BOOTSTRAP_INTERVAL_MS', 750),
        fetchRetries: num(env, 'OFFICE_SCORECARD_FETCH_RETRIES', 3),
        fetchIntervalMs: num(env, 'OFFICE_SCORECARD_FETCH_INTERVAL_MS', 500),
      },
    },
```

- [ ] **Step 4: Update `.env.example`**

Locate the office `.env.example` (`find . -name .env.example -not -path '*/node_modules/*'` in the office repo) and add, next to the `OPERATOR_DOWNSTREAM_BACKTESTS` block:

```
# Cycle scorecard consumer (R5d) — posts the Lab cycle scorecard to the operator chat.
# Requires OFFICE_CONNECTOR_MODE=trading-lab. Off by default.
OPERATOR_CYCLE_SCORECARD=false
OFFICE_SCORECARD_TTL_MS=3600000
OFFICE_SCORECARD_BOOTSTRAP_RETRIES=8
OFFICE_SCORECARD_BOOTSTRAP_INTERVAL_MS=750
OFFICE_SCORECARD_FETCH_RETRIES=3
OFFICE_SCORECARD_FETCH_INTERVAL_MS=500
```

- [ ] **Step 5: Run to verify pass + typecheck**

Run: `npm test -w @trading-office/server -- src/config.test.ts` → PASS.
Run: `npm run typecheck -w @trading-office/server` → exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/config.ts apps/server/src/config.test.ts .env.example
git commit -m "feat(r5d): cycleScorecard config + OPERATOR_CYCLE_SCORECARD / OFFICE_SCORECARD_* env surface"
```

---

### Task 5: Wiring in `index.ts`

**Files:**
- Modify: `apps/server/src/index.ts`

**Interfaces:**
- Consumes: `createScorecardFollower` (Task 3), `config.cycleScorecard` (Task 4), `buildScorecardPath` (unused here), `wiring.client.getScorecardMarkdown` (Task 2), `wiring.bridge`.

- [ ] **Step 1: Construct the follower and fan out `onRunCycleTask`**

In `index.ts`, inside the `if (config.tradingLab.chatToken)` block where `backtestWatcher` and `responderDeps` are built:

1. After `backtestWatcher` is set, construct the follower (gated, independent of downstreamBacktests):

```ts
    const scorecardFollower = config.cycleScorecard.enabled
      ? createScorecardFollower({
          bridge: wiring.bridge,
          client: {
            getAgentEvents: (q) => wiring!.client.getAgentEvents(q).then((env) => env.data),
            getScorecardMarkdown: (path) => wiring!.client.getScorecardMarkdown(path),
          },
          bus,
          newIds: () => defaultNewIds()(),
          guards: config.cycleScorecard.guards,
        })
      : undefined;
```

2. Change `responderDeps.onRunCycleTask` to fan out to BOTH consumers (replace the existing `onRunCycleTask` line):

```ts
      onRunCycleTask: (backtestWatcher || scorecardFollower)
        ? (taskId: string, cid: string) => { backtestWatcher?.register(taskId, cid); scorecardFollower?.register(taskId, cid); }
        : undefined,
```

3. Add the import at the top:

```ts
import { createScorecardFollower } from './operator/ScorecardFollower';
```

4. In the `shutdown` function, stop the follower alongside the watcher (add near the existing `backtestWatcher?.stop()` if present; if the watcher isn't stopped there today, add both):

```ts
  scorecardFollower?.stop();
```

> `defaultNewIds()` is the same id factory the watcher wiring uses (`newIds: () => { const { operatorMessageId, replyMessageId } = defaultNewIds()(); return { operatorMessageId, replyMessageId }; }` in the current code) — reuse that exact shape if `defaultNewIds()()` doesn't already return both ids.

- [ ] **Step 2: Typecheck + full suite (wiring has no isolated unit test; it's covered by typecheck + the existing app/integration tests)**

Run: `npm run typecheck -w @trading-office/server` → exit 0.
Run: `npm test -w @trading-office/server` → all pass (no regressions in app/integration/responder tests).

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/index.ts
git commit -m "feat(r5d): wire ScorecardFollower into onRunCycleTask fan-out (flag-gated, independent of downstream watcher)"
```

---

### Task 6: Deploy passthrough (Lab docker compose)

**Files:**
- Modify: the Lab-repo Docker Compose file(s) that launch the Office service (in `../lab` — locate with `grep -rl "@trading-office\|office" ../lab/docker* ../lab/**/docker* 2>/dev/null` or inspect the lab docker orchestration dir).

**Interfaces:** none (deploy config only).

- [ ] **Step 1: Add env passthrough**

In the compose service that runs Office, add the new env vars to its `environment:` block so they reach the container (default them off/empty; the operator sets real values per environment):

```yaml
      OPERATOR_CYCLE_SCORECARD: ${OPERATOR_CYCLE_SCORECARD:-false}
      OFFICE_SCORECARD_TTL_MS: ${OFFICE_SCORECARD_TTL_MS:-3600000}
      OFFICE_SCORECARD_BOOTSTRAP_RETRIES: ${OFFICE_SCORECARD_BOOTSTRAP_RETRIES:-8}
      OFFICE_SCORECARD_BOOTSTRAP_INTERVAL_MS: ${OFFICE_SCORECARD_BOOTSTRAP_INTERVAL_MS:-750}
      OFFICE_SCORECARD_FETCH_RETRIES: ${OFFICE_SCORECARD_FETCH_RETRIES:-3}
      OFFICE_SCORECARD_FETCH_INTERVAL_MS: ${OFFICE_SCORECARD_FETCH_INTERVAL_MS:-500}
```

> This is a Lab-repo change (deploy config, not Lab source/behavior). It may land as its own tiny commit/PR in `../lab`. Without it the flag exists but cannot be flipped in demo/VPS. If the office service is defined in an office-repo compose instead, apply it there.

- [ ] **Step 2: Verify the compose parses**

Run (in the lab repo, adjusting the file path): `docker compose -f <compose-file> config >/dev/null && echo OK`
Expected: `OK` (no YAML/interpolation error).

- [ ] **Step 3: Commit** (in the lab repo)

```bash
git -C ../lab add <compose-file>
git -C ../lab commit -m "chore(docker): pass OPERATOR_CYCLE_SCORECARD / OFFICE_SCORECARD_* through to office (R5d)"
```

---

### Task 7: Full-suite regression + typecheck

**Files:** none (verification only)

- [ ] **Step 1: Full office suite**

Run: `npm test -w @trading-office/server`
Expected: all pass (new: scorecardPath, client, ScorecardFollower, config; existing: unchanged).

- [ ] **Step 2: Typecheck the office server**

Run: `npm run typecheck -w @trading-office/server`
Expected: exit 0.

- [ ] **Step 3: No commit** (verification only). If anything fails, return to the owning task, fix, re-run.

---

## Self-Review

**Spec coverage:**
- Construct-from-correlationId + branded path — Task 1. ✅
- `text/markdown` fetch with ok/not_found/transient/permanent — Task 2. ✅
- ScorecardFollower: bootstrap (anchorTaskId), recovery probe, event, single-flight, coalesced wake-up, TTL via expired, transient→idle, permanent→unavailable-once, bootstrap-exhaustion terminal, `complete()` helper (delete + bounded tombstones), stop-safety — Task 3. ✅
- Independent of downstream watcher; flag off by default; env surface + `.env.example` + compose passthrough — Tasks 4, 5, 6. ✅
- Tests: cycle with zero backtests (chained/event-only path), duplicate register/replay, stop-safety, config parsing — Task 3, 4. ✅
- DTO `scorecardUrl` declared, not consumed — Task 1. ✅
- Honest process-local at-most-once / local canonical-path regression naming — Task 1 test comment + Global Constraints. ✅

**Placeholder scan:** no TBD/TODO. Two steps say "locate the file" (`.env.example`, the lab compose) — deliberate (paths vary by repo layout) and each gives the exact `find`/`grep` to run and the exact content to add.

**Type consistency:** `ValidatedScorecardPath`, `ScorecardFetchResult`, `ScorecardFollowGuards`, `createScorecardFollower`, `buildScorecardPath` used identically across tasks. `config.cycleScorecard.guards` is a `ScorecardFollowGuards`. `onRunCycleTask(taskId, cid)` — `cid` is the conversationId (matches the responder callsite and the follower's `register(anchorTaskId, conversationId)`).
