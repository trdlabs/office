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
  it('a "." / ".." correlationId cannot collapse the path via URL normalization (no traversal)', () => {
    // WHATWG URL collapses a dot-only segment even percent-encoded (`%2e%2e` is a dot segment), so
    // `%2E` is NOT enough — double-encode the `%` (`%252E`), which new URL() does not treat as a dot.
    // Real Lab correlationIds are UUIDs — this is defense in depth.
    expect(buildScorecardPath('..')).toBe('/v1/cycles/%252E%252E/scorecard?format=markdown');
    expect(buildScorecardPath('.')).toBe('/v1/cycles/%252E/scorecard?format=markdown');
    expect(new URL(buildScorecardPath('..'), 'http://lab').pathname).toBe('/v1/cycles/%252E%252E/scorecard');
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
  let seg = encodeURIComponent(correlationId);
  // The WHATWG URL parser collapses a dot-only segment as path traversal EVEN percent-encoded — `.`,
  // `%2e`, `%2e%2e` are all "dot segments" (so `%2E` does NOT block it). For a dot-only segment we
  // double-encode the `%` (`%252E`), which new URL() does not treat as a dot. The regex is
  // intentionally broader than exactly `.`/`..` (any dot-only run); it never fires for real Lab
  // correlationIds (UUID-shaped), so parity with Lab's path is unaffected.
  if (/^\.+$/.test(seg)) seg = seg.replace(/\./g, '%252E');
  return `/v1/cycles/${seg}/scorecard?format=markdown` as ValidatedScorecardPath;
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
it('getScorecardMarkdown: 200 text/markdown with charset param -> ok (MIME normalized)', async () => {
  const client = makeClient(async () => new Response('# ok', { status: 200, headers: { 'content-type': 'text/markdown; charset=utf-8' } }));
  expect(await client.getScorecardMarkdown(buildScorecardPath('c1'))).toEqual({ kind: 'ok', markdown: '# ok' });
});
it('getScorecardMarkdown: sends accept text/markdown + bearer + readUrl prefix', async () => {
  let seenUrl = ''; let seenAccept = ''; let seenAuth = '';
  const client = makeClient(async (url: string, init: RequestInit) => {
    seenUrl = url;
    const h = init.headers as Record<string, string>;
    seenAccept = h.accept; seenAuth = h.Authorization;
    return new Response('# ok', { status: 200, headers: { 'content-type': 'text/markdown' } });
  });
  await client.getScorecardMarkdown(buildScorecardPath('c1'));
  expect(seenUrl.endsWith('/v1/cycles/c1/scorecard?format=markdown')).toBe(true);
  expect(seenAccept).toBe('text/markdown');
  expect(seenAuth).toBe('Bearer t'); // makeClient uses readToken:'t'
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
    const mime = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (mime !== 'text/markdown') return { kind: 'permanent' }; // misrouted/HTML must not be published as a scorecard
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

Create `apps/server/src/operator/ScorecardFollower.test.ts`. **Timer discipline:** bootstrap/fetch retries use the injected no-op `sleep`, so the ONLY real timer is the `ttlMs` `ttlTimer`. Drive async progress with a microtask `flush()` (never `vi.runAllTimersAsync()`, which would fire the TTL and publish `unavailable` prematurely); advance the fake clock past `ttlMs` ONLY in TTL tests. For genuine in-flight states (coalesced wake-up, TTL-during-fetch, stop-during-fetch) the fetch must be a **deferred** promise the test resolves on cue — an already-resolved fetch never lets an event land in `state:'fetching'`.

```ts
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

  const pendingByTask = new Set<string>();   // bootstrap in flight (keyed by anchor)
  const activeByTask = new Set<string>();     // live reg exists for this anchor (post-bootstrap, pre-terminal)
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

  // Single terminal helper. Records the terminal state FIRST (atomically, before any publish can
  // throw), so a synchronous subscriber exception in bus.publish cannot strand the reg as 'fetching'
  // or leak it in the maps. Publish is best-effort after the state is already terminal.
  function complete(reg: Reg, text: string): void {
    if (reg.ttlTimer) clearTimeout(reg.ttlTimer);
    reg.state = 'done';
    byCorrelation.delete(reg.correlationId);
    activeByTask.delete(reg.anchorTaskId);
    doneByCorrelation.add(reg.correlationId);
    doneByTask.add(reg.anchorTaskId);
    if (stopped) return;
    try { publish(reg.conversationId, text); } catch { /* subscriber threw — terminal already recorded */ }
  }

  function register(anchorTaskId: string, conversationId: string): void {
    if (stopped) return;
    if (pendingByTask.has(anchorTaskId) || activeByTask.has(anchorTaskId) || doneByTask.has(anchorTaskId)) return;
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
      // Exhaustion: no correlationId ever seen -> honest terminal. Tombstone the anchor FIRST so a
      // later re-register does not re-bootstrap even if publish throws, then best-effort publish.
      doneByTask.add(anchorTaskId);
      if (stopped) return;
      try { publish(conversationId, UNAVAILABLE_TEXT); } catch { /* subscriber threw — terminal already recorded */ }
      return;
    }
    if (byCorrelation.has(correlationId) || doneByCorrelation.has(correlationId)) {
      doneByTask.add(anchorTaskId); // this anchor is handled (another anchor owns the cycle)
      return;
    }
    const reg: Reg = { anchorTaskId, conversationId, correlationId, state: 'idle', resolveRequested: false, expired: false };
    reg.ttlTimer = setTimeout(() => onTtl(reg), guards.ttlMs);
    byCorrelation.set(correlationId, reg);
    activeByTask.add(anchorTaskId);
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
Expected: PASS (happy, recovery-probe, replay/dup, exhaustion+no-second-bootstrap, one-bootstrap-per-anchor, activeByTask-blocks-repeat, TTL-idle, permanent-no-retry, transient-retry, transient-exhausted→event, coalesced-wake-up, TTL-during-fetch, chained-onboard, zero-backtests, subscriber-exception, stop-during-bootstrap, stop-during-fetch).
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

The office env example is `apps/server/.env.example` (NOT a repo-root file). Add, next to the `OPERATOR_DOWNSTREAM_BACKTESTS` block:

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
git add apps/server/src/config.ts apps/server/src/config.test.ts apps/server/.env.example
git commit -m "feat(r5d): cycleScorecard config + OPERATOR_CYCLE_SCORECARD / OFFICE_SCORECARD_* env surface"
```

---

### Task 5: Testable fan-out helper + wiring in `index.ts`

**Files:**
- Create: `apps/server/src/operator/runCycleFanout.ts`
- Test: `apps/server/src/operator/runCycleFanout.test.ts`
- Modify: `apps/server/src/index.ts`

**Interfaces:**
- Produces: `interface RunCycleConsumer`, `makeRunCycleFanout(consumers): ((taskId, conversationId) => void) | undefined`.
- Consumes: `createScorecardFollower` (Task 3), `config.cycleScorecard` (Task 4), `wiring.client.getScorecardMarkdown` (Task 2), `wiring.bridge`.

The fan-out is extracted into a tiny pure helper so the "follower runs even when the downstream watcher is off, and both run when both are on" behavior is unit-tested (index.ts itself is not unit-testable).

- [ ] **Step 1: Write the failing fan-out test**

Create `apps/server/src/operator/runCycleFanout.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { makeRunCycleFanout } from './runCycleFanout';

describe('makeRunCycleFanout', () => {
  it('returns undefined when there is no consumer', () => {
    expect(makeRunCycleFanout([undefined, undefined])).toBeUndefined();
  });
  it('registers the follower even when the watcher is absent', () => {
    const follower = { register: vi.fn() };
    makeRunCycleFanout([undefined, follower])!('t1', 'c1');
    expect(follower.register).toHaveBeenCalledWith('t1', 'c1');
  });
  it('registers with every present consumer', () => {
    const watcher = { register: vi.fn() };
    const follower = { register: vi.fn() };
    makeRunCycleFanout([watcher, follower])!('t1', 'c1');
    expect(watcher.register).toHaveBeenCalledWith('t1', 'c1');
    expect(follower.register).toHaveBeenCalledWith('t1', 'c1');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -w @trading-office/server -- src/operator/runCycleFanout.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the helper**

Create `apps/server/src/operator/runCycleFanout.ts`:

```ts
export interface RunCycleConsumer {
  register(runCycleTaskId: string, conversationId: string): void;
}

/** Build the onRunCycleTask callback that fans out to every present consumer. Returns undefined
 *  when none are present (so the responder's optional onRunCycleTask stays undefined). */
export function makeRunCycleFanout(
  consumers: Array<RunCycleConsumer | undefined>,
): ((runCycleTaskId: string, conversationId: string) => void) | undefined {
  const active = consumers.filter((c): c is RunCycleConsumer => c !== undefined);
  if (active.length === 0) return undefined;
  return (runCycleTaskId, conversationId) => {
    for (const c of active) c.register(runCycleTaskId, conversationId);
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -w @trading-office/server -- src/operator/runCycleFanout.test.ts` → PASS.

- [ ] **Step 5: Wire into `index.ts`**

In `index.ts`, inside the `if (config.tradingLab.chatToken)` block:

1. Add the imports at the top of the file:

```ts
import { createScorecardFollower, type ScorecardFollower } from './operator/ScorecardFollower';
import { makeRunCycleFanout } from './operator/runCycleFanout';
```

2. Declare the follower at the **same scope as `shutdown`** (top level, so `shutdown` can reference it) — do NOT declare it with `const` inside the `if` block:

```ts
let scorecardFollower: ScorecardFollower | undefined;
```

3. Inside the `if (config.tradingLab.chatToken)` block, assign it (gated; independent of `downstreamBacktests.enabled`):

```ts
    scorecardFollower = config.cycleScorecard.enabled
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

4. Replace the existing `onRunCycleTask` line in `responderDeps` with the fan-out helper:

```ts
      onRunCycleTask: makeRunCycleFanout([backtestWatcher, scorecardFollower]),
```

5. In the top-level `shutdown` function, stop the follower (alongside stopping `backtestWatcher` — add both if not already stopped there):

```ts
  scorecardFollower?.stop();
```

> `defaultNewIds()` is the id factory the watcher wiring already uses (`() => { const { operatorMessageId, replyMessageId } = defaultNewIds()(); return { operatorMessageId, replyMessageId }; }`). Reuse that exact shape if `defaultNewIds()()` does not already return both ids; the follower's `newIds` must return `{ operatorMessageId, replyMessageId }`.

- [ ] **Step 6: Typecheck + full suite**

Run: `npm run typecheck -w @trading-office/server` → exit 0 (proves the top-level `let` + fan-out types line up).
Run: `npm test -w @trading-office/server` → all pass (no regressions).

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/operator/runCycleFanout.ts apps/server/src/operator/runCycleFanout.test.ts apps/server/src/index.ts
git commit -m "feat(r5d): testable onRunCycleTask fan-out + wire ScorecardFollower (flag-gated, independent of downstream watcher)"
```

---

### (Not an office-SDD task) Deploy passthrough — SEPARATE Lab PR

**This is NOT part of the office subagent-driven run and MUST NOT be committed by an office task.** It is a change in the **lab** repo, whose current checkout is on the R5c branch — committing there from an office task would pollute an unrelated branch. Execute it as its own lab worktree/branch + PR (or, by explicit human decision, an added commit to lab#180), after the office PR.

- **File:** `lab/docker-compose.demo.yml` — add the env passthrough to the Office service's `environment:` block. The local/VPS overlays inherit this service environment, so this one file is sufficient.

```yaml
      OPERATOR_CYCLE_SCORECARD: ${OPERATOR_CYCLE_SCORECARD:-false}
      OFFICE_SCORECARD_TTL_MS: ${OFFICE_SCORECARD_TTL_MS:-3600000}
      OFFICE_SCORECARD_BOOTSTRAP_RETRIES: ${OFFICE_SCORECARD_BOOTSTRAP_RETRIES:-8}
      OFFICE_SCORECARD_BOOTSTRAP_INTERVAL_MS: ${OFFICE_SCORECARD_BOOTSTRAP_INTERVAL_MS:-750}
      OFFICE_SCORECARD_FETCH_RETRIES: ${OFFICE_SCORECARD_FETCH_RETRIES:-3}
      OFFICE_SCORECARD_FETCH_INTERVAL_MS: ${OFFICE_SCORECARD_FETCH_INTERVAL_MS:-500}
```

- **Steps (in a fresh lab worktree/branch off lab `main`, not the R5c branch):** add the block → `docker compose -f docker-compose.demo.yml config >/dev/null && echo OK` → commit `chore(docker): pass OPERATOR_CYCLE_SCORECARD / OFFICE_SCORECARD_* through to office (R5d)` → open a separate lab PR. Without this, the flag exists but cannot be flipped in demo/VPS.

---

### Task 6: Full-suite regression + typecheck

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
- `text/markdown` fetch with ok/not_found/transient/permanent (Bearer + normalized MIME asserted) — Task 2. ✅
- ScorecardFollower: bootstrap (anchorTaskId), recovery probe, event, single-flight, coalesced wake-up, TTL via expired, transient→idle, permanent→unavailable-once, bootstrap-exhaustion terminal, `complete()` helper (terminal-state-first then best-effort publish; delete from maps + bounded tombstones), `pendingByTask`/`activeByTask`/`doneByTask` register guard, stop-safety — Task 3. ✅
- Independent of downstream watcher (unit-tested fan-out helper); flag off by default; env surface + `apps/server/.env.example` — Tasks 4, 5. Compose passthrough → separate Lab PR (not an office task). ✅
- Tests: cycle with zero backtests (event-only path), duplicate register/replay, one-bootstrap-per-anchor, activeByTask-blocks-repeat, subscriber-exception terminal guarantee, TTL-during-fetch, coalesced wake-up, stop-during-bootstrap, stop-during-fetch, config parsing, fan-out — Tasks 3, 4, 5. ✅
- DTO `scorecardUrl` declared, not consumed — Task 1. ✅
- Honest process-local at-most-once / local canonical-path regression naming — Task 1 test comment + Global Constraints. ✅

**Placeholder scan:** no TBD/TODO. Test steps use deferred promises + a microtask `flush()` (never `runAllTimersAsync`, which would fire the TTL) so timing is deterministic. The `.env.example` path and the lab compose file are named exactly (`apps/server/.env.example`, `lab/docker-compose.demo.yml`).

**Type consistency:** `ValidatedScorecardPath`, `ScorecardFetchResult`, `ScorecardFollowGuards`, `ScorecardFollowerDeps`, `createScorecardFollower`, `buildScorecardPath`, `makeRunCycleFanout` used identically across tasks. `config.cycleScorecard.guards` is a `ScorecardFollowGuards`. `onRunCycleTask(taskId, cid)` — `cid` is the conversationId (matches the responder callsite and the follower's `register(anchorTaskId, conversationId)`). `scorecardFollower` is declared `let ... | undefined` at `shutdown` scope so wiring compiles.
