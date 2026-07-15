# R5d — Office Cycle-Scorecard Consumer (design)

**Status:** design for the Office-side consumer of the Lab cycle scorecard.
**Upstream contract:** trading-lab R5c-lab — spec `lab/docs/superpowers/specs/2026-07-15-r5c-lab-cycle-scorecard-markdown-spec.md`, PR `trdlabs/lab#180`. This document consumes that contract; it does not redefine it.

## Purpose

When a Lab research cycle closes, Lab persists a `CycleScorecard` and serves it as Markdown at `GET /v1/cycles/:correlationId/scorecard?format=markdown` (R5c-lab). Today the operator never sees it — the run-cycle completion summary is delivered earlier and carries only a `scorecardUrl` link that Office does not consume. R5d closes that gap: Office reacts to the Lab `cycle.scorecard.built` agent event, fetches the scorecard Markdown, and publishes it into the operator conversation.

## Why event-driven (causal boundary)

The scorecard is a **cycle-level** artifact — Lab writes it at cycle close (`finalizeCycle` across the revision lane), which can be much later than the `research.run_cycle` task completes. The Lab handler upserts the scorecard row **before** emitting the `cycle.scorecard.built` agent event (verified: `cycle-scorecard.handler.ts` — `cycleScorecards.upsert(...)` then `events.append(event(task.id, 'cycle.scorecard.built', { correlationId }))`). So the event is a causal "the row exists now" signal: reacting to it means a near-zero 404 window, no guessing the Cycle-2 duration, and natural correlation via `correlationId`. Polling is not the primary mechanism.

The event reaches Office through the existing `TradingLabStreamBridge.subscribeAppended((e: LabAgentEvent) => void)` seam; `LabAgentEvent` already carries `type`, `taskId`, and `correlationId`.

## Scope

- **In (Office, this PR):** a new `ScorecardFollower` component, a branded validated-path builder, a `text/markdown` fetch method on `TradingLabHttpClient`, the DTO field `LabSummaryLinks.scorecardUrl`, wiring in `index.ts`, a feature flag with its env surface, and tests.
- **Deploy-surface touch (small, separate):** the Docker Compose file that launches Office (in the Lab repo's docker orchestration) must pass the new `OPERATOR_CYCLE_SCORECARD` / `OFFICE_SCORECARD_*` env vars through to Office. This is deploy config, not Lab source/behavior — it may land as its own tiny commit/PR but is required for the flag to be operable in demo/VPS.
- **Out:** any Lab **source/behavior** change (R5c-lab is complete and merged separately); changing the run-cycle completion-summary text; UI beyond posting an operator chat message.

## Global Constraints

- Office **must not** import the trading-lab package — every Lab contract is hand-mirrored in `apps/server/src/connector/tradinglab/labDtos.ts` (existing convention).
- **Security invariant (from R5c-lab spec):** Office must never follow an arbitrary URL from a DTO. The scorecard path is **constructed** in Office from a `correlationId` obtained through the trusted agent-event stream, in the single canonical shape, and passed as a branded type. The Lab-published `scorecardUrl` remains a public discovery contract for other clients but is **not trusted at Office runtime**.
- Enabled by an **independent** feature flag (`config.cycleScorecard.enabled`), default **off**, turned on only after staging end-to-end. Independent of `downstreamBacktests.enabled`.
- TypeScript, Vitest, existing Office server patterns (fake `fetch`/`bus`/`bridge`, fake timers).

## Chosen approach — construct-from-correlationId (Variant 1)

The follow anchor (`onRunCycleTask`) fires on `task_created` when `resp.taskType === 'research.run_cycle'` **or** `resp.plannedNextStep?.taskType === 'research.run_cycle'` (`TradingLabOperatorResponder.emitFromLabResponse`). In the second (chained) case the anchor task is e.g. `strategy.onboard`, whose completion summary is `kind:'strategy.onboard'` and carries **no** `scorecardUrl` (R5c added it to `buildRunCycle` only). The auto-chained run_cycle produces no separate chat `task_created`, so this is the only registration for that cycle.

Therefore Office does **not** extract the URL from a completion summary. It bootstraps the `correlationId` from the anchor task's agent events (the pattern `DownstreamBacktestWatcher` already uses) and **constructs** the canonical path from that `correlationId`. This is robust for both direct and chained cycles, needs no Lab change, and is strictly safer than trusting a DTO URL. Because the anchor may be an onboard task, it is named `anchorTaskId`, not `runCycleTaskId`.

Drift between Office's constructed path and Lab's route is closed by a contract test (below) plus staging E2E — not by a runtime dependency on the published URL.

## Components

### 1. Path contract — `buildScorecardPath` + branded type

`apps/server/src/operator/scorecardPath.ts` (pure):

```ts
export type ValidatedScorecardPath = string & { readonly __scorecardPath: unique symbol };

export function buildScorecardPath(correlationId: string): ValidatedScorecardPath {
  return `/v1/cycles/${encodeURIComponent(correlationId)}/scorecard?format=markdown` as ValidatedScorecardPath;
}
```

- The branded type is the only value `getScorecardMarkdown` accepts, so no un-validated string can reach the fetch.
- Since the path is constructed (never parsed from external input), the canonical shape and the `encodeURIComponent(correlationId)` segment are guaranteed by construction; the security invariant is satisfied without a parser. (A parser/validator is unnecessary in Variant 1 — there is no external URL to validate.)

### 2. Fetch — `TradingLabHttpClient.getScorecardMarkdown`

Adds a `text/markdown` fetch alongside the existing `getJson`, reusing the timeout / `AbortController` / error-classification machinery. Signature:

```ts
getScorecardMarkdown(path: ValidatedScorecardPath): Promise<ScorecardFetchResult>;

type ScorecardFetchResult =
  | { kind: 'ok'; markdown: string }
  | { kind: 'not_found' }     // 404 — scorecard not yet built; wait for the event
  | { kind: 'transient' }     // network error / timeout / 5xx — bounded retry
  | { kind: 'permanent' };    // 401/403, non-markdown content-type, other non-retriable 4xx
```

- Sends `accept: text/markdown` + `Authorization: Bearer <readToken>`, prepended with `config.tradingLab.readUrl` (relative path only — never an absolute URL).
- A 200 with a non-`text/markdown` content-type is `permanent` (defensive: a misrouted/HTML response must not be published as a scorecard).
- Never throws to the caller; classification is on the result, mirroring `getCompletionSummary`'s degrade-to-null contract.

### 3. `ScorecardFollower` — `apps/server/src/operator/ScorecardFollower.ts`

Independent of `DownstreamBacktestWatcher`. Subscribes to `bridge.subscribeAppended`. Deps mirror the watcher's shape:

```ts
interface ScorecardFollowerDeps {
  bridge: { subscribeAppended(cb: (e: LabAgentEvent) => void): () => void };
  client: {
    getAgentEvents(q: { taskId: string }): Promise<LabAgentEvent[]>;
    getScorecardMarkdown(path: ValidatedScorecardPath): Promise<ScorecardFetchResult>;
  };
  bus: { publish(e: OfficeEvent): void };
  newIds: () => { operatorMessageId: string; replyMessageId: string };
  guards: ScorecardFollowGuards; // { bootstrapRetries; bootstrapIntervalMs; ttlMs; fetchRetries; fetchIntervalMs }
  now?: () => string;
  sleep?: (ms: number) => Promise<void>;
}

interface ScorecardFollower {
  register(anchorTaskId: string, conversationId: string): void;
  stop(): void;
}
```

#### State

- `stopped: boolean` — set by `stop()`. Every async continuation (after each `await` in bootstrap/resolve/retry) and every timer-arm / publish checks it and bails, so a shutdown mid-flight cannot arm a new timer or publish after teardown (see the stop-safety invariant).
- `pendingByTask: Set<anchorTaskId>` — in-flight bootstraps (a repeat `register()` before bootstrap finishes must NOT start a second bootstrap).
- `byCorrelation: Map<correlationId, Reg>` where
  `Reg = { anchorTaskId; conversationId; correlationId; state: 'idle' | 'fetching' | 'done'; resolveRequested: boolean; expired: boolean; ttlTimer }`.
- `doneByTask: Set<anchorTaskId>` — **bounded** (LRU/FIFO cap) terminal marker per anchor. A `register` short-circuits when its `anchorTaskId` is in `doneByTask` (or `pendingByTask`). This covers cycles that terminated at **bootstrap exhaustion**, where no `correlationId` was ever learned.
- `doneByCorrelation: Set<correlationId>` — **bounded** (LRU/FIFO cap) terminal marker per cycle, so a replayed event or a repeat `register` for an already-published cycle cannot re-publish.

#### `complete(reg, text)` — the single terminal helper

Every terminal transition (success, permanent, TTL, and — via its own path — bootstrap exhaustion) goes through one helper so the maps never leak and publish happens once:

```
complete(reg, text):
  if stopped: return
  publish(reg.conversationId, text)          // one operator message
  clearTimeout(reg.ttlTimer)
  byCorrelation.delete(reg.correlationId)     // <-- explicit removal; the bounded set is not the map cap
  doneByCorrelation.add(reg.correlationId)    // bounded
  doneByTask.add(reg.anchorTaskId)            // bounded
```

`register`/event lookups treat "in `doneBy*`" as "already handled → no-op". `byCorrelation` therefore holds only live (idle/fetching) registrations.

#### Lifecycle

1. **`register(anchorTaskId, conversationId)`** (called from `onRunCycleTask`): if `anchorTaskId ∈ pendingByTask` or `∈ doneByTask` → no-op. Else add to `pendingByTask`, start `bootstrap`.
2. **`bootstrap(anchorTaskId, conversationId)`**: loop `getAgentEvents({ taskId: anchorTaskId })` up to `bootstrapRetries` (interval `bootstrapIntervalMs`), checking `stopped` after each `await`, taking `events.find(e => e.correlationId)?.correlationId`.
   - On success: remove from `pendingByTask`; if `correlationId ∈ byCorrelation` or `∈ doneByCorrelation` → no-op; else create `Reg{ state:'idle', resolveRequested:false, expired:false }`, arm `ttlTimer(ttlMs)`, and fire the **recovery resolve** (step 4 with the current `idle` reg — covers an event that fired before/during bootstrap).
   - **On exhaustion** (no `correlationId` after all retries): remove from `pendingByTask`, then **publish `unavailable` once** to `conversationId` and record a terminal anchor tombstone — i.e. `doneByTask.add(anchorTaskId)`. The operator gets closure and a later re-`register` for the same anchor is a no-op instead of re-bootstrapping. (No `correlationId` was learned, so there is nothing to fetch; `unavailable` is the honest terminal.)
3. **`onAgentEvent(e)`**: if `e.type !== 'cycle.scorecard.built'` or no `e.correlationId` → return. Find `Reg` by `e.correlationId`. Then by `state`: `idle` → `resolve(reg)`; `fetching` → set `reg.resolveRequested = true` (coalesce — do **not** start a parallel fetch); `done` / no reg → no-op.
4. **`resolve(reg)`** — the single fetch+publish path, guarded by `state === 'idle' → 'fetching'` (single-flight):
   - `path = buildScorecardPath(reg.correlationId)`.
   - `result = getScorecardMarkdown(path)` with an internal bounded retry **only** on `transient` (`fetchRetries` / `fetchIntervalMs`), checking `stopped` after each retry `await`.
   - **On completion**, if `stopped` → return. Else finalize, accounting for events/TTL that occurred during the fetch:
     - `ok` → `complete(reg, <scorecard markdown>)`.
     - `permanent` → `complete(reg, <unavailable text>)`.
     - `not_found` **or `transient` exhausted** (unresolved this attempt — do NOT publish `unavailable` here; a `not_found` before the event, or a network blip, must not prematurely close a cycle whose scorecard may still arrive):
       - if `reg.expired` → `complete(reg, <unavailable text>)`. (TTL fired mid-fetch — the record must be closed, not left timerless.)
       - else if `reg.resolveRequested` → clear the flag; `state='idle'`; **re-run `resolve(reg)`** (the coalesced event that arrived during the fetch is honored — a single missed event cannot strand the cycle).
       - else → `state='idle'`; wait for the next event or TTL. (TTL is the sole backstop that turns a persistently-unresolved cycle into `unavailable`.)
5. **`ttlTimer` fires** (`ttlMs` covers the max cycle-close horizon with margin): if `stopped` → no-op; if `state==='fetching'` → set `reg.expired=true` (the fetch-completion path finalizes via `complete()` — no orphaned record); if `state==='idle'` → `complete(reg, <unavailable text>)`; if `state==='done'` / gone → no-op.
6. **`stop()`**: set `stopped=true`, clear all `ttlTimer`s, unsubscribe. In-flight bootstrap/resolve/retry loops observe `stopped` at their next checkpoint and bail without arming a timer or publishing.

#### Invariants

- **Single-flight per correlation:** at most one in-flight fetch per `Reg`; probe, event, and retry never fetch/publish concurrently (gated by `state`).
- **Coalesced wake-up:** an event during a fetch sets `resolveRequested`; the fetch, on `not_found`, re-resolves — a single one-shot event is never dropped.
- **TTL/fetch race-free:** a TTL that fires mid-fetch defers via `expired`; it never publishes a failure alongside an in-flight success, and never leaves a record without a timer.
- **No unbounded growth:** `complete()` deletes the live `Reg` from `byCorrelation`; only the bounded `doneBy*` sets persist. A cycle that never terminates in-process is bounded by `ttlMs`.
- **Process-local at-most-once publish (best-effort, not durable):** within a single process lifetime, replays and re-registers are deduped by the in-memory `doneBy*` sets, so a cycle is published at most once. This is **not** an exactly-once guarantee: `OfficeEventBus` (`apps/server/src/events/OfficeEventBus.ts`) is non-persistent and the tombstones are in-memory, so a process restart can re-publish a scorecard for a cycle whose event replays after restart. Acceptable: the message is idempotent operator content (a duplicate scorecard/`unavailable` message is harmless), and durable dedup is out of scope.
- **Permanent failure and bootstrap exhaustion are definite:** each publishes `unavailable` exactly once (in-process) — never optional, never silent.
- **Stop-safety:** after `stop()`, no in-flight bootstrap/resolve/retry may arm a timer or publish. Every async continuation checks `stopped` at its next checkpoint; `complete()` and timer-arms are guarded by it.

### 4. Presentation

Publish a **separate follow-up** operator message in the same `conversationId` (the run-cycle completion message was delivered earlier; the scorecard arrives asynchronously), via the same `bus.publish({ type: 'operator_assistant_message', ... reply: { text, ... } })` shape the watcher uses. `text` on success = the scorecard Markdown (the Office chat renders Markdown). On permanent/TTL failure, `text` = a short `«Scorecard за цикл недоступен.»`.

### 5. DTO

`LabSummaryLinks` (labDtos.ts) gains `scorecardUrl?: string` — mirrors the R5c-lab contract so the DTO stays faithful and future clients can discover the link. Office does not consume it at runtime (Variant 1); it is declared for contract fidelity and cross-repo documentation.

### 6. Wiring (`index.ts`) + flag + deploy surface

- `onRunCycleTask` fans out to **both** consumers: `scorecardFollower.register(taskId, conversationId)` (when `config.cycleScorecard.enabled`) **and** `backtestWatcher?.register(...)` (unchanged). The follower is constructed and wired regardless of `downstreamBacktests.enabled`.
- New config: `config.cycleScorecard = { enabled: boolean; guards: ScorecardFollowGuards }`, default `enabled:false`.

**The flag must be reachable at the deploy surface, not just in TypeScript** (else it can't be turned on in demo/VPS). Concrete env vars, parsed in the Office server config module alongside the existing `OPERATOR_*` / `OFFICE_*` vars:

| Env var | Maps to | Default |
|---|---|---|
| `OPERATOR_CYCLE_SCORECARD` | `cycleScorecard.enabled` (bool) | `false` |
| `OFFICE_SCORECARD_TTL_MS` | `guards.ttlMs` | sized to the max realistic cycle-close horizon + margin |
| `OFFICE_SCORECARD_BOOTSTRAP_RETRIES` | `guards.bootstrapRetries` | (mirror the watcher's bootstrap defaults) |
| `OFFICE_SCORECARD_BOOTSTRAP_INTERVAL_MS` | `guards.bootstrapIntervalMs` | (as above) |
| `OFFICE_SCORECARD_FETCH_RETRIES` | `guards.fetchRetries` | small |
| `OFFICE_SCORECARD_FETCH_INTERVAL_MS` | `guards.fetchIntervalMs` | small |

Deploy-surface tasks (all required for the flag to be operable):
- **Config parse + defaults + tests** in the Office config module (each var parsed, bad/missing values fall back to defaults; a config test asserts the mapping and defaults).
- **`.env.example`** entries (Office) documenting each var with its default.
- **Docker Compose passthrough:** the compose that launches Office (the Lab-side one-command lab+office stack) must pass these env vars through to the Office service. This is a small change to that compose file (in the Lab repo's docker orchestration) — flagged here as a cross-repo deploy touch so it is not forgotten; without it the flag exists but cannot be flipped in demo/VPS.

Concrete numeric defaults are fixed in the implementation plan.

## Testing

- **`buildScorecardPath`** — canonical shape; `encodeURIComponent` on a `correlationId` containing `/` and space; branded type accepted by `getScorecardMarkdown` (compile-level).
- **Local canonical-path regression test** — asserts `buildScorecardPath('c1') === '/v1/cycles/c1/scorecard?format=markdown'`. This guards the **Office** builder against a local change; it does **not** detect a change to the Lab route (Office cannot see Lab's router). Real cross-repo drift is caught only by staging/E2E — the test name and a comment state this honestly, and the R5c-lab spec is cited as the canonical shape to re-check against.
- **`getScorecardMarkdown`** — `accept: text/markdown` header + `readUrl` prepend; 200 markdown → `ok`; 404 → `not_found`; 5xx/timeout/network → `transient`; 401/403 and non-markdown 200 content-type → `permanent`.
- **`ScorecardFollower`** (fake fetch/bus/bridge, fake timers):
  - happy: register → bootstrap correlationId → recovery probe `not_found` → `cycle.scorecard.built` → `ok` → publishes scorecard once; reg moves to `done`/tombstone.
  - **recovery probe wins:** event already fired before bootstrap finished → recovery probe returns `ok` → publishes without needing the live event.
  - **coalesced wake-up:** event arrives during an in-flight fetch that returns `not_found` → the follower re-resolves and eventually publishes (event not dropped).
  - **duplicate register / replayed event:** second `register` for the same anchor, and a replayed `cycle.scorecard.built`, do not re-publish (tombstone + pendingByTask).
  - **duplicate bootstrap guard:** two `register(sameTask)` before bootstrap completes → exactly one bootstrap loop.
  - **TTL during fetch:** TTL fires while `fetching`; fetch then returns `not_found` → publishes `unavailable` once, record closed (no orphan timer).
  - **TTL idle:** no event within `ttlMs` → publishes `unavailable` once.
  - **permanent:** 401/403 or non-markdown content-type → publishes `unavailable` once, no retry.
  - **transient retry:** `transient` then `ok` within `fetchRetries` → publishes scorecard.
  - **chained cycle (onboard anchor):** `register` with a `strategy.onboard` anchor task id → correlationId still bootstrapped from its agent events → scorecard published. (Covers the Variant-1 rationale.)
  - **cycle with zero downstream backtests:** a cycle that ran no backtests still yields `cycle.scorecard.built`; the follower — independent of `DownstreamBacktestWatcher` — publishes the scorecard.
  - **bootstrap exhaustion:** `getAgentEvents` never yields a `correlationId` within `bootstrapRetries` → publishes `unavailable` once, and a later re-`register` of the same anchor is a no-op (anchor tombstone), not a fresh bootstrap.
  - **no unbounded growth:** after a terminal (`complete()` or exhaustion), the live entry is gone from `byCorrelation`; only bounded `doneBy*` sets retain the id.
  - **stop-safety:** `stop()` called while a bootstrap/resolve/retry `await` is in flight → the continuation neither publishes nor arms a timer (assert `bus.publish` not called post-stop and no pending timers remain).
- **Config/env parsing:** each env var (`OPERATOR_CYCLE_SCORECARD`, `OFFICE_SCORECARD_TTL_MS`, bootstrap/fetch retries+intervals) parses to the config field; unset/invalid → documented default; `enabled` defaults `false`.
- **Wiring:** `onRunCycleTask` registers with the follower even when `downstreamBacktests.enabled` is false; flag off → no follower registration.

## Rollout

1. Merge Lab R5c-lab (`trdlabs/lab#180`) and deploy so the `/v1/.../scorecard` endpoint and `cycle.scorecard.built` event exist.
2. Merge this Office PR with `config.cycleScorecard.enabled = false`.
3. Enable the flag in staging; run the end-to-end check (a closed cycle → operator sees the scorecard message).
4. Only after the E2E check passes, proceed to R6–R9 (Lab side).

## Non-goals

No Lab change; no run-cycle summary text change; no polling as the primary mechanism; no trust of DTO-supplied URLs at runtime; no rich UI beyond the operator chat message.
