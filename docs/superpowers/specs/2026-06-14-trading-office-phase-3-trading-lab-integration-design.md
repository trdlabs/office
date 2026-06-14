# Phase 3 — Connect trading-office to the real trading-lab API

- **Status:** Design approved (section-by-section + refinement round), 2026-06-14. Implementation NOT started.
- **Branch:** `phase-3-trading-lab-integration`.
- **Builds on:** Phase 2 (`Office Gateway + Realtime Event Stream Foundation`, spec `2026-06-13-trading-office-phase-2-office-gateway-event-stream-design.md`) and the 2026-06-14 office UI redesign.
- **Workspace:** `trading-ai` (repos `trading-lab`, `trading-office`, `trading-platform` — all gortex-indexed). trading-office = npm workspaces; trading-lab = pnpm. **Workspaces are NOT merged; no cross-repo TS imports.**

---

## 1. Context & goal

Phase 2 delivered a seam-only, fixture-backed office: a Hono server (`apps/server`), a read-only `OfficeReadConnector` port with a `FixtureOfficeReadConnector`, HTTP snapshot routes, one server→client WebSocket `OfficeEvent` stream, and an inert operator-message path. The `OfficeReadConnector` doc-comment already names Phase 3: *"implements this same port as a CompositeOfficeConnector composing a TradingLabReadConnector + a read-only PlatformMonitoringConnector."*

trading-lab has since grown a **typed service-to-service API** (it had none at Phase 2 time): a Read API + an internal SSE stream + a chat ingress. Phase 3 replaces fixture-backed data with the real trading-lab source **where that source genuinely exists**, and is honest (empty + documented gap) where it does not.

**Goal:** in `OFFICE_CONNECTOR_MODE=trading-lab`, office panels and the live floor are driven by real trading-lab reads + SSE, the operator chat really calls trading-lab's chat ingress and follows the resulting task's downstream progress, and every absent source is shown as an explicit gap — never faked.

### Hard boundary (unchanged from Phase 2)

```
browser ──HTTP/WS── trading-office apps/server ──HTTP+SSE── trading-lab
 (VITE_OFFICE_MODE = mock|connected)   │  (OFFICE_CONNECTOR_MODE       (READ_API_PORT /v1 read,
                                       │   = fixture|trading-lab)       INGRESS_PORT /chat)
                                       └─ trading-lab URLs + tokens live ONLY here
```

The browser **never** calls trading-lab and **never** holds trading-lab URLs/tokens. Only `apps/server` may call trading-lab.

---

## 2. Scope

**In scope**

- Real `TradingLabReadConnector` (HTTP) for agent statuses/activity, hypotheses, backtests.
- Real SSE → office WS bridge (`/v1/stream` → office `OfficeEvent`s).
- Real chat ingress call (`POST /chat/messages`) via `TradingLabChatConnector`.
- Downstream task progress in chat **only when correlation is reliable** (explicit-field correlation; honest fallback otherwise).
- Source gaps for `knowledge` and `bot-health` (empty + explicit marker; no fixtures).
- Server-only config/env (mode switch, lab URLs/tokens, chat-follow guards).
- Composite connector, infra health aggregation, web gap-states, contract widening for honest nulls.

**Out of scope (do not build in Phase 3)**

- trading-platform monitoring integration; real bot-health / live runtime status; platform infra/runtime health.
- Docker / compose packaging; production deploy; auth rewrite.
- Direct DB access; any TS import from the trading-lab repo; any browser → trading-lab call.
- Execution commands / command channel over WS.
- **Any fixture / sample / fabricated data while in `trading-lab` mode.**

---

## 3. Architecture & boundary

`OfficeReadConnector` (server-side, read-only by type — no write/execute method) stays the office-facing port. Bootstrap (`index.ts`) selects the implementation by `OFFICE_CONNECTOR_MODE`:

- `fixture` → `FixtureOfficeReadConnector` (Phase 2, unchanged) + inert operator responder. Existing tests stay green.
- `trading-lab` → `CompositeOfficeReadConnector` + `TradingLabStreamBridge` + `TradingLabOperatorResponder`.

Browser ↔ office contract (HTTP routes + the single WS) is unchanged except for additive, honesty-driven DTO widening (§8). The client mode switch (`VITE_OFFICE_MODE = mock|connected`) is untouched and remains ignorant of trading-lab.

---

## 4. Config & environment (server-only)

`apps/server/src/config.ts` (`OfficeServerConfig` / `loadConfig`) is extended. All new vars are read **only** server-side; none are Vite/`VITE_*` and none reach the browser bundle (a guard test asserts this).

| env var | meaning | default |
|---|---|---|
| `OFFICE_CONNECTOR_MODE` | `fixture` \| `trading-lab` | `fixture` |
| `TRADING_LAB_READ_URL` | Read API base (e.g. `http://localhost:3100`) | `http://localhost:3100` |
| `TRADING_LAB_READ_TOKEN` | Read API bearer token | — |
| `TRADING_LAB_CHAT_URL` | Chat ingress base (e.g. `http://localhost:3000`) | `http://localhost:3000` |
| `TRADING_LAB_CHAT_TOKEN` | Chat ingress bearer token | — |
| `OFFICE_CHAT_FOLLOW_MAX_MS` | follower max total duration | `300000` |
| `OFFICE_CHAT_FOLLOW_IDLE_MS` | follower idle timeout (no correlated event) | `45000` |
| `OFFICE_CHAT_FOLLOW_MAX_DELTAS` | follower max emitted deltas | `200` |
| `OFFICE_CHAT_BOOTSTRAP_RETRIES` | correlationId bootstrap attempts | `8` |
| `OFFICE_CHAT_BOOTSTRAP_INTERVAL_MS` | bootstrap retry interval | `750` |
| `OFFICE_STREAM_RECONNECT_BASE_MS` | SSE reconnect backoff base | `1000` |
| `OFFICE_STREAM_RECONNECT_MAX_MS` | SSE reconnect backoff ceiling | `30000` |

**Fail-fast:** `trading-lab` mode without `TRADING_LAB_READ_URL` + `TRADING_LAB_READ_TOKEN` aborts at boot with a clear error. Missing chat URL/token does **not** abort reads; instead the operator path emits `operator_message_failed` + a one-time `system_notice('chat ingress not configured')`. (Chat availability is surfaced via that notice and the failed turn, not via `InfraStatus.sources` — the sources map intentionally covers only the five read/stream/gap domains in §5.4.)

---

## 5. Connectors & composite (read path)

### 5.1 `TradingLabReadConnector` + `TradingLabHttpClient`

`TradingLabHttpClient` wraps `fetch`: injects `Authorization: Bearer <TRADING_LAB_READ_TOKEN>`, sets a request timeout, and maps transport/HTTP outcomes to office errors:

- network error / timeout / 5xx → `OfficeError{ code:'upstream_unavailable', message }`
- 401/403 → `OfficeError{ code:'upstream_unauthorized', message }`
- 4xx (bad cursor etc.) → `OfficeError{ code:'upstream_bad_request', message }`

`TradingLabReadConnector` implements the read methods of `OfficeReadConnector` it can source, calling: `GET /v1/agents`, `GET /v1/agents/:agentId`, `GET /v1/hypotheses`, `GET /v1/backtests` (with `Authorization: Bearer`). Responses are parsed against a **hand-mirrored** minimal input type set (`labDtos.ts`) — only the fields office consumes — then mapped (§5.2). **No trading-lab TS import.**

trading-lab list envelopes differ and are handled explicitly: `/v1/hypotheses` + `/v1/backtests` → `{ data, page:{ nextCursor, limit } }`; `/v1/agents` → `{ data, cursor }`. Phase 3 consumes the first page only (panels are summaries); pagination knobs are noted as a future enhancement, not built.

### 5.2 DTO mirror & mapping tables (explicit, sanitized)

Mappers live in `apps/server/src/connector/tradinglab/mappers.ts`. Trading-lab field names are mirrored from its `src/read-api/dto.ts` (source of truth) by hand.

**Agent id (lab → office):**

| lab `agentId` | office id |
|---|---|
| `analyst` | `analyst` |
| `researcher` | `researcher` |
| `critic` | `critic` |
| `builder` | `builder` |
| `system` | `boss` |

Office `evaluator` and `perf-monitor` have **no lab source** → remain static `idle`. This is a **documented source gap** (`InfraStatus.sources`), not a claim that they are working. `system → boss` applies **only** to status/activity/logs/traces — it does **not** mean boss opens chat; the global `OperatorChatPanel` stays an independent shell surface.

**Agent status (lab `AgentLifecycle` → office `AgentStatus`):**

| lab | office | notes |
|---|---|---|
| `idle` | `idle` | |
| `succeeded` | `success` | |
| `failed` | `failed` | |
| `working` | per-agent busy flavor | `critic→reviewing`, `builder→running`, others (`analyst/researcher/boss`) → `thinking` |

The per-agent flavor keeps the floor's character; office statuses `waiting`/`backtesting`/`blocked` are not driven by the 4-value lab lifecycle in Phase 3 (documented).

**Hypothesis (lab `HypothesisListItemDto` → office `Hypothesis`):**

| office field | source |
|---|---|
| `id` | `id` |
| `title` | `thesis` |
| `summary` | `targetBehavior` |
| `stage` | `status`: `validated→validated`, `rejected→rejected` |

⚠️ **Gap:** the Read API exposes **only** `validated|rejected` hypotheses. Office stages `proposed`/`testing` are never populated from trading-lab. Documented; no alternative source invented.

**Backtest (lab `BacktestDto` → office `BacktestSummary`) — null-honest:**

| office field | source | when absent |
|---|---|---|
| `id` | `id` | — |
| `pnlPct` | `metrics.netPnlPct` | `null` |
| `sharpe` | `metrics.sharpe` | `null` |
| `winRatePct` | `metrics.winRate × 100` (lab `winRate` is a fraction 0..1) | `null` |
| `maxDrawdownPct` | `metrics.maxDrawdownPct` | `null` |
| `strategy` | — (no lab source) | `null` |
| `symbol` | — (no lab source) | `null` |
| `period` | — (no lab source; not synthesized) | `null` |

**No `null → 0`.** Missing source values stay `null`; the UI renders `—` (§8 widens the DTO). `winRate`'s unit is asserted as a fraction by the trading-lab mapper's naming convention (peers carry a `Pct` suffix, `winRate` does not) — to be confirmed against a live `backtest.completed` payload during M1; if it is already a percent, drop the ×100.

**Agent activity (lab `AgentActivityDto` → office `AgentActivity`):**

| office field | source |
|---|---|
| `agentId` | mapped id |
| `status` | mapped status |
| `currentTask` | `currentTask ? humanize(currentTask.type) : null` |
| `logs` | `trace.map(e → { ts: e.ts, level: e.level, text: e.summary })` |

`AgentEventDto.summary` is trading-lab's sanitized, deny-by-default human string (never raw payload/user text) — safe to surface verbatim.

### 5.3 `CompositeOfficeReadConnector` routing + no-source gaps

Implements `OfficeReadConnector`. Routing in `trading-lab` mode:

| method | source |
|---|---|
| `getAgentStatuses`, `getAgentActivity`, `getHypotheses`, `getBacktests` | `TradingLabReadConnector` |
| `getKnowledge` | `[]` — **gap** (no `/v1/knowledge`; no fixtures) |
| `getBotHealth` | `[]` — **gap** (platform monitoring; out of scope; no fixtures) |
| `getInfraStatus` | `InfraAggregator` (§5.4) |
| `start(emit)` | `TradingLabStreamBridge` (§6) |

**Invariant:** in `trading-lab` mode the composite never returns fixture/sample data for any method. No fake bot statuses, no fake knowledge docs.

### 5.4 `InfraAggregator` + `InfraStatus.sources`

`getInfraStatus()` returns the existing `InfraStatus` shape plus the new `sources` map (§8). `InfraAggregator`:

- `services`: office-server (always up) + trading-lab read API (`GET /healthz`/`/readyz` → up/degraded) + trading-lab stream (live/degraded/error from the bridge's state).
- `queues`: `[]` — no reliable source (trading-lab queue depth is not on the Read API). Not synthesized.
- `lastSync`: timestamp of the last successful read/health probe.
- `sources` (honest source map):

| domain | state values | Phase 3 |
|---|---|---|
| `office-server` | `live` | `live` |
| `trading-lab-read-api` | `live` \| `error` | from healthz/readyz + last read outcome |
| `trading-lab-stream` | `live` \| `degraded` \| `error` | from `TradingLabStreamBridge` |
| `knowledge` | `gap` | `gap` |
| `bot-health` | `gap` | `gap` |

In `fixture` mode the aggregator reports all domains as `fixture`/`live` so no gap markers show.

---

## 6. SSE → WS bridge + degradation semantics

`TradingLabStreamBridge` holds **one** long-lived upstream SSE connection to `GET /v1/stream` (`Authorization: Bearer <read token>`, `Last-Event-ID` resume) and fans out via an internal emitter to **(a)** the floor bridge (maps + publishes to `OfficeEventBus`) and **(b)** any active `ConversationFollower`s (§7), which filter by `correlationId`.

**Event mapping (floor bridge):**

| trading-lab SSE | office `OfficeEvent` |
|---|---|
| `agent_status_changed { agentId, status, currentTaskId, ts }` | `agent_status_changed { agentId: map, status: mapStatus, ts }` |
| `agent_event_appended { agentId, event }` | `agent_trace_appended { agentId: map, line: { ts: event.ts, level: event.level, text: event.summary }, ts }` |

The `agent_event_appended` SSE frame carries an `id:` (keyset cursor) — the bridge tracks it as the resume token. `agent_status_changed` carries no `id:` (re-derivable on replay).

**Degradation semantics (explicit):**

- If `/v1/stream` drops or never connects, **HTTP snapshot reads keep working** (panels still load).
- The office WS publishes a one-time `system_notice('warn', 'live stream degraded — reconnecting')`; `InfraStatus.sources['trading-lab-stream']` flips to `degraded`/`error`.
- Reconnect with exponential backoff (`OFFICE_STREAM_RECONNECT_BASE_MS` → `…_MAX_MS`), resuming from the last `Last-Event-ID`.
- On restore, the bridge re-emits a fresh `agent_statuses_snapshot` (re-read `getAgentStatuses()`), and `sources['trading-lab-stream']` returns to `live`.
- **No browser fallback to fixtures** in `trading-lab` mode — degraded is shown, never masked.

---

## 7. Operator chat — follow downstream

Path: browser `POST /api/office/operator/messages` (`OperatorMessage { text, source:'web', target:'orchestrator', floorId }`) → `assertNoExecutionAuthority` (target must be `orchestrator`) → mint `operatorMessageId` / `conversationId` / `replyMessageId` → `TradingLabChatConnector.send({ message: text, sessionId: conversationId, channel:'web' })` with `Authorization: Bearer <chat token>` → synchronous `ChatResponse`. The HTTP POST returns `OperatorMessageAccepted` immediately; the turn lifecycle is emitted over the office WS. `conversationId ≡ sessionId` (office-owned, reused for multi-turn).

`TradingLabOperatorResponder` replaces the inert Phase 2 responder in `trading-lab` mode; it keeps the same guard, the same `OperatorMessageAccepted` HTTP return, and emits lifecycle over the same bus. No command channel over WS.

### 7.1 `ChatResponse.kind` → office lifecycle

`operator_message_accepted` is emitted first in every case. Then:

| `kind` | office lifecycle |
|---|---|
| `needs_clarification` | `…_delta(question)` → `…_completed` (terminal; no follow) |
| `out_of_scope` | `…_delta(message)` → `…_completed` (terminal; no follow) |
| `help` | `…_delta(message + supportedIntents)` → `…_completed` (terminal; no follow) |
| `capability_not_available` | `…_delta(message)` → `…_completed` (terminal; no follow) |
| `rejected` | `operator_message_failed{ error }` |
| `error` | `operator_message_failed{ error }` |
| `task_status` — terminal `completed` | `…_completed('Task <taskId> completed')` (no follow) |
| `task_status` — terminal `failed` / `rejected` | `operator_message_failed{ error }` (no follow) |
| `task_status` — active `accepted` / `queued` / `running` | `…_completed('Task <taskId> is <status>')` — one informational reply, **NO follower** (a status query reports the current status; downstream following is for `task_created`) |
| `task_created` | `…_progress{ stage:'task_created', note:'<taskType> · <taskId>' }` → reliable-correlationId gate (below) |

`ChatResponse` is the full discriminated union: `task_created`, `task_status`, `needs_clarification`, `out_of_scope`, `help`, `capability_not_available`, `rejected`, `error` (every variant carries `sessionId`). `task_status.status` is a `TaskStatus` — terminal = `completed | failed | rejected`, active = `accepted | queued | running`.

**Reliable-correlationId gate (`task_created` only):** the `ConversationFollower` (§7.2) is started on `task_created`; it follows **only** if a `correlationId` is reliably obtained via explicit-field bootstrap — otherwise the turn finalizes honestly ("Live task progress is unavailable"), **never** a heuristic follow based on text or task status. Active `task_status` does **not** start a follower (it reports the current status as one informational reply); a chained `task_created` passes `nextTaskType = plannedNextStep.taskType` so the follower advances the original task's terminal (as a progress delta) and awaits the chained task's terminal.

All delta text is human-readable; never raw debug payload.

### 7.2 `ConversationFollower` — correlation, terminal, guards

**Correlation is by explicit fields only — never guessed from text.**

1. **Bootstrap correlationId:** poll `GET /v1/agent-events?taskId=<task_created.taskId>` (up to `BOOTSTRAP_RETRIES` × `BOOTSTRAP_INTERVAL_MS`) and read `correlationId` off the first event that carries one. (trading-lab JOINs `research_task.correlation_id` onto event DTOs at read time; it is absent from the chat response and from event writes, so this read is the only handle.)
2. **No correlationId within cap →** finalize honestly: `operator_message_completed{ reply: 'Task <taskType> (<taskId>) was created. Live progress is unavailable.' }` + `system_notice`. **No fabricated progress.**
3. **Follow (correlationId obtained):** subscribe to the shared SSE fan-out, filter to `event.correlationId === <convCorrelationId>`. Each correlated, non-noise `agent_event_appended` → `operator_message_delta{ textDelta: event.summary }`.
   - **Noise filter (excluded from deltas):** `chat.intent_*`, `chat.task_created`, `chat.plan.created`, dedupe/reuse/store events (`*.deduped`, `backtest.reused`, `artifact.stored`). **Whitelist:** `*.started|.completed|.failed` of `strategy_analyst`, `research.run_cycle`, `builder`, `backtest`, `evaluation`, plus `hypothesis.validated|rejected`.
   - **`plannedNextStep` chaining:** the correlated subscription already spans the chain (chained task shares the same `correlationId`). `chat.plan.advanced` (correlated) signals a chain step; the chained `taskId` is discovered as a new distinct `taskId` appearing under the same `correlationId` (`nextTaskId` is stripped from the DTO).
4. **Terminal — correlated events ONLY, matched structurally (never by a hardcoded event name):** a turn terminates only on an event that satisfies ALL of —
   - explicit **`correlationId`** equal to the conversation's;
   - **`taskId`** equal to the active task's id or a known chained task id (discovered under the same `correlationId`);
   - **task-type prefix** consistent with the active task's `taskType`;
   - **terminal suffix / event type drawn from the *confirmed* trading-lab taxonomy** — failure (`failed | rejected | error`, or `chat.plan.advance_failed`) → `operator_message_failed{ error:{ code:'task_failed', message: humanized } }`; the confirmed *task-completion* type for that prefix → `operator_message_completed{ reply }`.
   - **Never** terminate from an unrelated agent-level `failed` / `succeeded` (e.g. an uncorrelated `agent_status_changed`), nor from a mid-workflow `*.completed` on a sub-step — only the active task's confirmed completion event counts.
5. **Guards (honest finalize, never fabricate success):** on `FOLLOW_MAX_MS`, `FOLLOW_IDLE_MS`, or `FOLLOW_MAX_DELTAS` without a clean terminal → `operator_message_completed{ reply: <accumulated real deltas> + ' · live progress stream ended' }` + `system_notice`. We present only what was really observed.

**`taskType` prefix → terminal event type — PROVISIONAL, confirmed by the calibration step (§13, M1/M3); do NOT hardcode these names into the plan:**

| active `taskType` (prefix) | provisional terminal type — confirm against the real taxonomy |
|---|---|
| `strategy.onboard` / `strategy.analyze_source` | `strategy_analyst.*` (`completed` / `failed`) |
| `research.run_cycle` | `research.run_cycle.*` (`completed` / failure) |
| `hypothesis.build` (→ backtest) | `evaluation.*` / `backtest.*` (`completed` / failure) |

The prefix→terminal map is sourced from trading-lab's **real event taxonomy** during calibration — explicit `correlationId` + known `taskId`/chained `taskId` + expected task prefix + confirmed terminal suffix, never an unrelated agent-level status. **If a task type's exact task-completion event cannot be confirmed, the follower degrades honestly:** it still streams correlated deltas but finalizes via guard timeout with *"Live task progress is unavailable / terminal status could not be confirmed"* — it does **not** assert or guess success. No heuristic or text-based progress is ever introduced.

---

## 8. Contract changes (office-gateway)

Additive, honesty-driven; all via zod schemas in `packages/office-gateway/src/schemas.ts` (the single source of truth) with inferred type aliases.

1. **`BacktestSummary` widened to null-honest:** `pnlPct`, `sharpe`, `winRatePct`, `maxDrawdownPct` → `number | null`; `strategy`, `symbol`, `period` → `string | null`. Fixtures keep real values (fixture-mode UI unchanged); the web `BacktestsPanel` renders `—` for `null`.
2. **`InfraStatus.sources` added:** `sources: { domain: 'office-server'|'trading-lab-read-api'|'trading-lab-stream'|'knowledge'|'bot-health'; state: 'live'|'degraded'|'error'|'gap'|'fixture'; detail: string }[]`. `queues` may be empty.
3. No other contract changes. The `OfficeEvent` union, operator lifecycle, and route descriptors are reused as-is (Phase 3 finally exercises the previously-unused `operator_message_progress`, `operator_message_failed`, `system_notice` variants).

`MockOfficeGateway` and `FixtureOfficeReadConnector` are updated to satisfy the widened shapes (report `sources` as `fixture`/`live`).

---

## 9. No-execution-authority & security boundary

- `OfficeReadConnector` remains read-only **by type** — no write/execute method is added.
- Chat is a separate operator path, guarded (`target==='orchestrator'`), server-side only. It calls trading-lab's chat ingress, which itself merely **enqueues research tasks** — it cannot execute trades; platform execution is a different boundary entirely (out of scope).
- No command channel over the office WS (WS stays server→client read-only).
- trading-lab URLs/tokens live only in `apps/server`; a test asserts none appear in the web bundle/config.
- A repo-relative import-boundary guard forbids any `trading-lab` import from `trading-office`.

---

## 10. Error handling & degradation (consolidated)

| failure | behavior (trading-lab mode) |
|---|---|
| Read 5xx/network/timeout | route returns office error body (`upstream_unavailable`); web shows error/empty + existing connection banner; **no fixture swap** |
| Read 401/403 | `upstream_unauthorized`; `sources['trading-lab-read-api']='error'` |
| `/v1/stream` down | HTTP reads keep working; `system_notice` + `sources['trading-lab-stream']` degraded/error; backoff reconnect + resume; fresh snapshot on restore |
| Chat ingress unset/down | `operator_message_failed` + one-time `system_notice('chat ingress not configured')`; reads unaffected |
| correlationId not found | honest `…_completed('live progress unavailable')`; no fake progress |
| follower guard tripped | honest `…_completed('live progress stream ended')` with real deltas only |

Principle: **degrade visibly, never mask with fabricated data.**

---

## 11. Testing strategy (TDD)

- **Mappers (unit):** fake lab DTOs → office DTOs; agent-id + status tables; hypothesis `validated/rejected` only (gap); backtest null-honesty (no `0` for missing; `winRate×100`); activity trace mapping.
- **`TradingLabHttpClient`:** `Authorization: Bearer <read token>` sent (assert via fake `fetch`); 401/5xx/network → mapped `OfficeError`.
- **`TradingLabStreamBridge`:** fake SSE → mapped office events; `Last-Event-ID` resume; reconnect/backoff; degraded `system_notice`; snapshot re-sync on restore.
- **`ConversationFollower`:** fake `/v1/agent-events` + SSE → correlationId bootstrap; correlationId filtering; noise filter; **success** terminal via expected type; **failure** terminal via correlated failure event; **no** terminal on uncorrelated `agent_status_changed.failed`; chained `taskId` discovery; **no-correlationId → "live progress unavailable"**; guard-timeout honest finalize.
- **`TradingLabChatConnector`:** `Authorization: Bearer <chat token>` sent; each `ChatResponse.kind` → correct lifecycle.
- **`CompositeOfficeReadConnector`:** routing (reads → lab; knowledge/bots → `[]`); `InfraStatus.sources` gap entries.
- **Server routes in BOTH modes:** `fixture` (Phase 2 suite stays green) and `trading-lab` (fake lab via injected client) over `app.request`; reads return mapped data; operator POST → `accepted` + WS lifecycle.
- **SSE-bridge integration:** a trading-lab stream event becomes an office WS event (explicit requirement).
- **Operator-chat integration:** an office operator message calls the lab chat ingress (assert token + body) and emits the office lifecycle (`accepted → progress → delta(s) → completed/failed`).
- **Boundary/exposure:** no trading-lab URLs/tokens in the web bundle/config; import-boundary guard green (no trading-lab imports).
- **Green-mode matrix:** `mock` green; `connected + fixture` green; `connected + trading-lab` smoked locally with the trading-lab API running.

---

## 12. File / module layout

```
apps/server/src/
  config.ts                                   # extend: mode + lab URLs/tokens + follow guards
  index.ts                                    # mode-switch wiring
  connector/
    OfficeReadConnector.ts                    # (unchanged port)
    FixtureOfficeReadConnector.ts             # (unchanged) + sources:fixture
    CompositeOfficeReadConnector.ts           # new — routing + no-source gaps
    InfraAggregator.ts                        # new — health + sources map
    tradinglab/
      TradingLabHttpClient.ts                 # new — fetch + bearer + error mapping
      TradingLabReadConnector.ts              # new — /v1 reads
      labDtos.ts                              # new — hand-mirrored input fields (no lab import)
      mappers.ts                              # new — id/status/hypothesis/backtest/activity maps
      TradingLabStreamBridge.ts               # new — one SSE conn + resume + fan-out
      index.ts
  operator/
    responder.ts                              # (unchanged inert path, fixture mode)
    TradingLabOperatorResponder.ts            # new — chat connector + follower
    ConversationFollower.ts                   # new — correlation/terminal/guards
    summaryFilter.ts                          # new — noise filter / whitelist
    TradingLabChatConnector.ts                # new — POST /chat/messages (bearer chat token)
packages/office-gateway/src/schemas.ts        # widen BacktestSummary; add InfraStatus.sources
apps/web/src/...                              # BacktestsPanel '—'; Knowledge/BotHealth gap empty-states; Infra sources; store progress/system_notice
```

---

## 13. Milestones

- **M1 — reads + calibration #1:** config + mode switch + `TradingLabHttpClient` + `TradingLabReadConnector` + `labDtos` + `mappers` + `CompositeOfficeReadConnector` (reads) + `BacktestSummary` widening + web `—`/gap empty-states + tests. **Calibration pass #1:** inspect real trading-lab event types / tests / sample payloads — confirm the `winRate` unit (drop `×100` if the payload is already a percent) and gather the candidate task-completion event prefixes/suffixes per supported `taskType` (feeds §7.2).
- **M2 — live:** `TradingLabStreamBridge` (SSE → WS, resume, degradation) + integration test + snapshot re-sync.
- **M3 — chat follow-downstream (RISK-HEAVY):** `TradingLabChatConnector` + `TradingLabOperatorResponder` + `ConversationFollower` + `summaryFilter` + tests/integration; handles `task_created` **and** `task_status` (§7.1). **Calibration gate:** confirm, per supported `taskType`, the exact task-completion event (prefix + terminal suffix) that marks the *task* done — distinct from a mid-workflow `*.completed` — against real trading-lab event types/tests/sample payloads. **If a task type's terminal cannot be confirmed, the follower degrades honestly** (correlated deltas + guard-completed / "terminal status could not be confirmed"); an unreliable-overall result degrades to honest `task_created`/`task_status` + "live progress unavailable" — **never** heuristic/guessed progress.
- **M4 — finish:** `InfraAggregator` + `InfraStatus.sources` + web infra/gap polish + conformance (`mock == connected` fixture) + import-boundary/exposure guards + local trading-lab smoke.

M3 may ship independently after M1–M2 if needed.

---

## 14. Risks & future phases

- **M3 correlation reliability** (primary risk) — mitigated by explicit-field-only correlation + honest degradation; never heuristic.
- **`winRate` unit** — confirm fraction vs percent against a live payload in M1.
- **Hypothesis stages** — only `validated|rejected` will ever appear; `proposed|testing` need a future trading-lab source.
- **Future phases (not Phase 3):** trading-platform monitoring connector (real bot-health, runtime/paper status, positions/orders/fills, platform infra health) flipping `bot-health` from `gap` to `live`; knowledge source; stream pagination/per-conversation server-side filtering.

---

## 15. Source-of-truth references (trading-lab, mirror field names from here — do not import)

- Read API DTOs: `trading-lab/src/read-api/dto.ts`; mappers: `…/mappers.ts`; SSE frames/event-name constants: `…/stream-frames.ts`; agent taxonomy/lifecycle: `…/agent-taxonomy.ts`.
- Chat request (zod): `trading-lab/src/chat/request.ts`; chat response union: `…/chat/response.ts`; task/agent-task enums: `trading-lab/src/domain/types.ts` + `…/schemas.ts`.
- correlationId provenance: `trading-lab/src/chat/chat-handler.ts` (generated per message) → `…/orchestrator/task-intake.ts`, `…/orchestrator/chain-runner.ts` (shared across `plannedNextStep`); read-time JOIN: `…/adapters/read/drizzle-agent-event-read.adapter.ts`.
- Env contract: `trading-lab/src/config/env.ts` (`READ_API_PORT` 3100, `INGRESS_PORT` 3000, `TRADING_LAB_READ_TOKEN`, `TRADING_LAB_CHAT_TOKEN`).
- Contract docs: `trading-lab/src/read-api/README.md`, `…/chat/README.md`.
