# Phase 4a — Platform health-snapshot persistence (trading-platform Ops Read backing)

- **Status:** Design approved (brainstorm + refinement round), 2026-06-14. Implementation NOT started.
- **Design-doc branch (this repo, trading-office):** `phase-4a-platform-health-persistence`.
- **Implementation repo:** **`trading-platform`** — all code in this phase lands in trading-platform, not trading-office. A separate implementation branch is cut in trading-platform at execution time. This doc lives in the trading-office roadmap series for continuity (Phases 1–3 specs are here).
- **Part of:** trading-office roadmap **Phase 4 — "real platform monitoring"**, decomposed into **4a (this doc — platform-side prerequisite)** + **4b (trading-office `PlatformMonitoringConnector`, a separate later spec)**. Sequencing chosen by the operator: platform-first, so every office panel is live the day 4b ships.
- **Builds on:** trading-platform feature `033-platform-ops-read-api` (the read-only Ops Read HTTP+WS surface); Phase 3 (`2026-06-14-trading-office-phase-3-trading-lab-integration-design.md`).
- **Workspace:** `trading-ai` (repos `trading-lab`, `trading-office`, `trading-platform` — all gortex-indexed). **Workspaces are NOT merged; no cross-repo TS imports.**

---

## 1. Context & goal

trading-platform already ships a read-only **Ops Read API** (`033-platform-ops-read-api`): a standalone Hono HTTP+WS process (`src/operations/bin/start-ops-read.ts`, npm `ops:read`), capability-stripped (no execution, no credentials, no mutation), bearer-token-gated, that reads the canonical Postgres DB and serves `/ops/*`. The PG-backed resources (`runs`, `trades`, `positions`, `summary`, `events`, `decisions`) return **real data today**. Three resources are wired but **stubbed to `unavailable`** in the shipped binary: `runtime-health`, `market-health`, `source-coverage`. There is **no** execution-backend health resource at all.

The reason the three are stubbed is structural, not a missing query: **their live signals never reach Postgres.** The ops-read process reads `canonical.*`; but runtime-health, `ServiceDiagnostics`, and per-feed coverage live **only in the memory of the live runtime / market-service processes** and are emitted to WebSocket + JSONL logs, not to PG. The only existing runtime→PG path writes whitelisted discrete **events** to `canonical.operational_event` — not periodic health snapshots. No heartbeat/status row exists (`BotRunRecord.lastSeenMs` is `GREATEST(max activity, started_at)`, derived at read time, never stored).

**Goal of Phase 4a:** create a clean, PG-mediated **health-snapshot persistence channel** so the live processes periodically publish compact health snapshots to a new canonical table, and the three stubbed Ops Read readers become ordinary PG readers (the established "ops reads PG" pattern). Add one new read-only `execution-health` resource derived from already-persisted execution events. After 4a, `/ops/health/runtime`, `/ops/health/market`, `/ops/coverage`, and `/ops/health/execution` return live data over the existing read boundary — with honesty preserved end-to-end (absent/stale → `unavailable`/`degraded`, never fabricated).

### Hard boundary (unchanged)

```
trading-runtime ─┐                         ┌─ ops-read process ──HTTP+WS── (Phase 4b: trading-office server)
 (run_long_oi /  │  writes health          │   (start-ops-read.ts,
  run_short_oi)   ├─ snapshots ──► canonical.platform_health_snapshot ──reads─┤    /ops/* GET + /ops/events WS,
market-service ──┘  (optional, gated)         + canonical.operational_event   │     bearer-token gated, read-only)
 (run_market_data_service, DB-free core)
```

The ops-read process is the **only** thing that reads these snapshots, and it is read-only and capability-stripped. No process gains execution authority. The trading-office integration is **out of scope here** — it is Phase 4b.

---

## 2. Scope

**In scope (all in `trading-platform`)**

- New canonical table `canonical.platform_health_snapshot` (latest-state upsert; optional bounded history deferred).
- **runtime-health writer** in the trading-runtime process, via its already-present PG pool/writers (`BotRunHandle`).
- **market-health writer** in the market-service process, via an **optional, gated `HealthSnapshotSink` capability** (market-service core stays DB-free — see §5.2).
- **source-coverage writer** in the market-service process, via the same optional gated sink, with an **aggregated** (per `source,kind`) coverage rollup — never a per-symbol/per-tick dump.
- **PG readers** replacing the stubs for `runtime-health`, `market-health`, `source-coverage` in `start-ops-read.ts`.
- **`execution-health`** as a read-only **activity-proxy** derived from existing `canonical.operational_event` `execution_*` rows (new resource; **no writer**).
- Extraction of `evaluateHealthGate` into an importable, side-effect-free module so the runtime can compute gate indicators in-process.
- `/ops/discover` capability-catalog updates.

**Out of scope (do NOT build in Phase 4a)**

- **true broker / exchange connection-health** — no aggregate connection state exists in memory; building it touches the execution layer and is a separate later phase. `execution-health` here is activity/error-rate only.
- **trading-office integration** (the `PlatformMonitoringConnector`, office DTOs, office panels) — that is **Phase 4b**.
- Any **command / mutation / execution capability** anywhere; the ops surface stays read-only and capability-stripped.
- **Host-side tail collector as primary architecture** (tailing JSONL / heartbeat-WS from a DB-owning process). Rejected: it re-couples ops-read to a host's filesystem/WS and breaks the PG-mediated read boundary. Permitted **only** as a throwaway debug/dev workaround, never as the shipped channel.
- New heavy infra (see §8) — no Kafka / Prometheus / ClickHouse / Timescale.
- Changes to `/ops/runs` / `/ops/trades` / etc. — they are already real; per-bot bot-health is sourced from `/ops/runs` and is consumed by Phase 4b, not re-implemented here.

---

## 3. Architecture & process map

Three live processes, one read process. Where each health signal lives, and whether its process has Postgres today:

| Domain | Owning process (bin) | Has PG pool today? | Writer placement |
|---|---|---|---|
| `runtime` (gate) | trading-runtime (`run_long_oi.ts` / `run_short_oi.ts`) | **yes** (`bootstrapBotRun` → `getDefaultPool()` + writers in `BotRunHandle`) | in-process periodic snapshotter, reuses the existing pool/writer |
| `execution` (activity) | trading-runtime (in-process `LiveBackend`) | **yes** (events already in `canonical.operational_event`) | **no writer** — read-side derivation from existing rows |
| `market` (service health) | market-service (`run_market_data_service.ts`) | **no — DB-free core** | optional gated `HealthSnapshotSink`, PG impl wired only at the bin |
| `coverage` (per-feed) | market-service (`MarketAggregator` / `CoverageEmitter`) | **no — DB-free core** | same optional gated sink; aggregated payload |

The trading-runtime and the market-service are **separate OS processes** (the runtime reaches the market-service over WebSocket). The runtime half is cheap (pool already threaded through `startupOrchestrator`); the market half must not introduce a DB dependency into the DB-free market-service core — hence the capability port in §5.2.

The ops-read read side is unchanged in shape: the dispatch/handler/DTO layers already treat a `null` reader result as `availability:'unavailable'` (FR-038). Wiring a real reader is, per domain, a one-line swap in the `readers` bag of `start-ops-read.ts`, plus (for `execution-health`) one new catalog/handler/reader trio.

---

## 4. The persistence channel — `canonical.platform_health_snapshot`

A single canonical table (one table, not per-domain), latest-state upsert as the primary model.

```
-- migrations/canonical/<next>_create_platform_health_snapshot.sql
CREATE TABLE canonical.platform_health_snapshot (
  domain         TEXT     NOT NULL,            -- 'runtime' | 'market' | 'coverage'
  source         TEXT     NOT NULL,            -- process/run id: 'long_oi' | 'short_oi' | 'market-service'
  captured_at_ms BIGINT   NOT NULL,            -- writer-stamped capture time (ms)
  payload        JSONB    NOT NULL,            -- compact domain snapshot (see §5)
  updated_at_ms  BIGINT   NOT NULL,            -- DB upsert time (ms)
  PRIMARY KEY (domain, source)                 -- latest-per-(domain,source); upsert
);
```

- **Latest-state upsert** is the primary model: writers `INSERT … ON CONFLICT (domain, source) DO UPDATE`. One row per (domain, source). No unbounded growth.
- **Multiple sources per domain** are expected: `runtime` has rows for `long_oi` and `short_oi`; `market`/`coverage` have a single `market-service` row. Readers aggregate across sources (§6).
- **`captured_at_ms` is the liveness signal.** A reader treats a row older than a staleness threshold as not-live (degraded/down), so a dead writer is *visible* (today a dead process is invisible). This is a net improvement over the JSONL gate.
- **Compact payloads.** Payloads carry only the fields the corresponding Ops DTO needs (§5); coverage is an aggregated per-(source,kind) rollup, never per-symbol.
- **Optional history is deferred.** If trend history is ever wanted, it is a separate, retention-bounded table (e.g. capped ring / periodic prune) added later — not part of 4a. The primary model writes no history.

The PG upsert itself is a tiny shared writer (`src/canonical/writers/platform_health_snapshot_writer.ts`): `writeSnapshot({ domain, source, capturedAtMs, payload })`. The runtime uses it over `BotRunHandle.pool`; the market PG sink uses it over its own single-connection pool (§5.2, §8).

---

## 5. Writers

### 5.1 runtime-health writer (trading-runtime, existing pool)

A periodic snapshotter started in `run_long_oi.ts` / `run_short_oi.ts` `main()`, after `bootstrapBotRun` (which already yields `{ pool, runtimeCanonicalWriter, operationalEventWriter }`). Every `RUNTIME_HEALTH_SNAPSHOT_INTERVAL_MS` (default 15–30 s) it:

1. computes gate indicators **in-process** via the extracted `evaluateHealthGate` (§6.2) fed from the runtime's in-memory telemetry/event state (not by re-reading JSONL);
2. writes `{ domain:'runtime', source:botId, payload: RuntimeHealthIndicators-shaped }`.

The snapshotter is lifecycle-bound (stops on shutdown), uses the already-threaded writer, and never blocks the trading loop (fire-and-forget with the same swallow-on-error discipline as §5.2).

> **PROVISIONAL — confirmed during implementation calibration (M1):** the historical gate (`scripts/check_runtime_health.ts`) merges **cross-process** signals from JSONL (`serviceOk` from market-data-service heartbeat, `freshnessOk` from aggregator summary). A single in-process runtime cannot see the market-service's memory. So the runtime snapshot carries the **runtime-scoped** indicators it can compute in-process (`ready`, `pipelineOk`, `botOk`), and the ops-read `runtime-health` reader **composes** the global gate by drawing `serviceOk`/`freshnessOk` from the latest `market`/`coverage` snapshots (§6.1). The exact indicator→source mapping is confirmed against the real `evaluateHealthGate` inputs before coding; where a contributing source is absent, the composed indicator is honestly `false`/degraded, never assumed `true`.

### 5.2 market-health + source-coverage via an optional gated `HealthSnapshotSink` (market-service core stays DB-free)

**Hard requirement: the market-service core must remain DB-free.** We do **not** add a direct DB dependency inside `MarketAggregator` / `ServiceDiagnostics` / `MarketDataService` core. Instead we add an **optional capability**, mirroring the existing `attachDecisionLogCapability` pattern:

- **Port (in market-service core):** `HealthSnapshotSink` (a.k.a. `PlatformHealthSnapshotSink`) — a minimal interface, e.g. `publish(snapshot: HealthSnapshotInput): void` (fire-and-forget; no Promise the core awaits in its loop).
- **Default implementation:** `NoopHealthSnapshotSink` — does nothing. This is the default the core is constructed with, so default deployments stay exactly as today (WS + JSONL only, no DB).
- **PG implementation:** `PgHealthSnapshotSink` — wired **only at the process composition boundary** (`run_market_data_service.ts` bin), constructed **only if** `DATABASE_URL` is set **and** `MARKET_HEALTH_PERSIST` is enabled. It owns its **own dedicated pool capped at `max: 1` connection**.
- **The market-service domain/core never imports `pg` / canonical writers.** Only the bin does. The port keeps the dependency direction clean (core depends on an interface; the bin injects the concrete adapter).
- **Not in the hot path.** The sink is invoked from the existing low-frequency loops only: the `startHeartbeat` tick (~15 s) publishes the `market` snapshot; a coverage rollup tick (aligned to finalization, not per-snapshot) publishes the `coverage` snapshot.
- **Write failures never affect the market-service.** The PG sink swallows errors (logs once, drops), with a **bounded write timeout**, **no retry storm** (at most one best-effort attempt per tick), and it **never blocks the heartbeat loop**. If PG is unavailable, the market-service degrades to today's behavior; the missing snapshots simply read as `unavailable` downstream.

`market` payload (compact): `ServiceDiagnostics.snapshot()` safe counters + `streamAgeMs` (the `MarketServiceHealthSnapshot`/`MarketHealthSignal` fields) — no raw provider dumps.

`coverage` payload (**aggregated**): a per-`(source, kind)` rollup — `{ source, kind, supported, lastSeenMs }` per feed (the `SourceFreshnessSignal` shape), **not** a per-symbol/per-minute dump. Coverage is only meaningful when `cfg.aggregator.useAggregatedMarketData` is on; otherwise the rollup is empty/`unsupported` and reads honestly as such.

### 5.3 execution-health — **no writer**

`execution-health` is a pure read-side derivation (§6.3) over rows already persisted to `canonical.operational_event` by the runtime's existing `RuntimeCanonicalWriter`. No new writer, no new channel, no execution-layer change.

---

## 6. Read side (ops-read process)

### 6.1 Un-stub the three readers → PG readers

Replace the `unavailable*` stubs in the `readers` bag of `start-ops-read.ts` with real PG readers built on `getDefaultPool()`, mirroring `createPgRunsReader`/`createPgTradesReader`:

| reader | reads | derive |
|---|---|---|
| `createPgRuntimeHealthReader(pool)` | latest `runtime` rows (per source) + latest `market`/`coverage` rows for the composed indicators (§5.1 note) | `RuntimeHealthIndicators` → reuse exported `deriveRuntimeStatus`; multi-source → worst-of |
| `createPgMarketHealthReader(pool)` | latest `market` row | `MarketHealthSignal` → reuse existing `deriveMarketStatus(streamAgeMs)`; apply snapshot-staleness |
| `createPgSourceCoverageReader(pool)` | latest `coverage` row | `SourceFreshnessSignal[]` → existing `deriveCoverageState` |

Each reader applies **snapshot-staleness**: if the latest row's `captured_at_ms` is older than its threshold, the signal is treated as not-live (existing fresh-window helpers `DEFAULT_MARKET_FRESH_MS`/`DEFAULT_COVERAGE_FRESH_MS = 120 000`; a dedicated `*_SNAPSHOT_STALE_MS` governs writer-death detection). No row → return `null` → handler emits `availability:'unavailable'`. The handler/dispatch/DTO layers are unchanged.

### 6.2 Extract `evaluateHealthGate` (the main refactor)

`scripts/check_runtime_health.ts` runs `main()` at module top level and exports nothing, so it cannot be imported. Extract `evaluateHealthGate` (and the helper types/scanners it needs — `Check`/`EventState` and the relevant `analyzeEvents`/`buildChecks` pieces, or parameterize them) into a new side-effect-free module `src/operations/health/health_gate.ts`. `check_runtime_health.ts` re-imports from it and keeps its CLI behavior unchanged (a parity test guards this). `deriveRuntimeStatus` already lives exported in `src/operations/sources/runtime-health-reader.ts` — reuse, no extraction. The runtime snapshotter (§5.1) imports the extracted gate and feeds it in-memory state.

### 6.3 New `execution-health` resource (activity-proxy)

Add a new read-only resource:

- **Reader** `createPgExecutionHealthReader(pool)` (`src/operations/sources/execution-health-reader.ts`): query `canonical.operational_event` for `execution_*` types within a bounded window → derive `{ lastExecutionEventMs, recentRejected, recentTransientErrors, … }` and a status (`ok|degraded|down`) via a `deriveExecutionStatus` helper (stale/absent → unavailable; rising error counts → degraded/down).
- **DTO** `ExecutionActivityHealthSnapshot` in `src/operations/dto.ts` — named to make explicit it is **activity/error-rate**, not broker connection state.
- **Handler** `get-execution-health.ts`; register in `OPS_READ_HANDLERS` (`src/operations/dispatch.ts`) as resource `execution-health`; add to `OPS_RESOURCE_CATALOG` + `RESOURCE_ALLOWED_ARGS`. Errors use the existing closed `OpsError` taxonomy (`validation_error | not_found | unsupported_query | internal_read_error`).
- Route surfaces as `GET /ops/health/execution`.

### 6.4 `/ops/discover` updates

The capability catalog (`OPS_RESOURCE_CATALOG`) gains the `execution-health` resource and reflects that `runtime-health`/`market-health`/`source-coverage` are now backed. `/ops/discover` advertises the resources/capabilities; **per-request liveness stays in each resource's `availability` field** (so an enabled-but-no-data resource still reports `unavailable` honestly). Phase 4b keys off `/ops/discover` + per-resource `availability`.

---

## 7. Honesty / availability semantics (the key property)

Honesty is preserved end-to-end, by construction:

- **Persistence disabled / `DATABASE_URL` unset** (market-service default) → `NoopHealthSnapshotSink` writes nothing → no `market`/`coverage` rows → readers return `null` → `/ops/health/market` & `/ops/coverage` report `availability:'unavailable'` → (Phase 4b) office shows a `gap`. No fabrication.
- **Writer alive, data fresh** → real status (`ok|degraded|down`).
- **Writer died / stalled** → latest row's `captured_at_ms` exceeds `*_SNAPSHOT_STALE_MS` → reader reports `degraded`/`down`. **Process death becomes visible** — strictly better than today.
- **Coverage off** (`useAggregatedMarketData` disabled) → empty/`unsupported` rollup → honest `unsupported`, never guessed `present`.
- **execution-health** with no recent `execution_*` rows → `unavailable`; this is honest "no recent execution activity", explicitly **not** a claim about broker connectivity.

Principle (inherited from Phase 3): **degrade visibly, never mask with fabricated data.**

---

## 8. Lightweight resource constraints (server: 4 GB RAM / 2 CPU / 80 GB storage)

Hard constraints for this and any follow-on monitoring work, fixed here:

- **No new heavy infra.** No Kafka, no Prometheus, no ClickHouse, no Timescale. Postgres (already present) is the only store.
- **Low-frequency snapshots** — 15–30 s per writer; never per-tick, never per-symbol.
- **Latest-state upsert is the primary model** (one row per (domain, source)); no unbounded append by default.
- **Optional history only with bounded retention** — deferred; if added, capped + pruned.
- **Market-health PG writer pool capped at `max: 1` connection.**
- **Compact JSONB payloads** — only DTO-needed fields.
- **No per-tick / per-symbol writes.**
- **Coverage payload is an aggregated per-(source,kind) rollup**, never a full per-symbol dump each iteration.
- Writers are fire-and-forget, bounded-timeout, no-retry-storm, non-blocking (§5.2).

---

## 9. Config & environment (server-only, trading-platform)

| env var | process | meaning | default |
|---|---|---|---|
| `DATABASE_URL` | all writers + ops-read | canonical PG (existing) | — (required where PG is used) |
| `RUNTIME_HEALTH_SNAPSHOT_INTERVAL_MS` | trading-runtime | runtime snapshot cadence | `15000` (15–30 s) |
| `MARKET_HEALTH_PERSIST` | market-service | explicit opt-in for the PG sink (else `NoopHealthSnapshotSink`) | `off` |
| `MARKET_HEALTH_SNAPSHOT_INTERVAL_MS` | market-service | market/coverage snapshot cadence | `15000` |
| `PLATFORM_HEALTH_SNAPSHOT_STALE_MS` | ops-read | writer-death staleness threshold for readers | `90000` |
| `OPS_READ_TOKENS` / `OPS_READ_PORT` | ops-read | existing bearer allowlist / port (unchanged) | — |

**Defaults keep the market-service DB-free:** the PG sink is engaged only when `DATABASE_URL` is set **and** `MARKET_HEALTH_PERSIST` is on. The runtime writer needs no new flag (the runtime already requires `DATABASE_URL`); its cadence is configurable.

---

## 10. No-execution-authority & security boundary

- The ops-read surface stays **read-only and capability-stripped**; no new write/execute/command route is added. New resources are GET-only.
- New **writers** publish only health snapshots; they add **no** execution capability to any process, and the market-service sink cannot execute anything (it only writes a JSONB row).
- Bearer-token auth on ops-read is unchanged (`authenticateBearer` over `hashedTokenAllowlist`; loopback-trusted only when the allowlist is empty, with fail-closed transport).
- No credentials/secrets enter any payload (ServiceDiagnostics already exposes only safe counters; execution payload is counts/timestamps, never order/credential detail).
- The `@trading-platform/sdk` capability assertions (`live/execution/credentials/... = false`) are untouched.

---

## 11. Error handling & degradation (consolidated)

| condition | behavior |
|---|---|
| market-service `DATABASE_URL` unset or `MARKET_HEALTH_PERSIST=off` | `NoopHealthSnapshotSink`; no rows; market/coverage read `unavailable`; market-service unaffected |
| PG write fails (sink) | swallowed + logged once; bounded timeout; no retry storm; heartbeat loop never blocks |
| latest snapshot stale (> `*_STALE_MS`) | reader reports `degraded`/`down` (writer-death visible) |
| no snapshot row | reader returns `null` → handler `availability:'unavailable'` |
| ops-read PG unreachable | existing behavior — `internal_read_error` / `unavailable`, never fabricated |
| coverage with aggregation off | `unsupported` rollup; honest |
| no recent `execution_*` events | execution-health `unavailable` (honest "no recent activity") |

---

## 12. Testing strategy (TDD)

- **Migration:** table shape; upsert keeps one row per (domain, source); `captured_at_ms` updates on conflict.
- **`platform_health_snapshot_writer` (unit):** upsert via fake/embedded `pool`; payload round-trip.
- **runtime snapshotter (unit):** interval tick writes a `runtime` row; computes indicators from injected in-memory state; stops on shutdown; write error swallowed (loop survives).
- **`evaluateHealthGate` extraction (parity):** extracted module yields identical indicators to the prior in-script logic for representative inputs; `check_runtime_health.ts` CLI unchanged.
- **`HealthSnapshotSink` (unit):** `NoopHealthSnapshotSink` is a no-op (no DB import reachable from market-service core — an import-boundary guard asserts `src/market/**` never imports `pg`/canonical writers); `PgHealthSnapshotSink` writes via `max:1` pool, bounded timeout, swallow-on-error, non-blocking.
- **market-service wiring (unit):** bin engages `PgHealthSnapshotSink` only when `DATABASE_URL` + `MARKET_HEALTH_PERSIST`; else `Noop`. Heartbeat loop publishes market snapshot; coverage rollup is aggregated per (source,kind), not per-symbol.
- **PG readers (unit, fake/embedded PG):** runtime (multi-source worst-of + composed `serviceOk`/`freshnessOk`), market (`deriveMarketStatus` + staleness), coverage (`deriveCoverageState`); stale row → degraded/down; absent → `null`.
- **`execution-health` reader (unit):** derives counts/last-event from `operational_event` `execution_*`; rising errors → degraded/down; no rows → unavailable.
- **Ops handlers/dispatch (contract):** `/ops/health/runtime|market|execution`, `/ops/coverage` return DTOs or `availability:'unavailable'`; `OpsError` taxonomy respected; `/ops/discover` advertises `execution-health` + backed capabilities.
- **Integration (real PG):** writer process → row → ops-read reader → `/ops/*` response; staleness path; **no-`DATABASE_URL` market-service degradation** (Noop, ops-read unavailable, market-service healthy).
- **Boundary guards:** market-service core has no PG/canonical import; ops surface remains GET-only (no mutation route added).

---

## 13. File / module layout (all in `trading-platform`)

```
migrations/canonical/<next>_create_platform_health_snapshot.sql   # new — the channel table
src/canonical/writers/platform_health_snapshot_writer.ts          # new — shared PG upsert (writeSnapshot)
src/operations/health/health_gate.ts                              # new — extracted evaluateHealthGate (+ helpers), side-effect-free
scripts/check_runtime_health.ts                                   # edit — import gate from health_gate; CLI unchanged
src/runtime/health/runtime_health_snapshotter.ts                  # new — periodic runtime snapshot tick
src/app/run_long_oi.ts                                            # edit — start snapshotter with BotRunHandle pool/writer
src/app/run_short_oi.ts                                           # edit — same
src/market/health/health_snapshot_sink.ts                         # new — HealthSnapshotSink port + NoopHealthSnapshotSink (core, no pg)
src/market/service/market_data_service.ts                         # edit — accept optional sink; publish market snapshot from startHeartbeat (not hot path)
src/market/service/finalization/coverage_emitter.ts               # edit — publish aggregated coverage rollup to sink
src/canonical/adapter/pg_health_snapshot_sink.ts                  # new — PgHealthSnapshotSink (own max:1 pool), composition-boundary only
src/app/run_market_data_service.ts                                # edit — inject PgHealthSnapshotSink iff DATABASE_URL + MARKET_HEALTH_PERSIST, else Noop
src/operations/sources/runtime-health-reader.ts                   # edit — add createPgRuntimeHealthReader (deriveRuntimeStatus reused)
src/operations/sources/market-health-reader.ts                    # edit — add createPgMarketHealthReader
src/operations/sources/source-coverage-reader.ts                  # edit — add createPgSourceCoverageReader
src/operations/sources/execution-health-reader.ts                 # new — activity-proxy over operational_event
src/operations/handlers/get-execution-health.ts                   # new
src/operations/dispatch.ts                                        # edit — register execution-health handler
src/operations/dto.ts                                             # edit — ExecutionActivityHealthSnapshot
src/operations/<catalog>.ts (OPS_RESOURCE_CATALOG / allowed-args) # edit — add execution-health; reflect backed capabilities
src/operations/bin/start-ops-read.ts                              # edit — swap 3 stubs → PG readers; inject execution reader
```

---

## 14. Milestones

- **M0 — channel + calibration:** migration `platform_health_snapshot` + `platform_health_snapshot_writer` + tests. **Calibration:** confirm, against real `evaluateHealthGate` inputs, the runtime-scoped vs cross-process indicator split (§5.1 note) and the exact `operational_event` `execution_*` type names (§6.3).
- **M1 — runtime half (cheap):** extract `evaluateHealthGate` → `health_gate.ts` (parity test) + `runtime_health_snapshotter` wired in `run_long_oi`/`run_short_oi` + `createPgRuntimeHealthReader` un-stub + `execution-health` reader/handler/DTO/catalog (independent, PG-native). After M1, `/ops/health/runtime` + `/ops/health/execution` are live.
- **M2 — market half (gated sink):** `HealthSnapshotSink` port + `NoopHealthSnapshotSink` (core) + `PgHealthSnapshotSink` (adapter, `max:1`) + market/coverage publish from heartbeat/coverage loops + bin wiring (`DATABASE_URL` + `MARKET_HEALTH_PERSIST`) + `createPgMarketHealthReader`/`createPgSourceCoverageReader` un-stub + import-boundary guard (market core has no pg). After M2, `/ops/health/market` + `/ops/coverage` are live when enabled.
- **M3 — discover + integration + hardening:** `/ops/discover` updates + real-PG integration tests (writer→row→reader; staleness; no-`DATABASE_URL` degradation) + final honesty/availability conformance.

M1 may ship independently of M2 (the runtime half is decoupled from the market half).

---

## 15. Risks & future phases

- **Cross-process runtime gate (primary design risk):** the global gate historically merged JSONL across processes; in-process computation loses the cross-process view. Mitigated by composing `serviceOk`/`freshnessOk` from the `market`/`coverage` snapshots in the runtime reader, with honest degradation where a source is absent. Confirmed in M0 calibration; **never assume `true`**.
- **New DB coupling on the market-service:** mitigated by the optional gated `HealthSnapshotSink` (core stays DB-free; PG only at the bin; `max:1` pool; fire-and-forget; no hot-path, no retry-storm). Default deployment is unchanged.
- **`evaluateHealthGate` extraction** drags helper types/scanners; a parity test pins behavior.
- **execution-health is activity-only.** True broker/exchange connection-health needs new in-memory state in `LiveBackend`/exchange clients — a separate later phase.
- **Future phases:** **Phase 4b** — trading-office `PlatformMonitoringConnector` folds `/ops/*` into `CompositeOfficeReadConnector`, adds office DTOs + new `infraSourceDomainSchema` domains (e.g. `platform-ops-api`, `platform-runtime-health`, `platform-market-health`, `execution-backend`), and flips office `bot-health` (from `/ops/runs`) + platform-infra panels from `gap` to live. Later: true broker connection-health; optional bounded snapshot history for trends.

---

## 16. Source-of-truth references (trading-platform — mirror/extend in place)

- Ops Read spec: `trading-platform/specs/033-platform-ops-read-api/`.
- Read process / stubs: `src/operations/bin/start-ops-read.ts` (`readers` bag; `unavailableRuntimeHealth`/`unavailableMarketHealth`/`unavailableSourceCoverage`).
- Dispatch + DTOs: `src/operations/dispatch.ts` (`OPS_READ_HANDLERS`), `src/operations/dto.ts` (`RuntimeHealthSnapshot`/`RuntimeHealthIndicators`, `MarketServiceHealthSnapshot`/`MarketHealthSignal`, `SourceCoverageSnapshot`/`SourceFreshnessSignal`), `src/operations/access/auth.ts`.
- Reader contracts + derive helpers: `src/operations/sources/{runtime-health-reader,market-health-reader,source-coverage-reader,runs-reader,trades-reader}.ts` (`deriveRuntimeStatus` exported here; `deriveMarketStatus`, `deriveCoverageState`; `DEFAULT_MARKET_FRESH_MS`/`DEFAULT_COVERAGE_FRESH_MS = 120000`).
- Working "ops reads PG" pattern: `createPgRunsReader`/`createPgTradesReader` (+ `src/canonical/pg/pool.ts::getDefaultPool`).
- Runtime pool/writers: `src/canonical/bootstrap/bot_run_bootstrap.ts` (`bootstrapBotRun` → `BotRunHandle`), `src/canonical/adapter/{runtime_canonical_writer,canonical_append_only_writer}.ts`; runtime bins `src/app/run_long_oi.ts`/`run_short_oi.ts`; `src/runtime/runtime_lifecycle/startup_orchestrator.ts`; `src/runtime/safety/startup_diagnostics.ts`.
- Optional-capability precedent: `attachDecisionLogCapability` (gated, `DATABASE_URL`-conditional, no-op when unset).
- Gate: `scripts/check_runtime_health.ts::evaluateHealthGate` (unexported; top-level `main()`).
- Market-service (DB-free core): `src/app/run_market_data_service.ts`, `src/market/service/market_data_service.ts` (`startHeartbeat`), `src/market/service/service_diagnostics.ts` (`ServiceDiagnostics.snapshot()`), `src/market/service/finalization/coverage_emitter.ts`, `src/market/providers/local_exchange_runtime_market_provider.ts`.
- Execution: `src/execution/backends/live/live_backend.ts`; events via `RuntimeCanonicalWriter.recordLiveEvent` → `canonical.operational_event` (`src/canonical/contracts/operational_event.ts::OPERATIONAL_EVENT_TYPES`).
- Schema precedent: `migrations/canonical/{0003_create_bot_run,0006_create_operational_event,0010_*}.sql`.
