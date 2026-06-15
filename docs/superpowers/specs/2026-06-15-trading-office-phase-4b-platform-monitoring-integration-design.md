# Phase 4b — Trading Office Platform Monitoring Integration

- **Status:** Design approved (brainstorm + refinement round), 2026-06-15. Implementation NOT started.
- **Branch:** `phase-4b-platform-monitoring-integration`.
- **Builds on:** Phase 3 (`2026-06-14-trading-office-phase-3-trading-lab-integration-design.md`, merged) and the platform-side prerequisite **`trading-platform` feature `035-platform-health-snapshots` (merged)** — the read-only Ops Read API that exposes platform health snapshots.
- **Workspace:** `trading-ai` (repos `trading-lab`, `trading-office`, `trading-platform` — all gortex-indexed). **Workspaces are NOT merged; no cross-repo TS imports.**

---

## 1. Context & goal

Phase 3 connected the office to real `trading-lab` (hypotheses / backtests / agents / activity / stream / chat) and left two honest gaps: `knowledge` and `bot-health`. `trading-platform` has since merged `035`, which makes its **Ops Read API** production-ready and adds platform health snapshots. The office's `OfficeReadConnector` doc-comment already anticipates this phase: *"a CompositeOfficeConnector composing a TradingLabReadConnector + a read-only PlatformMonitoringConnector."*

**Goal:** add a read-only `PlatformMonitoringConnector` so the office server consumes the `trading-platform` Ops Read API and closes the platform-monitoring gaps:
- **`BotHealthPanel`** — real per-bot runtime rows from `GET /ops/runs`.
- **platform / runtime / market / execution / coverage** part of **`InfraStatusPanel`** — five new `platform-*` infra source-states from `/ops/health/*`, `/ops/coverage`, `/ops/discover`.

The office stays a read-only control-room shell. `trading-lab` remains the source of truth for research; `trading-platform` becomes the source of truth for live runtime/bot/market/execution/coverage monitoring.

### Hard boundary

```
browser ──HTTP/WS── trading-office apps/server ─┬─HTTP+SSE── trading-lab    (research SoT, unchanged)
 (VITE_OFFICE_MODE = mock|connected)            └─HTTP────── trading-platform /ops/* (runtime/bot/market SoT)
                                                │  platform read URL + token live ONLY in apps/server
```

The browser **never** calls `trading-platform` and **never** holds its URL/token. Only `apps/server` may call `/ops/*`, and only via **GET** — no execution commands, mutations, orders, cancels, pauses, or restarts.

---

## 2. Scope

**In scope**

- `PlatformHttpClient` (bearer + timeout + error mapping) and read-only `PlatformMonitoringConnector`:
  - `getBotHealth()` ← `GET /ops/runs` (filter `mode != 'backtest'`).
  - `getPlatformInfra()` ← `GET /ops/discover` + `/ops/health/runtime|market|execution` + `/ops/coverage` (+ a light `/ops/runs` probe for the `bot-health` source-state), best-effort per-endpoint.
- `createPlatformWiring` mirroring `createTradingLabWiring`.
- Server-only config: `OFFICE_PLATFORM_ENABLED` (independent flag) + `platform: PlatformConfig` + fail-fast.
- Composite routing: `getBotHealth` → platform; `InfraAggregator` extended with platform services + sources; the hardcoded `bot-health` gap closed when platform is enabled and `/ops/runs` responds.
- `office-gateway` contract: add five `platform-*` members to `infraSourceDomainSchema` (additive). `botHealthSchema` unchanged.
- Minimal `BotHealthPanel` rendering states (gap / error / degraded / empty / rows).
- Auth/secret-boundary guard test; degradation/error handling; unit + integration tests; local smoke.

**Out of scope (do NOT build in Phase 4b)**

- `knowledge` source (stays `gap`).
- True broker / exchange **connection**-health (platform exposes only an execution **activity-proxy**); if needed, it is a `trading-platform` follow-up.
- `/ops/positions`, `/ops/trades`, `/ops/run-state`, `/ops/decisions`, orders/fills — **not consumed** (keeps the office a control-room, not an execution/positions UI).
- Any write/execute/command/mutation path; any browser → platform call; any cross-repo TS import.
- Enabling `MARKET_HEALTH_PERSIST` on the platform (operator action; the office is ready either way).

---

## 3. Architecture & boundary

`OfficeReadConnector` (server-side, read-only by type) stays the office-facing port — **no method is added for platform writes.** `CompositeOfficeReadConnector` composes the trading-lab read source, the infra aggregator, the stream bridge, and (new) an optional **platform** source. Bootstrap (`index.ts`) builds platform wiring only when `OFFICE_PLATFORM_ENABLED=true` **and** `OFFICE_CONNECTOR_MODE=trading-lab`; in `fixture` mode the `FixtureOfficeReadConnector` is used unchanged and platform integration is off.

Browser ↔ office contract (routes + the single WS) is unchanged except for the additive `infraSourceDomainSchema` widening (§8). `/api/office/bots` and `/api/office/infra` already exist and already call the connector — **zero route changes.**

---

## 4. Config & environment (server-only)

`apps/server/src/config.ts` (`OfficeServerConfig` / `loadConfig`) gains a `platform` block. All new vars are read **only** server-side; none are `VITE_*` and none reach the browser bundle (a guard test asserts this — §11).

| env var | meaning | default |
|---|---|---|
| `OFFICE_PLATFORM_ENABLED` | enable platform monitoring (effective only in `trading-lab` mode) | `false` |
| `TRADING_PLATFORM_READ_URL` | Ops Read base (e.g. `http://localhost:8839`) | `http://localhost:8839` |
| `TRADING_PLATFORM_READ_TOKEN` | **raw** bearer token sent as `Authorization: Bearer <token>` | — |
| `TRADING_PLATFORM_REQUEST_TIMEOUT_MS` | request timeout | `10000` |

`PlatformConfig = { enabled: boolean; readUrl: string; readToken: string; requestTimeoutMs: number }`.

**Fail-fast:** `OFFICE_PLATFORM_ENABLED=true` **and** `OFFICE_CONNECTOR_MODE=trading-lab` without `TRADING_PLATFORM_READ_URL` + `TRADING_PLATFORM_READ_TOKEN` aborts at boot with a clear error. In `fixture` mode the flag is **ignored** (platform integration off, fixtures unchanged) with a one-line boot notice. `OFFICE_PLATFORM_ENABLED=false` → platform off; `getBotHealth`/infra behave exactly as Phase 3 (`bot-health` stays `gap`).

**Token coordination (operational note):** the office holds the **raw** token and sends it as `Bearer`. The platform stores `sha256hex(rawToken)` in its `OPS_READ_TOKENS` allowlist. So the platform operator configures the *hash* of the value the office is given. (If the platform allowlist is empty, it is loopback-trusted; the office still sends the header harmlessly.)

---

## 5. Platform contract reference (merged `035`, verified) — mirror, do not import

The `PlatformHttpClient` parses responses against **hand-mirrored input types** (`platformDtos.ts`) reflecting the **actual merged `035` DTOs** — only the fields the office consumes. **No `trading-platform` TS import.** If a field is missing/optional in a real response, the mapper **degrades honestly** (`null`/`'gap'`/`'degraded'`), never throws. If a substantial platform-contract problem surfaces, it is raised as a `trading-platform` follow-up — **not** worked around in the office.

Actual response shapes (field-for-field from `trading-platform/src/operations/dto.ts`):

```ts
// GET /ops/runs?mode=...  → a PAGE ENVELOPE (NOT a raw array)
interface PageEnvelope<T> { items: T[]; nextCursor: string | null; asOf: number; window: unknown; freshness: unknown; }
//   `window` / `freshness`: mirror the EXACT shapes from trading-platform dto.ts at implementation.
//   Office consumes `items` (primary) and MAY use `freshness`/`asOf` to refine the bot-health source-state.
interface BotRunRecord { runId: string; mode: 'live'|'paper'|'backtest';
  status: 'running'|'finished'|'crashed'|'aborted';
  strategy: { name: string; version: string };
  startedAtMs: number; finishedAtMs: number | null; lastSeenMs: number; symbols: string[]; }

// shared vocab
type SourceAvailability = 'available' | 'degraded' | 'unavailable';
type OpsHealthStatus    = 'ok' | 'degraded' | 'down';
type OpsCoverageState   = 'present' | 'missing' | 'stale' | 'unsupported';
type OpsMarketDataKind  = 'openInterest' | 'liquidations' | 'funding' | 'taker';

// GET /ops/health/runtime  → a COLLECTION (NOT the legacy singular RuntimeHealthSnapshot)
interface RuntimeHealthIndicators { ready: boolean; freshnessOk: boolean; pipelineOk: boolean; serviceOk: boolean; botOk: boolean; }
interface RuntimeHealthEntry { source: string; status: OpsHealthStatus; indicators: RuntimeHealthIndicators; availability: SourceAvailability; capturedAtMs: number; }
interface RuntimeHealthCollection { entries: RuntimeHealthEntry[]; asOf: number; }   // source-down ⇒ { entries: [], asOf }

// GET /ops/health/market
interface MarketServiceHealthSnapshot { status: OpsHealthStatus; diagnostics: Record<string,unknown>; streamAgeMs: number | null; availability: SourceAvailability; asOf: number; }

// GET /ops/coverage
interface SourceCoverageEntry { source: string; kind: OpsMarketDataKind; state: OpsCoverageState; freshnessAgeMs: number | null; }
interface SourceCoverageSnapshot { entries: SourceCoverageEntry[]; availability: SourceAvailability; asOf: number; }

// GET /ops/health/execution  (activity-proxy; idle ⇒ availability 'unavailable')
interface ExecutionHealthSnapshot { status: OpsHealthStatus; recentCounts: Record<string,number>; lastEventMs: number | null; availability: SourceAvailability; asOf: number; }

// GET /ops/discover
interface OpsCapabilityDescriptor { opsContractVersion: string;
  capabilities: { readOnly: true; execution: false; credentials: false; ingestion: false; mutation: false };
  resources: { name: string; supportedFilters: string[]; pagination: unknown; fields: string[]; availability?: 'available'|'degraded'|'unavailable'|'unsupported' }[]; }
```

Mirror-traps to honor in `platformDtos.ts` / mappers:
- `/ops/health/runtime` is a **collection** (`entries[]`), not the singular `RuntimeHealthSnapshot` that also exists in `dto.ts`. `RuntimeHealthEntry` has **no `asOf`** (only the wrapper) — per-source freshness comes from each entry's `availability` + `capturedAtMs`.
- `buildTag` / `botRunId` are **never on the wire** (redacted) — do not expect them.
- `/ops/log-refs` is always empty (out of `035` scope) — not consumed here.
- `availability` may be `'unsupported'` **only** in `/ops/discover` overlays (notably `source-coverage`).

Auth / transport: `Authorization: Bearer <raw token>`; success `200`; `401` auth-fail; `400` bad-arg; `404`; `500`. A reachable resource with no snapshot returns `availability:'unavailable'` with HTTP **200** (this is data, not an error).

---

## 6. Connectors & composite

### 6.1 `PlatformHttpClient`

Wraps `fetch`: injects `Authorization: Bearer <TRADING_PLATFORM_READ_TOKEN>`, sets `TRADING_PLATFORM_REQUEST_TIMEOUT_MS`, injectable `fetchImpl` (test seam). Maps transport/HTTP outcomes to office errors:
- network / timeout / 5xx → `OfficeError{ code:'upstream_unavailable' }`
- 401/403 → `OfficeError{ code:'upstream_unauthorized' }`
- 4xx → `OfficeError{ code:'upstream_bad_request' }`

Exposes typed getters: `getRuns(mode)` (parses the `PageEnvelope<BotRunRecord>`, returns `items` + envelope meta), `getRuntimeHealth()`, `getMarketHealth()`, `getExecutionHealth()`, `getCoverage()`, `getDiscover()`. Each parses against `platformDtos.ts`.

### 6.2 `PlatformMonitoringConnector` (read-only)

```ts
interface PlatformMonitoringConnector {
  getBotHealth(): Promise<BotHealth[]>;                                  // ← /ops/runs
  getPlatformInfra(): Promise<{ services: InfraService[]; sources: InfraSource[] }>; // ← /ops/* (best-effort)
}
```

- **`getBotHealth()`** — `GET /ops/runs?mode=live` **and** `GET /ops/runs?mode=paper` (platform-side filtering is the **primary** selection), merge the two envelopes' `items`; map each run (§7.1). Client-side `mode != 'backtest'` remains only as **defense-in-depth**, not the selection mechanism. First page per mode (bot counts are small; `nextCursor` exists but is not paginated in v1). If **either** mode query fails (transport/401/bad) → returns `[]` and `bot-health` is `error` (never a partial shown as complete). The panel must not misread `[]` as "no bots" — §8.
- **`getPlatformInfra()`** — fetches each endpoint **independently** and derives one `InfraSource` per aspect from **its own** result (§7.2). Adds a `platform-ops-api` service (up/down from `/ops/discover` reachability). Never throws; a single failed endpoint degrades only its own source.

### 6.3 `createPlatformWiring`

Mirrors `createTradingLabWiring`: builds `PlatformHttpClient` from `config.platform`, returns `{ connector: PlatformMonitoringConnector, client }`. Bootstrap passes the connector into `createTradingLabWiring` as an optional `deps.platform`.

### 6.4 Composite + InfraAggregator integration

- `CompositeOfficeReadConnector` — `CompositeDeps` gains optional `platform?: Pick<PlatformMonitoringConnector,'getBotHealth'>`. `getBotHealth()` → `platform ? platform.getBotHealth() : []`. All other methods unchanged.
- `InfraAggregator` — constructor gains optional `platformInfra?: () => Promise<{ services: InfraService[]; sources: InfraSource[] }>`. In `getInfraStatus()`:
  - base sources/services as Phase 3 (`office-server`, `trading-lab-read-api`, `trading-lab-stream`), `knowledge` stays `gap`;
  - **if `platformInfra` present** → await it (guarded), append its `services` + `sources` (which include `bot-health` + the five `platform-*` domains), and **omit the hardcoded `bot-health: gap`** (platform now owns it);
  - **if absent** → keep the hardcoded `bot-health: gap` (Phase 3 behavior).
- `createTradingLabWiring(config, deps)` — when `deps.platform` is present, builds `InfraAggregator` with `platformInfra = () => deps.platform.getPlatformInfra()` and the composite with `platform = deps.platform`.

---

## 7. Mapping tables (explicit)

### 7.1 Bot rows — `BotRunRecord` → office `BotHealth`

Source = merged `items` from `GET /ops/runs?mode=live` + `?mode=paper` (platform-side filtering is the **primary** selection; client-side `mode != 'backtest'` is defense-in-depth only).

| office `BotHealth` | source |
|---|---|
| `id` | `runId` |
| `name` | `strategy.name` |
| `state` | `status`: `running→running`, `crashed`/`aborted→error`, `finished→paused` |
| `uptime` | pre-formatted string from `now − startedAtMs` (for `finished`, `finishedAtMs − startedAtMs`) |
| `lastHeartbeat` | pre-formatted string from `lastSeenMs` |

`uptime`/`lastHeartbeat` are **display strings** (the schema is `z.string()`). `state` maps onto the closed `running|paused|error` enum. Filtering and the `finished→paused` choice are flagged for calibration against real `/ops/runs` data (§14).

### 7.2 Platform aspects → office `InfraSource` (per-aspect, best-effort)

`availability` × `status` → office `infraSourceStateSchema`:

| platform | office state |
|---|---|
| `availability:'available'` + `status:'ok'` | `live` |
| any `availability:'degraded'` **or** `status:'degraded'` | `degraded` |
| `availability:'available'` + `status:'down'` | `error` |
| `availability:'unavailable'` | `gap` |
| coverage entry `state:'unsupported'` only | `gap` (detail "unsupported") |

| office domain | endpoint | state derivation |
|---|---|---|
| `platform-ops-api` | `/ops/discover` | reachable→`live`; only-discover-failed-but-others-ok→`degraded`; client unreachable/401/403→`error` |
| `platform-runtime` | `/ops/health/runtime` | worst-of over `entries[]` (avail×status); `entries:[]`→`gap` |
| `platform-market` | `/ops/health/market` | avail×status (`unavailable`→`gap` — default until `MARKET_HEALTH_PERSIST`) |
| `platform-execution` | `/ops/health/execution` | avail×status; idle (`unavailable`)→`gap` ("no recent execution activity") |
| `platform-coverage` | `/ops/coverage` | snapshot `availability`, then worst-of `entries[].state` (`missing`/`stale`→`degraded`) |
| `bot-health` | `/ops/runs` probe | see §7.3 |

**Worst-of order:** `error` > `gap` > `degraded` > `live` for runtime entries; for coverage, `unavailable`→`gap`, else any `missing`/`stale`→`degraded`, else `live`.

### 7.3 `bot-health` source-state (distinct from `platform-runtime`)

`bot-health` reflects the **`/ops/runs` source**; `platform-runtime` reflects **`/ops/health/runtime`** — they are different things and both appear in `sources[]`.

| condition | `bot-health` state | `getBotHealth()` |
|---|---|---|
| platform disabled | `gap` ("platform monitoring disabled") | `[]` |
| `/ops/runs` unreachable / timeout / network | `error` | `[]` |
| `/ops/runs` 401/403 | `error` ("unauthorized") | `[]` |
| `/ops/runs` bad response / mapping failure | `error` | `[]` |
| both `?mode=live` + `?mode=paper` **200 with rows** | `live` | merged mapped rows |
| both `?mode=live` + `?mode=paper` **200, no rows** | `live` | `[]` (valid "no active bot runs") |

Both mode queries must return `200` for `bot-health = live`; if **either** fails → `bot-health = error` and `getBotHealth() = []` (never a partial shown as complete). Optionally, if the envelope's `freshness`/`asOf` indicates stale data, `bot-health → degraded` (rows still shown) — confirm the exact `freshness` shape at implementation (§14).

**Empty list is NOT a gap.** A successful `200` (both modes) with zero runs is the honest "no active bots" state: `bot-health = live`, rows `[]`, and the panel says so (§8). A platform failure is `gap`/`error`, **never** rendered as empty (§8).

### 7.4 `/ops/discover` is NOT a global gate (best-effort per-endpoint)

`getPlatformInfra()` fetches each endpoint independently and never lets `/ops/discover` suppress the others:
- whole client unreachable / timeout / 401 / 403 → `platform-ops-api='error'` and dependent domains `gap`/`error`;
- **only** `/ops/discover` failed but `/ops/health/*`, `/ops/coverage`, `/ops/runs` returned `200` → do **not** overwrite their results; `platform-ops-api='degraded'`/`'error'`, every other domain reflects its **own** endpoint.

---

## 8. Contract changes (office-gateway) + panel

Additive only; all via zod in `packages/office-gateway/src/schemas.ts` (SSOT) with inferred types.

1. **`infraSourceDomainSchema` widened** — add `'platform-ops-api'`, `'platform-runtime'`, `'platform-market'`, `'platform-execution'`, `'platform-coverage'` to the existing five. No other schema change; `botHealthSchema` and `infraSourceStateSchema` unchanged.
2. **No route changes**; no new DTO. `InfraStatusPanel` renders `sources[]` generically — new domains appear automatically with no panel change.

**`BotHealthPanel` (minimal rendering states, not a redesign):** derive display state from **both** the rows AND the `bot-health` source-state (`sourceState(infra, 'bot-health')`) — **never from rows alone**:
- `gap` → "Bot runtime monitoring is not connected yet" (regardless of rows);
- `error` → "Bot runtime monitoring unavailable — platform unreachable" (regardless of rows);
- `degraded` + rows>0 → stale banner + rows; `degraded` + rows=0 → "Bot runtime data is stale" (**not** "no active bots");
- `live` + rows>0 → rows;
- `live` + rows=0 → "No active bot runs".

**"No active bot runs" is shown ONLY for (`bot-health`=`live`, rows=`[]`)** — i.e. only when `/ops/runs` actually returned `200` with zero live/paper runs. Platform disabled / unreachable / timeout / 401 / bad-response (→ `gap`/`error`) must **never** render as "No active bot runs".

`FixtureOfficeReadConnector` and the `INFRA`/`BOTS` fixtures are unchanged (fixture mode has no platform; `sources` is optional/open so it need not list the new domains). A guard test confirms fixtures still satisfy the schemas.

---

## 9. No-execution-authority & security boundary

- `OfficeReadConnector` and `PlatformMonitoringConnector` are read-only **by type** — no write/execute/command method.
- Only **GET** `/ops/*` is called; no order/cancel/pause/restart/mutation path exists.
- `trading-platform` URL/token live only in `apps/server`; a test asserts they never appear in the web bundle, a config endpoint, serialized client state, or logs (§11.5).
- A repo-relative import-boundary guard forbids any `trading-platform` import from `trading-office`.
- The WS stays server→client read-only (Phase 4b adds no WS events).

---

## 10. Error handling & degradation (consolidated)

| failure | behavior |
|---|---|
| platform disabled / fixture mode | `getBotHealth()`=`[]`, `bot-health`=`gap`, no `platform-*` rows (Phase 3 infra) |
| whole platform client unreachable / timeout / 5xx | `platform-ops-api`=`error`; dependents `gap`/`error`; `getBotHealth()`=`[]` |
| 401/403 | `upstream_unauthorized`; affected source-states `error` |
| only `/ops/discover` down, others ok | `platform-ops-api`=`degraded`/`error`; other domains from their own endpoints (no suppression) |
| `/ops/health/market` (or coverage) `unavailable` (default) | `platform-market`/`platform-coverage`=`gap` (honest); auto-`live` when operator enables `MARKET_HEALTH_PERSIST` — **no office change** |
| `/ops/runs` (both modes) 200, empty | `bot-health`=`live`, rows `[]`, panel "No active bot runs" |
| `/ops/runs` either mode fails (transport/401/bad) | `bot-health`=`error`, `getBotHealth()`=`[]`, panel error message (NOT "no active bots") |
| malformed DTO / mapping failure (one endpoint) | that source `error`; others unaffected; never throws to the route |

Principle (inherited): **degrade visibly, never mask with fabricated data; empty ≠ gap; and a platform failure (`gap`/`error`) is never rendered as an empty "no active bots".**

---

## 11. Testing strategy (TDD)

1. **Mappers (unit):** `BotRunRecord`→`BotHealth` (status map, `mode!=backtest` filter, `finished→paused`, uptime/heartbeat string formatting); `availability`×`status`→`InfraSourceState` (full table incl. `down→error`, `unavailable→gap`); coverage worst-of; runtime collection worst-of (incl. `entries:[]`→`gap`).
2. **`PlatformHttpClient`:** `Authorization: Bearer <token>` sent (assert via fake `fetch`); 401/5xx/network/timeout → mapped `OfficeError`; parses the actual `035` shapes incl. `getRuns` parsing `PageEnvelope<BotRunRecord>` (`items`/`nextCursor`/`asOf`/`window`/`freshness`) and returning `items`; tolerates missing/optional fields without throwing.
3. **`getBotHealth`:** queries `?mode=live` **and** `?mode=paper`, merges `items`, maps; **either** query failing → `[]` + `bot-health=error`; **both-200 with zero rows → `[]` + `bot-health=live` (not an error)**; client-side `mode!=backtest` is defense-in-depth.
4. **`getPlatformInfra`:** each domain from its own endpoint; one endpoint failing → only its source degrades; all-down → `platform-ops-api='error'` + dependents gap/error; **only-discover-down → others preserved**; market/coverage `unavailable`→`gap`.
5. **`bot-health` source-state:** disabled→gap; either-mode-query unreachable/401/bad→error; both-200+rows→live; **both-200+empty→live** (the empty≠gap rule).
5b. **`BotHealthPanel` false-empty guard (web):** rows=`[]` + `bot-health` ∈ {`gap`,`error`,`degraded`} → renders the gap/error/degraded message, **NOT** "No active bot runs"; only (`live`, `[]`) renders "No active bot runs"; (`degraded`, rows>0) → stale banner + rows.
6. **Composite:** `getBotHealth` routes to platform when present, `[]` when absent; `getInfraStatus` includes platform sources when wired.
7. **`InfraAggregator`:** with `platformInfra` → appends platform services+sources and **drops** the hardcoded `bot-health` gap; without → Phase 3 behavior (`bot-health`=gap); `knowledge` always gap.
8. **Config:** fail-fast when `OFFICE_PLATFORM_ENABLED=true` + `trading-lab` mode without URL/token; flag ignored in fixture mode.
9. **Server routes (both modes):** `fixture` (Phase 2/3 suites stay green) and `trading-lab + platform` (fake platform via injected client) over `app.request` — `/api/office/bots` + `/api/office/infra` return mapped data / honest states.
10. **Boundary/exposure (REQUIRED guard):** no `trading-platform` URL/token in the web bundle, a config endpoint, serialized client state, or logs; import-boundary guard green (no `trading-platform` imports).
11. **Green-mode matrix:** `mock` green; `connected + fixture` green; `connected + trading-lab` (no platform) green; `connected + trading-lab + platform` smoked locally against a running `/ops/*`.

---

## 12. File / module layout

```
apps/server/src/
  config.ts                                   # + PlatformConfig + OFFICE_PLATFORM_ENABLED + fail-fast
  index.ts                                    # build platform wiring (enabled + trading-lab mode) → pass into trading-lab wiring
  connector/
    createTradingLabWiring.ts                 # accept optional deps.platform → inject into InfraAggregator + composite
    CompositeOfficeReadConnector.ts           # + optional platform dep; getBotHealth → platform
    InfraAggregator.ts                        # + optional platformInfra provider; drop hardcoded bot-health gap when present
    platform/
      PlatformHttpClient.ts                   # new — fetch + bearer + timeout + error mapping
      platformDtos.ts                          # new — hand-mirrored ACTUAL 035 + /ops/runs input types
      mappers.ts                              # new — run→bot, availability×status→state, coverage/runtime worst-of
      PlatformMonitoringConnector.ts          # new — getBotHealth + getPlatformInfra (best-effort)
      createPlatformWiring.ts                 # new — build client + connector
      index.ts
packages/office-gateway/src/schemas.ts        # add 5 platform-* members to infraSourceDomainSchema
apps/web/src/floor/panels/BotHealthPanel.tsx  # minimal: gap / error / degraded / empty / rows
```

---

## 13. Milestones

- **M1 — bot-health:** `config` (platform block + fail-fast) + `PlatformHttpClient` + `platformDtos` + run→bot mapper + `PlatformMonitoringConnector.getBotHealth` + composite routing + the `bot-health` source-state (incl. empty≠gap) + `BotHealthPanel` states + tests. **Closes `BotHealthPanel`.**
- **M2 — platform infra:** `getPlatformInfra` (discover + health/* + coverage, best-effort per-endpoint) + `availability×status`/worst-of mappers + `InfraAggregator` platform sources/services + the five `infraSourceDomainSchema` members + tests. **Closes the platform part of `InfraStatusPanel`.**
- **M3 — wiring & guards:** `createPlatformWiring` + bootstrap composition + import-boundary + secret-exposure guard tests + fixture-green conformance + local `/ops/*` smoke.

M1 may ship independently of M2 (bot-health closes without the infra aspects).

---

## 14. Risks & future phases

- **Platform DTO fidelity:** `platformDtos.ts` mirrors the **actual merged `035`** shapes (runtime = collection, no `buildTag`/`botRunId`, idle execution → `unavailable`); mappers degrade on missing/optional fields. A genuine platform-contract defect is escalated as a `trading-platform` follow-up, never hacked around in the office.
- **`/ops/runs` envelope + mapping calibration:** selection is primarily via platform `?mode=live`/`?mode=paper` filters merged from `PageEnvelope.items` (client `mode!=backtest` is defense-in-depth). Confirm the exact `window`/`freshness` envelope shapes and whether `freshness`/`asOf` should drive `bot-health → degraded`; confirm `finished→paused`; recency-filter old `finished` runs; `nextCursor` pagination only if bot counts grow. Adjust the mapper in M1, not the schema.
- **market/coverage default `unavailable`:** honest `gap` until the platform operator runs market-service with `MARKET_HEALTH_PERSIST=true` + `DATABASE_URL`. The office auto-lights-up with **no change** when that lands.
- **Token coordination:** office holds the raw token; platform stores its `sha256hex` in `OPS_READ_TOKENS` — an operational handshake, not code.
- **Future (not Phase 4b):** `knowledge` source; true broker connection-health (a `trading-platform` follow-up); richer per-bot detail (positions/trades) only if the control-room scope is deliberately widened.

---

## 15. Source-of-truth references

**trading-platform (`035`, mirror field names — do not import):**
- Response DTOs: `src/operations/dto.ts` (`RuntimeHealthCollection`/`RuntimeHealthEntry`, `MarketServiceHealthSnapshot`, `SourceCoverageSnapshot`, `ExecutionHealthSnapshot`, `OpsCapabilityDescriptor`, `BotRunRecord`).
- Routes: `src/operations/adapters/http-snapshot.ts` (`/ops/health/runtime|market|execution`, `/ops/coverage`, `/ops/discover`; `/ops/runs` → `PageEnvelope<BotRunRecord>`, supports `?mode=`); dispatch `src/operations/dispatch.ts`; catalog `src/operations/handlers/discover.ts`.
- Auth: `src/operations/access/auth.ts` (sha256-hex bearer allowlist); env `OPS_READ_TOKENS`, `OPS_READ_PORT` (default `8839`) in `src/operations/bin/start-ops-read.ts`.
- Availability classifier: `src/operations/sources/platform-health-snapshot-pg.ts` (`available`/`degraded`/`unavailable`).
- Spec: `trading-platform/specs/035-platform-health-snapshots/spec.md`.

**trading-office (extend in place):**
- Port + composite + aggregator: `apps/server/src/connector/{OfficeReadConnector,CompositeOfficeReadConnector,InfraAggregator,createTradingLabWiring}.ts`.
- Contract: `packages/office-gateway/src/schemas.ts` (`botHealthSchema`, `infraStatusSchema`, `infraSourceDomainSchema`, `infraSourceStateSchema`), `packages/office-gateway/src/http.ts` (`OFFICE_API`).
- Config: `apps/server/src/config.ts`. Routes: `apps/server/src/app.ts`. Panels: `apps/web/src/floor/panels/{BotHealthPanel,InfraStatusPanel}.tsx`, `apps/web/src/floor/infraSources.ts`.
