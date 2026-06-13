# Trading Office — Phase 2: Office Gateway + Realtime Event Stream Foundation — Design

Status: **approved (design)** · Date: 2026-06-13 · Builds on Phase 1 (Application
Shell, merged to `main`). Supersedes nothing.

## Goal

Move `trading-office` from a frontend-only mock shell to its first **backend /
gateway seam** — without granting execution authority and without crossing any of
the architectural boundaries Phase 1 established.

Phase 2 stands up a real `trading-office` **server** (`apps/server`, Hono) behind
the existing read-only `OfficeGateway` contract, adds a real **HTTP + WebSocket
transport** between the browser and that server, and defines the **read-only
`OfficeReadConnector`** boundary — implemented in this phase only as a fixture
connector. `trading-lab` is **not modified**. `trading-platform` is **not
touched**. No real data, no real LLM, no execution.

### What "Connected mode" means in Phase 2 (the one definition to remember)

> **Connected mode = real `browser → office server → connector` boundary + real
> WebSocket transport. The data and the events are still fixture / simulated.**

Connected mode does **not** mean real `trading-lab` integration. Proving the
*network + contract + serialization path* is the whole point; wiring real
`trading-lab` reads is **Phase 3**, scoped by a separate spec.

This keeps Phase 2 from becoming a backend / auth / Postgres / realtime rewrite.

## Why now / what the current code already gives us

- The browser already crosses exactly one boundary: the read-only `OfficeGateway`
  interface (8 methods). Panels consume it through a `useResource(fetcher, deps)`
  hook that already models `loading / error / data`, so swapping the gateway
  implementation does **not** rewrite panels.
- There is exactly one place that constructs the gateway: `RuntimeContext.tsx`
  (`new MockOfficeGateway()`). That is the single mode-switch point.
- `trading-lab` has **no read API**. Its Hono ingress is write-only
  (`POST /tasks`, `POST /callbacks/backtest-completed`); it is a hexagonal worker
  (BullMQ + drizzle/Postgres) whose read models live in the DB, not on HTTP.
  `trading-lab` is also a separate repo on **pnpm**, while `trading-office` is
  **npm workspaces** — a real cross-repo boundary. Therefore Phase 2 defines the
  connector boundary and ships a **fixture** connector; the real read wiring is
  deferred and only **documented** here as Phase 3 input.

## Architectural boundaries (held for the whole phase)

1. **The browser talks only to the `OfficeGateway` contract.** In Phase 2 there
   are two implementations: `MockOfficeGateway` (dev fallback) and
   `HttpOfficeGateway` (HTTP snapshots + one WS event stream). Panels never know
   which one is active.
2. **No execution authority — enforced by type, not by convention.** The
   `OfficeReadConnector` port has **no write/execute method**. There is no
   affordance by which the office could command an agent system.
3. **The browser never imports `trading-lab` or `trading-platform`; neither does
   any `trading-office` app.** The cross-repo boundary is a network boundary, and
   in Phase 2 it is not crossed at all (the connector is fixture-backed).
4. **WebSocket is read-only, server → client only.** Commands / operator messages
   are **never** sent over WS. Operator submit is an HTTP POST; lifecycle comes
   back as WS events.
5. **`trading-platform` stays the execution / data authority; `trading-lab` stays
   the first connected agent system.** `trading-office` is a control-room view
   with no authority over either.
6. **Frozen foundations stay frozen:** `packages/office-visual-kit` is untouched;
   `packages/trading-lab-floor` (floor SSOT, incl. the `boss` agent role) is
   untouched — the rename to operator/orchestrator happens only at the app +
   contract layer.

## 1. Workspace structure

### New packages

- **`packages/office-gateway`** — the **pure shared contract**. No runtime, no
  Node-only code, browser-safe. Imported by both `apps/web` (client types) and
  `apps/server` (server types). The contract depends on **neither** app.

  **Contains:** DTOs · the `OfficeGateway`-shaped contract · HTTP route
  descriptors · the `OfficeEvent` WS schema · common response / error shapes ·
  zod schemas for externally serialized payloads.

  **Does NOT contain:** Hono · Node-only code · server runtime · connector
  implementations · `trading-lab` / `trading-platform` imports · Postgres / auth /
  runtime code · the browser fetch/WS client (that lives in `apps/web`).

- **`packages/office-fixtures`** — **shared deterministic demo data**, browser-safe
  and pure, typed via `packages/office-gateway`. Single source of demo truth so
  that mock mode and connected mode show the **same office world** (this is what
  makes the `mock == connected` conformance test meaningful).

  **Contains:** static demo snapshots · status pools · deterministic trace /
  message fixture templates · pure helpers (e.g. `agentActivity(agentId)`,
  `cannedOperatorReply(text)`).

  **Does NOT contain:** timers / `setInterval` · WebSocket · Hono · Node-only
  code · server event bus · connector implementation · `localStorage` / `fetch` /
  browser runtime · `trading-lab` / `trading-platform` imports.

### New app

- **`apps/server`** — the Hono server runtime: HTTP routes + one WS endpoint +
  the `OfficeReadConnector` port + `FixtureOfficeReadConnector` + the fixture
  event producer + the centralized no-execution-authority guard. New `npm`
  workspace member (the root `workspaces` already globs `apps/*`).

### Changed

- **`apps/web`** — gains `HttpOfficeGateway`; `MockOfficeGateway` evolves to the
  new contract; `OfficeRuntimeStore` becomes a small `OfficeEvent` reducer;
  `BossCommandPanel` → `OperatorChatPanel`; `RuntimeContext` gains the mode
  switch. All other panels unchanged.

### Untouched

- `packages/office-visual-kit` (Phase 0, frozen).
- `packages/trading-lab-floor` (floor SSOT, incl. the `boss` role).
- `examples/*`.

### Dependency rules (held for the whole phase; see §9 import-boundary tests)

```
                 packages/office-gateway   — pure contract, no runtime, browser-safe
                 ┌──────────────────────────────────────────────────────────────┐
                 │ DTO · OfficeGateway contract · HTTP route descriptors          │
                 │ OfficeEvent WS schema · response/error shapes · zod            │
                 └───────────────▲────────────────────────────▲──────────────────┘
                                 │ imports types/schemas       │ imports types/schemas
       packages/office-fixtures ─┤                             │
        (shared demo data) ──────┤                             │
                                 │                             │
                      apps/web ──┘                             └── apps/server (Hono, Node)
        HttpOfficeGateway / MockOfficeGateway          routes · WS · OfficeReadConnector ·
        panels · RuntimeContext · store                FixtureOfficeReadConnector · guard · bus
```

- `apps/web → packages/office-gateway`, `apps/web → packages/office-fixtures`.
- `apps/server → packages/office-gateway`, `apps/server → packages/office-fixtures`.
- `packages/office-gateway` imports **neither** app and **no** runtime/Node code.
- `packages/office-fixtures` imports only `packages/office-gateway` (types).
- `apps/web ⇏ apps/server` and `apps/server ⇏ apps/web`.
- No app imports `trading-lab` / `trading-platform` source.
- **Package managers stay separate:** `trading-office` remains npm workspaces;
  `trading-lab` remains pnpm in its own repo. Workspaces are not merged. The
  Phase 3 connector will talk to `trading-lab` over HTTP, never by TS import.

### Server runtime / WS adapter (soft-locked)

**Locked:** Hono as the server runtime; exactly **one** WebSocket endpoint.
**Proposed, resolved by a short compatibility spike before the server WS tasks:**
the concrete Node WS adapter (candidate `@hono/node-ws`). If it does not fit
cleanly, swap the Node WS wiring (e.g. a `ws` server attached to the Node HTTP
server) **without any contract change** — the `OfficeEvent` schema and the
`WS /api/office/events` path are fixed.

## 2. Shared contract — `packages/office-gateway`

```
packages/office-gateway/src/
  dto.ts      // panel snapshots + operator types + shared primitives
  events.ts   // OfficeEvent (discriminated union) + event types
  http.ts     // route descriptors: method, path, response type (+ zod)
  errors.ts   // OfficeError, OfficeErrorBody, codes
  gateway.ts  // OfficeGateway interface
  index.ts
```

### `OfficeGateway` interface (evolved from Phase 1)

Read methods keep their Phase 1 DTO shapes. `sendBossCommand` is replaced by
`sendOperatorMessage`; the optional `subscribeAgentStatuses` is generalized to a
single `subscribeOfficeEvents` live channel.

```ts
interface OfficeGateway {
  // snapshots (HTTP GET) — DTO shapes unchanged from Phase 1
  getAgentStatuses(): Promise<AgentStatusMap>;          // initial floor snapshot
  getAgentActivity(agentId: string): Promise<AgentActivity>;
  getHypotheses(): Promise<Hypothesis[]>;
  getBacktests(): Promise<BacktestSummary[]>;
  getBotHealth(): Promise<BotHealth[]>;
  getKnowledge(): Promise<KnowledgeEntry[]>;
  getInfraStatus(): Promise<InfraStatus>;

  // operator message (HTTP POST) — replaces sendBossCommand; INERT (see §6)
  sendOperatorMessage(msg: OperatorMessage): Promise<OperatorMessageAccepted>;

  // one live channel: WS in connected, simulated in mock.
  // Replaces subscribeAgentStatuses. One connection, one callback; client filters.
  subscribeOfficeEvents?(cb: (e: OfficeEvent) => void): () => void;
}
```

### Operator domain model (not "boss command")

The correct domain actor is the **Orchestrator**, addressed as the `target` of an
**operator message into the office** — not a "boss command". This is a generic
"operator message into office" model, so the same flow can later carry
Telegram / CLI sources, and the endpoint never reads as "the browser commands the
agent system".

Request / response carry **explicitly distinct ids** for the inbound message and
the reply, so they cannot be conflated:

```ts
interface OperatorMessage {
  text: string;
  source: 'web';                 // later: 'telegram' | 'cli' | ...
  target: 'orchestrator';        // addressee inside the office
  floorId: string;               // 'trading-lab'
}
interface OperatorMessageAccepted {
  operatorMessageId: string;     // id of the inbound operator message
  conversationId: string;
  status: 'accepted';
}
interface OperatorReply {
  replyMessageId: string;        // id of the reply (distinct from operatorMessageId)
  operatorMessageId: string;     // the message this reply answers
  conversationId: string;
  text: string;
  ts: string;
}
```

### Panel snapshot DTOs (unchanged from Phase 1)

`AgentStatus` (re-exported from the kit), `AgentStatusMap`, `TraceLine`,
`AgentActivity`, `Hypothesis`, `BacktestSummary`, `BotHealth`, `KnowledgeEntry`,
`InfraService`, `InfraStatus`. (`BossMessage` is removed; replaced by the operator
types above.)

### HTTP routes (prefix `/api/office`)

```
GET  /api/office/agents/statuses            -> AgentStatusMap
GET  /api/office/agents/:agentId/activity   -> AgentActivity
GET  /api/office/hypotheses                 -> Hypothesis[]
GET  /api/office/backtests                  -> BacktestSummary[]
GET  /api/office/bots                       -> BotHealth[]
GET  /api/office/knowledge                  -> KnowledgeEntry[]
GET  /api/office/infra                      -> InfraStatus
POST /api/office/operator/messages          -> OperatorMessageAccepted   (inert; see §6)
WS   /api/office/events                     -> OfficeEvent stream (server -> client only)
```

### WS event schema — `OfficeEvent`

A discriminated union on `type` with a common `ts`. Flat envelope (ergonomic in
TS). `operator_message_*` events carry `operatorMessageId` + `conversationId`;
`progress / delta / completed / failed` additionally carry `replyMessageId`
(`accepted` has no reply yet).

```ts
type OfficeEvent =
  | { type: 'agent_statuses_snapshot';  ts: string; statuses: AgentStatusMap }
  | { type: 'agent_status_changed';     ts: string; agentId: string; status: AgentStatus }
  | { type: 'agent_trace_appended';     ts: string; agentId: string; line: TraceLine }
  | { type: 'operator_message_accepted';  ts: string; operatorMessageId: string; conversationId: string }
  | { type: 'operator_message_progress';  ts: string; operatorMessageId: string; conversationId: string; replyMessageId: string; stage?: string; note?: string }
  | { type: 'operator_message_delta';     ts: string; operatorMessageId: string; conversationId: string; replyMessageId: string; textDelta: string }
  | { type: 'operator_message_completed'; ts: string; operatorMessageId: string; conversationId: string; replyMessageId: string; reply: OperatorReply }
  | { type: 'operator_message_failed';    ts: string; operatorMessageId: string; conversationId: string; replyMessageId?: string; error: OfficeError }
  | { type: 'system_notice';  ts: string; level: 'info' | 'warn' | 'error'; text: string }
  | { type: 'office_error';   ts: string; error: OfficeError }   // common error event
  | { type: 'heartbeat';      ts: string };
```

### Error shape

```ts
interface OfficeError { code: string; message: string }
type OfficeErrorBody = { error: OfficeError };       // HTTP error body
```

`HttpOfficeGateway` maps non-2xx responses to a thrown `Error` — `useResource`
already handles rejection, so panels are unchanged.

### zod policy

zod schemas are **required** for every **externally serialized HTTP/WS payload**:
HTTP responses, the HTTP error body, the `OperatorMessage` request, the
`OperatorMessageAccepted` response, and every `OfficeEvent` on the stream. zod is
**not** required for purely internal helper types. Schemas live in the contract
package and are the single source the server validates against and the client may
parse with.

## 3. Shared fixtures — `packages/office-fixtures`

Pure, deterministic, contract-typed demo data and templates (see §1 for the in /
out lists). Both sides consume it:

- `apps/web` `MockOfficeGateway` reads snapshots from it; its client-side
  simulation wrapper uses its pools/templates.
- `apps/server` `FixtureOfficeReadConnector` reads snapshots from it; the
  server's `fixtureEventProducer` uses its pools/templates.

The fixtures hold **data and pure templates only**. All timer / event-bus /
WebSocket / simulation **runtime** lives in the consumers (`apps/server`
`fixtureEventProducer`; `apps/web` mock simulation wrapper).

## 4. Server — `apps/server`

```
apps/server/src/
  index.ts                       // bootstrap: createOfficeApp + node-server + attach WS
  app.ts                         // Hono factory: routes + WS, injects connector + bus
  routes/
    snapshots.ts                 // GET handlers -> connector.read*
    operator.ts                  // POST /operator/messages -> guard -> bus (inert)
    events.ts                    // WS /events -> subscribe bus -> stream OfficeEvent
  connector/
    OfficeReadConnector.ts       // port (read-only, no write affordance)
    FixtureOfficeReadConnector.ts// fixture reads + starts the fixture producer
  events/
    OfficeEventBus.ts            // in-proc pub/sub, fan-out to WS clients
    fixtureEventProducer.ts      // simulates status changes / traces / operator lifecycle
  guard/
    noExecutionAuthority.ts      // centralized guard for the operator path
  config.ts                      // env: port, CORS origin, tick intervals, latency
```

### `OfficeReadConnector` port (read-only — the structural no-execution guarantee)

```ts
interface OfficeReadConnector {
  getAgentStatuses(): Promise<AgentStatusMap>;
  getAgentActivity(agentId: string): Promise<AgentActivity>;
  getHypotheses(): Promise<Hypothesis[]>;
  getBacktests(): Promise<BacktestSummary[]>;
  getBotHealth(): Promise<BotHealth[]>;
  getKnowledge(): Promise<KnowledgeEntry[]>;
  getInfraStatus(): Promise<InfraStatus>;
  start(emit: (e: OfficeEvent) => void): () => void;   // begin the live event source; returns stop
}
```

The port has **no** write / execute / command method. Commanding an agent system
is impossible by type, not by agreement. Phase 2 ships only
`FixtureOfficeReadConnector`. In Phase 3 the same port is implemented by a
`CompositeOfficeConnector` that composes a `TradingLabReadConnector` (research
reads) and a read-only `PlatformMonitoringConnector` (runtime / monitoring reads)
— see §10. Any execution path would be a separate, explicitly guarded design —
out of scope here.

### Operator path (inert)

`POST /api/office/operator/messages` →
1. passes the `noExecutionAuthority` guard,
2. mints `operatorMessageId` + `conversationId`, returns `OperatorMessageAccepted`,
3. **only** publishes a simulated lifecycle
   (`operator_message_accepted/progress/delta/completed`) to the `OfficeEventBus`
   via a server-side fixture responder.

It does **not** touch the connector (which has no write path) and makes **no**
outbound call. The guard is the single place that asserts and logs this, and it
carries a test (§8 #5).

### Event bus & producer

- **`OfficeEventBus`** — a simple in-proc pub/sub. On WS connect, the client
  immediately receives `agent_statuses_snapshot`; thereafter it receives the live
  stream; `heartbeat` is emitted on an interval. No replay, no buffer, no
  guaranteed delivery — pure fan-out.
- **`fixtureEventProducer`** — moves the Phase 1 client-side `setInterval` status
  loop to the server: cycles statuses (from the shared pools) and occasionally
  emits `agent_trace_appended`, deterministic and plausible.

## 5. Client — `apps/web`

### Mode switch — single point (`RuntimeContext`)

```ts
function createGateway(): OfficeGateway {
  const mode = import.meta.env.VITE_OFFICE_MODE ?? 'mock';
  if (mode === 'connected') {
    return new HttpOfficeGateway({
      baseUrl: import.meta.env.VITE_OFFICE_GATEWAY_URL,        // http://localhost:8787
      wsUrl:   import.meta.env.VITE_OFFICE_GATEWAY_WS_URL,     // ws://localhost:8787 (or derived)
    });
  }
  return new MockOfficeGateway();   // dev fallback
}
// RuntimeProvider: useMemo(createGateway, [])
```

Panels never read the mode. `RuntimeContext` stays the only place that chooses an
implementation.

### `HttpOfficeGateway` (new)

- read methods: `fetch(baseUrl + route)` → JSON → (optionally) zod-parse from the
  contract → non-2xx mapped to `throw`;
- `sendOperatorMessage(msg)`: `POST /api/office/operator/messages` →
  `OperatorMessageAccepted`;
- `subscribeOfficeEvents(cb)`: **one** WebSocket to `/api/office/events`, parse
  `OfficeEvent`, fan-out to all client subscribers (ref-counted, single physical
  connection), **simple bounded reconnect with backoff**; on reconnect the server
  sends a fresh `agent_statuses_snapshot` (no replay). Returns unsubscribe.
- **No silent fallback** (see below).

### `MockOfficeGateway` (evolved, stays the dev fallback)

- read methods → snapshots from `office-fixtures` (same data the server serves);
- `sendOperatorMessage` → `accepted`; a thin client-side simulation wrapper
  schedules `operator_message_*` into its own `subscribeOfficeEvents` callback
  using `office-fixtures` templates;
- `subscribeOfficeEvents` → client-side simulator (statuses snapshot + changes +
  occasional traces) over the same pools/templates.

### `OfficeRuntimeStore` (small `OfficeEvent` reducer — kept narrow)

- reduces **only** floor-shell state: `agent_statuses_snapshot` → set all;
  `agent_status_changed` → set one (→ `applyStatusToScene`, downstream seam
  unchanged). It also holds one **shell-level** field — the connection status (see
  *No silent fallback*) — runtime / transport state, not domain data.
- does **not** absorb traces or operator lifecycle (would become a god-object).
  `operator_message_*` and `agent_trace_appended` stay **panel-local** streams,
  consumed via the same `subscribeOfficeEvents` (one WS → many client
  subscribers).
- wiring: one bootstrap effect `gateway.subscribeOfficeEvents(e => store.reduce(e))`;
  the topbar "simulate activity" toggle drives the mock producer in mock mode.

### `OperatorChatPanel` (new global shell surface)

`BossCommandPanel` → `OperatorChatPanel` (component + contract name). UI title may
read `Orchestrator` or `Operator chat · Orchestrator`.

**It is a global shell surface, not a floor-entity panel.** Clicking any agent —
**including the boss / orchestrator** — opens `AgentActivityPanel` (activity /
logs / traces), so the floor-interaction model stays uniform. `OperatorChatPanel`
is opened from a **global shell control** (a floor-level `Operator` button) via a
dedicated `/operator` route, never from a floor entity. `OperatorMessage.target`
stays `'orchestrator'`; the floor SSOT is untouched.

- submit → optimistic operator bubble; `POST` → `accepted`
  (`{ operatorMessageId, conversationId }`);
- subscribes to `operator_message_*` filtered by `conversationId`: `delta` →
  append into a streaming reply bubble, `completed` → finalize `OperatorReply`,
  `failed` → error;
- **a failed HTTP submit marks that turn `failed`** (a `submit_failed` action) so a
  turn is never left stuck `pending` — part of honest connected-mode behavior;
- keeps a visible **`no execution authority`** badge.

The other six panels are unchanged — still `useResource(() => gateway.getX(), [])`.
`panelRegistry` routes the boss like any agent (`agent-activity`); the
`operator-chat` panel kind is produced only by the `/operator` shell route.

### No silent fallback (explicit)

In connected mode, if the server is unavailable the app shows a **visible
connection error / warning**. It is **not allowed** to:

- fall back to `MockOfficeGateway`,
- fall back to mock fixtures,
- swallow WS errors.

Reconnect is **simple and bounded** — no offline queue, no replay, no complex
delivery semantics. A connection warning surfaces the problem instead of masking
it.

**Connection state path (so the warning is real, not just "no fallback").**
`OfficeRuntimeStore` holds one shell-level field beyond statuses — the connection
status `'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error'`
(runtime / transport state, **not** domain data; traces and operator transcript
stay panel-local). `HttpOfficeGateway` signals connection changes via
`subscribeConnection`; `RuntimeContext` wires that into the store in connected
mode (mock mode stays `'connected'`). `FloorScreen` renders a warning banner when
the connection is degraded. Tests assert the **warning state actually arises**,
not merely that no fallback happens.

## 6. No-execution-authority guarantees (consolidated)

- The gateway is read-only except `sendOperatorMessage`, which is **inert** (§4):
  it returns `accepted` and emits only a simulated reply lifecycle; zero side
  effects, no outbound calls.
- The `OfficeReadConnector` port has **no write/execute method** — execution is
  impossible by type.
- No app imports or clients `trading-lab` / `trading-platform`. In Phase 2 the
  connector boundary is fixture-backed and the cross-repo network boundary is not
  crossed.
- WS is read-only, server → client; commands are never sent over WS.
- The `noExecutionAuthority` guard centralizes and tests the operator path's
  inertness (§8 #5).

## 7. Config / env / dev scripts

**Client env:** `VITE_OFFICE_MODE` (`mock` | `connected`, default `mock`) ·
`VITE_OFFICE_GATEWAY_URL` · `VITE_OFFICE_GATEWAY_WS_URL` (optional; derivable from
`baseUrl`, but an explicit override is kept).

**Server env:** `OFFICE_SERVER_PORT` (e.g. 8787) · `OFFICE_CORS_ORIGIN`
(`http://localhost:5174`) · `OFFICE_EVENT_TICK_MS` · `OFFICE_HEARTBEAT_MS` ·
`OFFICE_FIXTURE_LATENCY_MS` (artificial snapshot latency, like the Phase 1 mock's
~220 ms). CORS is a Hono middleware allowing the web dev origin.

**Dev scripts:**

- `npm run dev` — web in **mock** mode (unchanged Phase 1 behavior).
- `npm run dev:server` — `apps/server` only.
- `npm run dev:web:connected` — web in **connected** mode only (server started
  separately).
- `npm run dev:connected` — **server + web connected together** via `concurrently`
  (the expected "run the whole connected demo" command; no silent assumptions
  about a separately-started server). No separate `dev:all`.

## 8. Tests & verification

Vitest, keeping the Phase 1 "pure logic in units" ethos and adding exactly what
proves the new wire / WS path.

### Mandatory subset (Phase 2 is not done until these pass)

1. `typecheck` + `build` across all workspaces (new packages/app included) — the
   contract compiles for both client and server.
2. **zod round-trip** in `office-gateway` for every externally serialized
   HTTP/WS payload (each DTO, the error body, `OperatorMessage`,
   `OperatorMessageAccepted`, each `OfficeEvent`): parse / serialize, reject
   malformed.
3. `office-fixtures` satisfy the contract zod schemas — fixtures are valid wire
   payloads.
4. Server route tests via `app.fetch` (no network): every GET returns the correct
   contract shape; error shape verified.
5. **Inert operator guard test** (critical): `POST /operator/messages` →
   `accepted`, **zero side effects** — the connector exposes no write method,
   nothing goes outbound, the handler only publishes to the bus.
6. **Conformance `mock == connected`** — one shared suite run against
   `MockOfficeGateway` and against `HttpOfficeGateway` pointed at an in-process
   Hono app (`app.fetch`). **Strict equality only on deterministic snapshots**:
   statuses, agent activity, hypotheses, backtests, bot health, knowledge, infra.
   (Live events are timing-dependent and are excluded from strict equality — see
   #11.)
7. `OfficeRuntimeStore` reducer: snapshot / changed events → correct status map;
   non-status events ignored.
8. `OperatorChatPanel` pure reducer: `submit → accepted → delta → completed / failed`,
   **including a failed HTTP submit marking the turn failed** (`submit_failed`).
9. `panelRegistry`: `boss` role → `OperatorChatPanel`.
10. **No-silent-fallback + connection state**: connected + unavailable server →
    the gateway signals a degraded connection and a **visible warning state
    arises** in the store (asserted), never a fall back to mock.
11. **WS endpoint test** (separate from `app.fetch`, against an ephemeral local
    server or the chosen WS adapter's harness; `app.fetch` is **not** treated as
    WS coverage): connect → receive initial `agent_statuses_snapshot` → receive a
    `heartbeat` or fixture event → unsubscribe / disconnect cleans the
    subscription. Event-stream shape / order / lifecycle are covered here, not in
    the snapshot conformance test (#6).

### Near-blocker (a core Phase 2 architectural guarantee)

12. **Import-boundary lint/test** asserting:
    - `apps/web` does not import `apps/server`;
    - `apps/server` does not import `apps/web`;
    - `packages/office-gateway` imports neither app;
    - `packages/office-fixtures` imports no runtime / server / browser-specific
      code;
    - no app imports `trading-lab` / `trading-platform` source.

### Desirable (not blocking)

- `OfficeEventBus` fan-out / unsubscribe / heartbeat.
- `fixtureEventProducer` deterministic status cycling.

### Manual verification

- **connected smoke:** `npm run dev:connected` → floor statuses animate from WS;
  each panel loads via HTTP; an operator message streams a reply via WS; killing
  the server shows a connection warning (no mock fallback).
- **mock smoke:** `npm run dev` → Phase 1 behavior unchanged; existing Phase 1
  tests stay green (no regression).

## 9. Out of scope (Phase 2)

Real `trading-lab` data / read API · real LLM calls · execution commands ·
bidirectional WS command protocol · direct `trading-platform` access · auth ·
Postgres / Redis · replay / guaranteed delivery / offline queue · complex
subscription model · multi-floor / elevator · renaming the floor SSOT `boss` role ·
production deploy / infra.

## 10. Phase 3 hooks (produced by Phase 2 as documentation, not code)

- **`OfficeReadConnector` documented contract** — the read-only port Phase 2 ships
  (as `FixtureOfficeReadConnector`). It is the office's single read boundary: the
  office reads / aggregates, it never commands. In Phase 3 the same port is
  implemented by a **`CompositeOfficeConnector`** that composes per-authority read
  connectors.

**Phase 3 connector composition (future shape, not built here):**

```
OfficeReadConnector   (Phase 2: FixtureOfficeReadConnector
                       Phase 3: CompositeOfficeConnector)
  → TradingLabReadConnector        — research authority = trading-lab
      · agent statuses / activity
      · hypotheses
      · backtests
      · knowledge (if the source is confirmed)
  → PlatformMonitoringConnector    — runtime/monitoring authority = trading-platform (READ-ONLY)
      · bot-health
      · live bot runtime status
      · paper runtime status (only if a real paper bot is running)
      · positions / orders / fills / recent runtime events
      · market-data health
      · execution health
      · platform runtime health
```

`PlatformMonitoringConnector` is **read-only monitoring** of `trading-platform`;
the platform stays the execution / data authority and the office never sends it
commands — this is a new read boundary introduced in Phase 3, not Phase 2.

**Office read → authority mapping** (corrects the early single-source framing):

| Office read | Authority / source | Phase 3 |
| --- | --- | --- |
| agent statuses / activity | trading-lab · agent-event repo | `TradingLabReadConnector` |
| hypotheses | trading-lab · hypothesis-proposal / build | `TradingLabReadConnector` |
| backtests | trading-lab · backtest-run repo | `TradingLabReadConnector` |
| knowledge | trading-lab · artifact-store / strategy-profile | `TradingLabReadConnector` (source TBD) |
| bot-health | **trading-platform** monitoring | `PlatformMonitoringConnector` (not a trading-lab concept) |
| infra-status | **aggregated** office + lab + platform health | `CompositeOfficeConnector` composes per-source health |

- **Typed read path for deterministic panels — MCP is not the primary channel.**
  Deterministic UI panels need a **typed read path**: an HTTP monitoring/read API
  and, optionally, a TypeScript SDK/client over it. MCP tools may exist as a
  *separate* tool interface for LLM/agents, but they must call the **same**
  monitoring/read layer — not carry separate logic. Concretely: `BotHealthPanel`
  and the other deterministic panels go through the typed read API / SDK connector,
  **not** MCP; `OperatorChatPanel` / Orchestrator *reasoning* may later use MCP /
  tools / SDK on top of that same layer.
- **Open Phase 3 question (recorded, not decided here):** do real WS events come
  from `trading-lab` / `trading-platform` event streams, or does the office poll
  the read models and diff them? Not solved in Phase 2.

## 11. Suggested build order (within Phase 2)

1. `packages/office-gateway`: DTOs, operator model, `OfficeEvent`, route
   descriptors, error shapes, zod. (Green typecheck = checkpoint.)
2. `packages/office-fixtures`: extract/relocate the shared demo data + pure
   templates; type against the contract; fixtures-satisfy-zod test.
3. `apps/server`: Hono app, `OfficeReadConnector` port +
   `FixtureOfficeReadConnector`, snapshot GET routes, `OfficeEventBus` +
   `fixtureEventProducer`, WS endpoint, operator POST + `noExecutionAuthority`
   guard. Route + guard + WS tests.
4. `apps/web`: `HttpOfficeGateway` (HTTP + one WS), `RuntimeContext` mode switch,
   evolve `MockOfficeGateway` onto the shared fixtures, `OfficeRuntimeStore`
   reducer, `OperatorChatPanel`, `panelRegistry` remap, no-silent-fallback +
   connection warning.
5. Conformance (`mock == connected`), import-boundary test, env + dev scripts,
   smokes, doc deliverables (§10).

## Open implementation details (resolved in the plan, not blockers)

- Concrete Node WS adapter (candidate `@hono/node-ws`) — chosen by compatibility
  check.
- Exact import-boundary mechanism (lint rule vs a small test) and tool choice.
- Whether `HttpOfficeGateway` zod-parses every response or validates a subset on
  the client (server-side zod validation is mandatory regardless).
- `concurrently` vs a tiny node script for `dev:connected`.
- Fixture depth for the operator lifecycle templates (kept modest but plausible).
