# Trading Office — Phase 3: Connect to the real trading-lab API — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In `OFFICE_CONNECTOR_MODE=trading-lab`, drive office panels + the live floor from the real trading-lab Read API / SSE stream and make the operator chat really call trading-lab's chat ingress and follow the resulting task's downstream progress — with every absent source shown as an honest gap, never faked.

**Architecture:** A new server-only `trading-lab` connector layer lives under `apps/server/src/connector/tradinglab/` (typed HTTP client + hand-mirrored input DTOs + mappers + one shared SSE bridge). A `CompositeOfficeReadConnector` implements the existing read-only `OfficeReadConnector` port, routing reads to trading-lab where a real source exists and returning empty + a gap marker where it does not. The operator path gains a `TradingLabOperatorResponder` that calls the chat ingress and starts a `ConversationFollower` which tails the SSE stream by `correlationId`. Bootstrap selects fixture vs trading-lab by env. The browser is unchanged and never sees trading-lab URLs/tokens.

**Tech Stack:** TypeScript (ES2022, `moduleResolution: bundler`, `verbatimModuleSyntax`), Hono + `@hono/node-server` + `@hono/node-ws` (server, unchanged), `zod` (wire validation), the platform `fetch` + a small SSE line-parser (no new SSE dep), Vitest 3 (node env), npm workspaces. **No new runtime dependencies.**

**Source of truth:** the approved spec at `docs/superpowers/specs/2026-06-14-trading-office-phase-3-trading-lab-integration-design.md`. Read it before starting. trading-lab field names are mirrored (never imported) from `trading-lab/src/read-api/dto.ts`, `…/chat/response.ts`, `…/domain/{types,schemas}.ts`.

---

## Conventions every task must follow

- **`verbatimModuleSyntax` is on:** type-only imports/exports MUST use `import type` / `export type`. zod schemas are runtime values (normal `import`/`export`); `z.infer<...>` aliases are types.
- **No TS import from `trading-lab` (or `trading-platform`).** The connector mirrors only the consumed fields by hand in `labDtos.ts`. An import-boundary test (M4) enforces this.
- **trading-lab URLs/tokens are server-only.** Never a `VITE_*` var; never referenced from `apps/web`. A bundle/exposure test (M4) enforces this.
- **All configs extend `../../tsconfig.base.json`.** Tests are `*.test.ts`, node environment, Vitest, pure logic only (no live network) — inject a fake `fetch` / fake SSE source / fake clock.
- **Run everything from the repo root.** Server tests: `npm test -w @trading-office/server`. Web: `npm test -w @trading-office/web`. Gateway: `npm test -w @trading-office/office-gateway`. Full: `npm test --workspaces`. Typecheck: `npm run typecheck` (root). Build: `npm run build`.
- **Time + network are injected, never ambient.** Every component that sleeps, retries, or fetches takes `fetchImpl`/`now`/`setTimeoutImpl`/`sseFactory` in its constructor with a real default, so tests are deterministic.
- **No fixtures in `trading-lab` mode.** In `OFFICE_CONNECTOR_MODE=trading-lab` no method may return `@trading-office/office-fixtures` data. Fixtures stay wired only in `fixture` mode.
- **Commit after each task** with a conventional-commit message.
- **Mode switch is read once at bootstrap** (`apps/server/src/index.ts`); `createOfficeApp` stays connector-agnostic (it takes an `OfficeReadConnector`).

## File structure (what each new/changed file owns)

```
apps/server/                                       CHANGED
  src/config.ts                                    MODIFY — + connectorMode, tradingLab{}, chatFollow{}, stream{}; fail-fast
  src/config.test.ts                               NEW — defaults, trading-lab fail-fast, knob parsing
  src/connector/OfficeReadConnector.ts             (unchanged port)
  src/connector/FixtureOfficeReadConnector.ts      MODIFY — getInfraStatus() now returns sources:[] (fixture/live)
  src/connector/CompositeOfficeReadConnector.ts    NEW — routes reads to lab; knowledge/bots → [] gap; infra → aggregator
  src/connector/CompositeOfficeReadConnector.test.ts NEW
  src/connector/InfraAggregator.ts                 NEW — office-self + lab healthz/readyz + sources map
  src/connector/InfraAggregator.test.ts            NEW
  src/connector/tradinglab/labDtos.ts              NEW — hand-mirrored input field types (no lab import)
  src/connector/tradinglab/TradingLabHttpClient.ts NEW — fetch + Bearer + timeout + error mapping
  src/connector/tradinglab/TradingLabHttpClient.test.ts NEW
  src/connector/tradinglab/mappers.ts              NEW — id/status/hypothesis/backtest/activity maps + humanize
  src/connector/tradinglab/mappers.test.ts         NEW
  src/connector/tradinglab/TradingLabReadConnector.ts NEW — client + mappers → office reads
  src/connector/tradinglab/TradingLabReadConnector.test.ts NEW
  src/connector/tradinglab/sseParse.ts             NEW — incremental text/event-stream line parser (M2)
  src/connector/tradinglab/sseParse.test.ts        NEW (M2)
  src/connector/tradinglab/TradingLabStreamBridge.ts NEW — one SSE conn + resume + fan-out (M2)
  src/connector/tradinglab/TradingLabStreamBridge.test.ts NEW (M2)
  src/connector/tradinglab/terminalTaxonomy.ts     NEW — taskType-prefix → terminal types (calibration-filled, M1→M3)
  src/operator/responder.ts                        (unchanged inert path — fixture mode)
  src/operator/summaryFilter.ts                    NEW — agent-event noise filter / whitelist (M3)
  src/operator/summaryFilter.test.ts               NEW (M3)
  src/operator/TradingLabChatConnector.ts          NEW — POST /chat/messages (Bearer chat token) (M3)
  src/operator/TradingLabChatConnector.test.ts     NEW (M3)
  src/operator/ConversationFollower.ts             NEW — correlationId bootstrap + tail + terminal + guards (M3)
  src/operator/ConversationFollower.test.ts        NEW (M3)
  src/operator/TradingLabOperatorResponder.ts      NEW — ChatResponse → lifecycle; starts follower (M3)
  src/operator/TradingLabOperatorResponder.test.ts NEW (M3)
  src/app.ts                                        MODIFY — accept an operator responder fn (default = inert) (M3)
  src/index.ts                                      MODIFY — bootstrap mode switch (fixture | trading-lab)
  src/index.test.ts                                NEW — wiring smoke per mode (no real network)
  .env.example                                     MODIFY — + OFFICE_CONNECTOR_MODE, TRADING_LAB_*, follow knobs

packages/office-gateway/                           CHANGED
  src/schemas.ts                                   MODIFY — BacktestSummary nullable fields; InfraStatus.sources
  src/dto.ts                                        (inferred aliases — no change needed beyond re-infer)
  src/schemas.test.ts                              MODIFY — null backtest parses; sources round-trip

packages/office-fixtures/                          CHANGED
  src/snapshots.ts                                 MODIFY — INFRA gains sources:[] (fixture/live)
  src/fixtures.test.ts                             MODIFY — fixtures still satisfy widened schemas

apps/web/                                          CHANGED
  src/floor/panels/BacktestsPanel.tsx              MODIFY — render `—` for null metric/descriptor fields
  src/floor/panels/KnowledgePanel.tsx              MODIFY — gap empty-state when sources.knowledge==='gap'
  src/floor/panels/BotHealthPanel.tsx              MODIFY — gap empty-state when sources['bot-health']==='gap'
  src/floor/panels/InfraPanel.tsx                  MODIFY — render sources map + lab health
  src/runtime/MockOfficeGateway.ts                 MODIFY — getInfraStatus returns sources (all fixture/live)
  (panel test files)                               MODIFY/NEW as noted per task
```

> **Note on `OfficeReadConnector` (server port):** seven read methods + `start(emit): () => void`. `CompositeOfficeReadConnector` implements all of them. The composite's `start` delegates to the `TradingLabStreamBridge` (M2); until M2 lands it is a no-op returning `() => {}` so M1 is independently shippable (reads live, stream not yet).

---

## Milestone M1 — reads + composite + gap markers + calibration #1

After M1: in `trading-lab` mode, agent statuses/activity/hypotheses/backtests come from the real Read API; knowledge/bot-health are honest empty gaps; infra reflects office + lab health. Stream + chat still come later (M2/M3). Existing `fixture`-mode tests stay green.

### Task M1.1 — Extend server config (mode + lab + follow/stream knobs)

**Files:**
- Modify: `apps/server/src/config.ts`
- Create: `apps/server/src/config.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/config.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { loadConfig } from './config';

const base = { TRADING_LAB_READ_URL: 'http://lab:3100', TRADING_LAB_READ_TOKEN: 't' };

describe('loadConfig', () => {
  it('defaults to fixture mode with no lab env', () => {
    const c = loadConfig({});
    expect(c.connectorMode).toBe('fixture');
    expect(c.port).toBe(8787);
  });

  it('parses trading-lab mode with lab + follow + stream knobs', () => {
    const c = loadConfig({
      OFFICE_CONNECTOR_MODE: 'trading-lab',
      ...base,
      TRADING_LAB_CHAT_URL: 'http://lab:3000',
      TRADING_LAB_CHAT_TOKEN: 'c',
      OFFICE_CHAT_FOLLOW_MAX_MS: '120000',
      OFFICE_CHAT_FOLLOW_IDLE_MS: '9000',
      OFFICE_CHAT_FOLLOW_MAX_DELTAS: '50',
      OFFICE_STREAM_RECONNECT_BASE_MS: '500',
      OFFICE_STREAM_RECONNECT_MAX_MS: '10000',
    });
    expect(c.connectorMode).toBe('trading-lab');
    expect(c.tradingLab.readUrl).toBe('http://lab:3100');
    expect(c.tradingLab.readToken).toBe('t');
    expect(c.tradingLab.chatUrl).toBe('http://lab:3000');
    expect(c.chatFollow.maxMs).toBe(120000);
    expect(c.chatFollow.idleMs).toBe(9000);
    expect(c.chatFollow.maxDeltas).toBe(50);
    expect(c.stream.reconnectBaseMs).toBe(500);
    expect(c.stream.reconnectMaxMs).toBe(10000);
  });

  it('fails fast in trading-lab mode without read url+token', () => {
    expect(() => loadConfig({ OFFICE_CONNECTOR_MODE: 'trading-lab' })).toThrow(/TRADING_LAB_READ_URL.*TRADING_LAB_READ_TOKEN/s);
  });

  it('uses follow/stream defaults when unset', () => {
    const c = loadConfig({ OFFICE_CONNECTOR_MODE: 'trading-lab', ...base });
    expect(c.chatFollow.maxMs).toBe(300000);
    expect(c.chatFollow.idleMs).toBe(45000);
    expect(c.chatFollow.maxDeltas).toBe(200);
    expect(c.chatFollow.bootstrapRetries).toBe(8);
    expect(c.stream.reconnectBaseMs).toBe(1000);
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npm test -w @trading-office/server -- config.test`
Expected: FAIL (new fields/`connectorMode` undefined; no fail-fast).

- [ ] **Step 3: Rewrite `apps/server/src/config.ts`**

Replace the file with (preserving the existing five fields + their env vars/defaults, adding the rest):

```ts
export type OfficeConnectorMode = 'fixture' | 'trading-lab';

export interface TradingLabConfig {
  readUrl: string;
  readToken: string;
  chatUrl: string;
  chatToken: string;
  requestTimeoutMs: number;
}

export interface ChatFollowConfig {
  maxMs: number;
  idleMs: number;
  maxDeltas: number;
  bootstrapRetries: number;
  bootstrapIntervalMs: number;
}

export interface StreamConfig {
  reconnectBaseMs: number;
  reconnectMaxMs: number;
}

export interface OfficeServerConfig {
  port: number;
  corsOrigin: string;
  eventTickMs: number;
  heartbeatMs: number;
  fixtureLatencyMs: number;
  connectorMode: OfficeConnectorMode;
  tradingLab: TradingLabConfig;
  chatFollow: ChatFollowConfig;
  stream: StreamConfig;
}

const num = (env: NodeJS.ProcessEnv, key: string, def: number): number => {
  const raw = env[key];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  return Number.isFinite(n) ? n : def;
};

const str = (env: NodeJS.ProcessEnv, key: string, def: string): string => {
  const raw = env[key];
  return raw === undefined || raw === '' ? def : raw;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): OfficeServerConfig {
  const connectorMode: OfficeConnectorMode =
    env.OFFICE_CONNECTOR_MODE === 'trading-lab' ? 'trading-lab' : 'fixture';

  const tradingLab: TradingLabConfig = {
    readUrl: str(env, 'TRADING_LAB_READ_URL', 'http://localhost:3100'),
    readToken: str(env, 'TRADING_LAB_READ_TOKEN', ''),
    chatUrl: str(env, 'TRADING_LAB_CHAT_URL', 'http://localhost:3000'),
    chatToken: str(env, 'TRADING_LAB_CHAT_TOKEN', ''),
    requestTimeoutMs: num(env, 'TRADING_LAB_REQUEST_TIMEOUT_MS', 10000),
  };

  if (connectorMode === 'trading-lab' && (!env.TRADING_LAB_READ_URL || !env.TRADING_LAB_READ_TOKEN)) {
    throw new Error(
      'OFFICE_CONNECTOR_MODE=trading-lab requires TRADING_LAB_READ_URL and TRADING_LAB_READ_TOKEN',
    );
  }

  return {
    port: num(env, 'OFFICE_SERVER_PORT', 8787),
    corsOrigin: str(env, 'OFFICE_CORS_ORIGIN', 'http://localhost:5174'),
    eventTickMs: num(env, 'OFFICE_EVENT_TICK_MS', 2600),
    heartbeatMs: num(env, 'OFFICE_HEARTBEAT_MS', 15000),
    fixtureLatencyMs: num(env, 'OFFICE_FIXTURE_LATENCY_MS', 0),
    connectorMode,
    tradingLab,
    chatFollow: {
      maxMs: num(env, 'OFFICE_CHAT_FOLLOW_MAX_MS', 300000),
      idleMs: num(env, 'OFFICE_CHAT_FOLLOW_IDLE_MS', 45000),
      maxDeltas: num(env, 'OFFICE_CHAT_FOLLOW_MAX_DELTAS', 200),
      bootstrapRetries: num(env, 'OFFICE_CHAT_BOOTSTRAP_RETRIES', 8),
      bootstrapIntervalMs: num(env, 'OFFICE_CHAT_BOOTSTRAP_INTERVAL_MS', 750),
    },
    stream: {
      reconnectBaseMs: num(env, 'OFFICE_STREAM_RECONNECT_BASE_MS', 1000),
      reconnectMaxMs: num(env, 'OFFICE_STREAM_RECONNECT_MAX_MS', 30000),
    },
  };
}
```

> If the existing `config.ts` exposed extra fields or a different default, keep them — only add the new ones. Confirm the five original env names against the current file before replacing.

- [ ] **Step 4: Run tests; verify pass**

Run: `npm test -w @trading-office/server -- config.test`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/config.ts apps/server/src/config.test.ts
git commit -m "feat(server): connector mode + trading-lab/follow/stream config"
```

### Task M1.2 — Widen the office-gateway contract (null-honest backtests + InfraStatus.sources)

**Files:**
- Modify: `packages/office-gateway/src/schemas.ts`
- Modify: `packages/office-gateway/src/schemas.test.ts`
- Modify: `packages/office-fixtures/src/snapshots.ts`
- Modify: `packages/office-fixtures/src/fixtures.test.ts`
- Modify: `apps/web/src/runtime/MockOfficeGateway.ts`

- [ ] **Step 1: Write the failing schema test**

Append to `packages/office-gateway/src/schemas.test.ts`:

```ts
import { backtestSummarySchema, infraStatusSchema } from './schemas';

describe('phase-3 contract widening', () => {
  it('accepts a backtest with null metrics + null descriptors', () => {
    const parsed = backtestSummarySchema.parse({
      id: 'b1', strategy: null, symbol: null, period: null,
      pnlPct: null, sharpe: null, winRatePct: null, maxDrawdownPct: null,
    });
    expect(parsed.pnlPct).toBeNull();
    expect(parsed.strategy).toBeNull();
  });

  it('still accepts a fully-populated backtest', () => {
    const parsed = backtestSummarySchema.parse({
      id: 'b2', strategy: 'mr', symbol: 'BTC', period: '30d',
      pnlPct: 4.2, sharpe: 1.1, winRatePct: 55, maxDrawdownPct: -8,
    });
    expect(parsed.pnlPct).toBe(4.2);
  });

  it('round-trips InfraStatus.sources', () => {
    const parsed = infraStatusSchema.parse({
      services: [], queues: [], lastSync: '2026-06-14T00:00:00.000Z',
      sources: [
        { domain: 'office-server', state: 'live', detail: 'ok' },
        { domain: 'knowledge', state: 'gap', detail: 'source not connected yet' },
      ],
    });
    expect(parsed.sources?.[1].state).toBe('gap');
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npm test -w @trading-office/office-gateway -- schemas.test`
Expected: FAIL (null rejected by `z.number()`/`z.string()`; `sources` unknown key stripped).

- [ ] **Step 3: Edit `packages/office-gateway/src/schemas.ts`**

Replace the `backtestSummarySchema` definition with:

```ts
export const backtestSummarySchema = z.object({
  id: z.string(),
  strategy: z.string().nullable(),
  symbol: z.string().nullable(),
  period: z.string().nullable(),
  pnlPct: z.number().nullable(),
  sharpe: z.number().nullable(),
  winRatePct: z.number().nullable(),
  maxDrawdownPct: z.number().nullable(),
});
```

Add the source-status enum + field. Above `infraStatusSchema` add:

```ts
export const infraSourceDomainSchema = z.enum([
  'office-server',
  'trading-lab-read-api',
  'trading-lab-stream',
  'knowledge',
  'bot-health',
]);
export const infraSourceStateSchema = z.enum(['live', 'degraded', 'error', 'gap', 'fixture']);
export const infraSourceSchema = z.object({
  domain: infraSourceDomainSchema,
  state: infraSourceStateSchema,
  detail: z.string(),
});
```

Then add `sources` to `infraStatusSchema` (optional so existing fixtures/mocks without it still parse during migration; M1.x populates it everywhere):

```ts
export const infraStatusSchema = z.object({
  services: z.array(infraServiceSchema),
  queues: z.array(z.object({ name: z.string(), depth: z.number() })),
  lastSync: z.string(),
  sources: z.array(infraSourceSchema).optional(),
});
```

In `packages/office-gateway/src/dto.ts` add inferred aliases (next to the others):

```ts
export type InfraSourceDomain = z.infer<typeof infraSourceDomainSchema>;
export type InfraSourceState = z.infer<typeof infraSourceStateSchema>;
export type InfraSource = z.infer<typeof infraSourceSchema>;
```

(Import the new schema names in `dto.ts` if it imports symbol-by-symbol; if it does `import * as schemas` no change needed.)

- [ ] **Step 4: Run gateway tests; verify pass**

Run: `npm test -w @trading-office/office-gateway -- schemas.test`
Expected: PASS.

- [ ] **Step 5: Make fixtures + mock satisfy the widened shape**

Edit `packages/office-fixtures/src/snapshots.ts` — extend the exported `INFRA` object with a `sources` array (real numbers stay; this is fixture mode so mark everything `fixture`/`live`):

```ts
export const INFRA: InfraStatus = {
  // ...existing services / queues / lastSync unchanged...
  sources: [
    { domain: 'office-server', state: 'live', detail: 'office server' },
    { domain: 'trading-lab-read-api', state: 'fixture', detail: 'fixture data' },
    { domain: 'trading-lab-stream', state: 'fixture', detail: 'simulated events' },
    { domain: 'knowledge', state: 'fixture', detail: 'sample knowledge' },
    { domain: 'bot-health', state: 'fixture', detail: 'sample bot health' },
  ],
};
```

Edit `apps/web/src/runtime/MockOfficeGateway.ts` — if it builds infra inline rather than re-exporting `INFRA`, add the same `sources`. (If it returns the fixtures' `INFRA` directly, no change.)

- [ ] **Step 6: Run the affected suites; verify pass**

Run: `npm test -w @trading-office/office-fixtures && npm test -w @trading-office/web -- MockOfficeGateway`
Expected: PASS (fixtures satisfy widened schema; mock infra has sources).

- [ ] **Step 7: Commit**

```bash
git add packages/office-gateway/src packages/office-fixtures/src apps/web/src/runtime/MockOfficeGateway.ts
git commit -m "feat(gateway): null-honest BacktestSummary + InfraStatus.sources"
```

### Task M1.3 — Mirror the trading-lab input DTOs (no import)

**Files:**
- Create: `apps/server/src/connector/tradinglab/labDtos.ts`

- [ ] **Step 1: Create `labDtos.ts`** (mirrors only the fields the office consumes; field names match `trading-lab/src/read-api/dto.ts` + `chat/response.ts` + `domain/{types,schemas}.ts`)

```ts
// Hand-mirrored from trading-lab — DO NOT import the trading-lab package.
// Only the fields the office actually reads are declared.

export type LabAgentId = 'analyst' | 'researcher' | 'critic' | 'builder' | 'system';
export type LabLifecycle = 'idle' | 'working' | 'succeeded' | 'failed';

export interface LabAgentEvent {
  id: string;
  ts: string;
  type: string;
  taskId: string;
  correlationId?: string;
  level: 'info' | 'warn' | 'error';
  summary: string;
  payloadSummary?: Record<string, unknown>;
}

export interface LabAgentSummary {
  agentId: LabAgentId;
  status: LabLifecycle;
  currentTaskId: string | null;
  lastEvent: LabAgentEvent | null;
}

export interface LabAgentActivity {
  agentId: LabAgentId;
  status: LabLifecycle;
  currentTask: { id: string; type: string; status: LabLifecycle } | null;
  trace: LabAgentEvent[];
}

export interface LabExpectedEffect {
  metric: string;
  direction: 'increase' | 'decrease';
  magnitude?: string;
}

export interface LabHypothesisListItem {
  id: string;
  profileId: string;
  thesis: string;
  targetBehavior: string;
  status: 'validated' | 'rejected';
  confidence: number;
  expectedEffect: LabExpectedEffect;
  createdAt: string;
  updatedAt: string;
}

export interface LabBacktestMetrics {
  netPnlUsd: number | null;
  netPnlPct: number | null;
  totalTrades: number | null;
  winRate: number | null;
  profitFactor: number | null;
  maxDrawdownPct: number | null;
  expectancyUsd: number | null;
  sharpe: number | null;
  topTradeContributionPct: number | null;
}

export interface LabBacktest {
  id: string;
  hypothesisId: string;
  status: string;
  metrics: LabBacktestMetrics;
  submittedAt: string;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// List envelopes (note the two shapes).
export interface LabPageEnvelope<T> {
  data: T[];
  page: { nextCursor: string | null; limit: number };
}
export interface LabCursorEnvelope<T> {
  data: T[];
  cursor: string | null;
}

// Chat ingress response — discriminated on `kind`. TaskStatus terminal = completed|failed|rejected.
export type LabTaskStatus = 'accepted' | 'queued' | 'running' | 'completed' | 'failed' | 'rejected';
export type LabChatResponse =
  | { kind: 'task_created'; sessionId: string; taskId: string; taskType: string; status: LabTaskStatus; plannedNextStep?: { taskType: string; after: string } }
  | { kind: 'task_status'; sessionId: string; taskId: string; status: LabTaskStatus }
  | { kind: 'needs_clarification'; sessionId: string; question: string; missing: string[] }
  | { kind: 'out_of_scope'; sessionId: string; message: string }
  | { kind: 'capability_not_available'; sessionId: string; capability: string; message: string }
  | { kind: 'help'; sessionId: string; message: string; supportedIntents: string[] }
  | { kind: 'rejected'; sessionId: string; reason: string; issues?: unknown[] }
  | { kind: 'error'; sessionId: string; message: string };

export interface LabHealth { status: 'ok' }
export interface LabReady { status: 'ok' | 'degraded'; checks: { db: boolean } }
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (types only, no usage yet).

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/connector/tradinglab/labDtos.ts
git commit -m "feat(server): hand-mirrored trading-lab input DTOs"
```

### Task M1.4 — `TradingLabHttpClient` (Bearer + timeout + error mapping)

**Files:**
- Create: `apps/server/src/connector/tradinglab/TradingLabHttpClient.ts`
- Create: `apps/server/src/connector/tradinglab/TradingLabHttpClient.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { TradingLabHttpClient } from './TradingLabHttpClient';

const ok = (body: unknown): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

const cfg = { readUrl: 'http://lab:3100', readToken: 'secret', requestTimeoutMs: 1000 };

describe('TradingLabHttpClient', () => {
  it('sends Authorization: Bearer <read token> to /v1 paths', async () => {
    const fetchImpl = vi.fn(async () => ok({ data: [], page: { nextCursor: null, limit: 20 } }));
    const client = new TradingLabHttpClient({ ...cfg, fetchImpl });
    await client.getHypotheses();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe('http://lab:3100/v1/hypotheses');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret');
  });

  it('maps 401 to upstream_unauthorized', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 401 }));
    const client = new TradingLabHttpClient({ ...cfg, fetchImpl });
    await expect(client.getBacktests()).rejects.toMatchObject({ office: { code: 'upstream_unauthorized' } });
  });

  it('maps 500 to upstream_unavailable', async () => {
    const fetchImpl = vi.fn(async () => new Response('boom', { status: 500 }));
    const client = new TradingLabHttpClient({ ...cfg, fetchImpl });
    await expect(client.getBacktests()).rejects.toMatchObject({ office: { code: 'upstream_unavailable' } });
  });

  it('maps a network throw to upstream_unavailable', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('ECONNREFUSED'); });
    const client = new TradingLabHttpClient({ ...cfg, fetchImpl });
    await expect(client.getAgents()).rejects.toMatchObject({ office: { code: 'upstream_unavailable' } });
  });

  it('does not send the read token to healthz (public)', async () => {
    const fetchImpl = vi.fn(async () => ok({ status: 'ok' }));
    const client = new TradingLabHttpClient({ ...cfg, fetchImpl });
    await client.getHealthz();
    const [, init] = fetchImpl.mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npm test -w @trading-office/server -- TradingLabHttpClient`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `TradingLabHttpClient.ts`**

```ts
import type {
  LabAgentSummary, LabAgentActivity, LabAgentEvent, LabHypothesisListItem, LabBacktest,
  LabCursorEnvelope, LabPageEnvelope, LabHealth, LabReady,
} from './labDtos';

export interface OfficeUpstreamError extends Error {
  office: { code: 'upstream_unavailable' | 'upstream_unauthorized' | 'upstream_bad_request'; message: string };
}

const upstream = (
  code: OfficeUpstreamError['office']['code'],
  message: string,
): OfficeUpstreamError => Object.assign(new Error(message), { office: { code, message } }) as OfficeUpstreamError;

export interface TradingLabHttpClientDeps {
  readUrl: string;
  readToken: string;
  requestTimeoutMs: number;
  fetchImpl?: typeof fetch;
}

export class TradingLabHttpClient {
  private readonly fetchImpl: typeof fetch;
  constructor(private readonly deps: TradingLabHttpClientDeps) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
  }

  getAgents(): Promise<LabCursorEnvelope<LabAgentSummary>> {
    return this.getJson('/v1/agents', true);
  }
  getAgent(agentId: string): Promise<LabAgentActivity> {
    return this.getJson(`/v1/agents/${encodeURIComponent(agentId)}`, true);
  }
  getHypotheses(): Promise<LabPageEnvelope<LabHypothesisListItem>> {
    return this.getJson('/v1/hypotheses', true);
  }
  getBacktests(): Promise<LabPageEnvelope<LabBacktest>> {
    return this.getJson('/v1/backtests', true);
  }
  getAgentEvents(query: Record<string, string>): Promise<LabPageEnvelope<LabAgentEvent>> {
    const qs = new URLSearchParams(query).toString();
    return this.getJson(`/v1/agent-events${qs ? `?${qs}` : ''}`, true);
  }
  getHealthz(): Promise<LabHealth> {
    return this.getJson('/healthz', false);
  }
  getReadyz(): Promise<LabReady> {
    return this.getJson('/readyz', false);
  }

  private async getJson<T>(path: string, auth: boolean): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (auth) headers.Authorization = `Bearer ${this.deps.readToken}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.deps.requestTimeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.deps.readUrl}${path}`, { headers, signal: ctrl.signal });
    } catch (e) {
      throw upstream('upstream_unavailable', `trading-lab read request failed: ${(e as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401 || res.status === 403) {
      throw upstream('upstream_unauthorized', `trading-lab read returned ${res.status}`);
    }
    if (res.status >= 500) {
      throw upstream('upstream_unavailable', `trading-lab read returned ${res.status}`);
    }
    if (res.status >= 400) {
      throw upstream('upstream_bad_request', `trading-lab read returned ${res.status}`);
    }
    return (await res.json()) as T;
  }
}
```

- [ ] **Step 4: Run tests; verify pass**

Run: `npm test -w @trading-office/server -- TradingLabHttpClient`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/connector/tradinglab/TradingLabHttpClient.ts apps/server/src/connector/tradinglab/TradingLabHttpClient.test.ts
git commit -m "feat(server): trading-lab HTTP client with bearer + error mapping"
```

### Task M1.5 — Mappers (id/status/hypothesis/backtest/activity)

**Files:**
- Create: `apps/server/src/connector/tradinglab/mappers.ts`
- Create: `apps/server/src/connector/tradinglab/mappers.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { mapAgentId, mapAgentStatus, mapAgentStatuses, mapAgentActivity, mapHypothesis, mapBacktest } from './mappers';
import type { LabAgentActivity, LabAgentSummary, LabBacktest, LabHypothesisListItem } from './labDtos';

describe('agent id + status mapping', () => {
  it('maps lab ids to office ids (system → boss)', () => {
    expect(mapAgentId('analyst')).toBe('analyst');
    expect(mapAgentId('system')).toBe('boss');
  });
  it('maps lifecycle with per-agent busy flavor', () => {
    expect(mapAgentStatus('builder', 'idle')).toBe('idle');
    expect(mapAgentStatus('builder', 'succeeded')).toBe('success');
    expect(mapAgentStatus('builder', 'failed')).toBe('failed');
    expect(mapAgentStatus('builder', 'working')).toBe('running');
    expect(mapAgentStatus('critic', 'working')).toBe('reviewing');
    expect(mapAgentStatus('researcher', 'working')).toBe('thinking');
  });
  it('builds an AgentStatusMap keyed by office ids', () => {
    const agents: LabAgentSummary[] = [
      { agentId: 'analyst', status: 'working', currentTaskId: 't1', lastEvent: null },
      { agentId: 'system', status: 'idle', currentTaskId: null, lastEvent: null },
    ];
    expect(mapAgentStatuses(agents)).toEqual({ analyst: 'thinking', boss: 'idle' });
  });
});

describe('hypothesis mapping (validated/rejected only)', () => {
  it('maps fields and stage', () => {
    const h: LabHypothesisListItem = {
      id: 'h1', profileId: 'p', thesis: 'Funding reverts', targetBehavior: 'short MR',
      status: 'validated', confidence: 0.7,
      expectedEffect: { metric: 'pnl', direction: 'increase' },
      createdAt: 'x', updatedAt: 'y',
    };
    expect(mapHypothesis(h)).toEqual({ id: 'h1', title: 'Funding reverts', summary: 'short MR', stage: 'validated' });
  });
});

describe('backtest mapping (null-honest, winRate x100)', () => {
  it('keeps nulls (never 0) and scales winRate', () => {
    const b: LabBacktest = {
      id: 'b1', hypothesisId: 'h1', status: 'completed',
      metrics: { netPnlUsd: null, netPnlPct: 4.2, totalTrades: null, winRate: 0.55, profitFactor: null, maxDrawdownPct: -8, expectancyUsd: null, sharpe: null, topTradeContributionPct: null },
      submittedAt: 'x', finishedAt: null, createdAt: 'x', updatedAt: 'y',
    };
    expect(mapBacktest(b)).toEqual({
      id: 'b1', strategy: null, symbol: null, period: null,
      pnlPct: 4.2, sharpe: null, winRatePct: 55, maxDrawdownPct: -8,
    });
  });
});

describe('activity mapping', () => {
  it('maps currentTask + trace → logs', () => {
    const a: LabAgentActivity = {
      agentId: 'researcher', status: 'working',
      currentTask: { id: 't1', type: 'research.run_cycle', status: 'working' },
      trace: [{ id: 'e1', ts: '2026-06-14T00:00:00Z', type: 'research.run_cycle.started', taskId: 't1', level: 'info', summary: 'Research Run Cycle Started' }],
    };
    const out = mapAgentActivity(a);
    expect(out.agentId).toBe('researcher');
    expect(out.status).toBe('thinking');
    expect(out.currentTask).toBe('Research Run Cycle');
    expect(out.logs).toEqual([{ ts: '2026-06-14T00:00:00Z', level: 'info', text: 'Research Run Cycle Started' }]);
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npm test -w @trading-office/server -- mappers`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `mappers.ts`**

```ts
import type { AgentStatus, AgentStatusMap, AgentActivity, Hypothesis, BacktestSummary, TraceLine } from '@trading-office/office-gateway';
import type { LabAgentActivity, LabAgentId, LabAgentSummary, LabBacktest, LabHypothesisListItem, LabLifecycle } from './labDtos';

const ID_MAP: Record<LabAgentId, string> = {
  analyst: 'analyst', researcher: 'researcher', critic: 'critic', builder: 'builder', system: 'boss',
};
export const mapAgentId = (id: LabAgentId): string => ID_MAP[id];

// per-agent "busy" flavor for the working lifecycle
const WORKING_FLAVOR: Record<string, AgentStatus> = { critic: 'reviewing', builder: 'running' };
export function mapAgentStatus(labId: LabAgentId, lifecycle: LabLifecycle): AgentStatus {
  switch (lifecycle) {
    case 'idle': return 'idle';
    case 'succeeded': return 'success';
    case 'failed': return 'failed';
    case 'working': return WORKING_FLAVOR[mapAgentId(labId)] ?? 'thinking';
  }
}

export function mapAgentStatuses(agents: LabAgentSummary[]): AgentStatusMap {
  const out: AgentStatusMap = {};
  for (const a of agents) out[mapAgentId(a.agentId)] = mapAgentStatus(a.agentId, a.status);
  return out;
}

export function humanize(type: string): string {
  return type.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function mapAgentActivity(a: LabAgentActivity): AgentActivity {
  const logs: TraceLine[] = a.trace.map((e) => ({ ts: e.ts, level: e.level, text: e.summary }));
  return {
    agentId: mapAgentId(a.agentId),
    status: mapAgentStatus(a.agentId, a.status),
    currentTask: a.currentTask ? humanize(a.currentTask.type) : null,
    logs,
  };
}

export function mapHypothesis(h: LabHypothesisListItem): Hypothesis {
  return { id: h.id, title: h.thesis, summary: h.targetBehavior, stage: h.status };
}

// winRate is a fraction (0..1) on the lab side — confirm in M1 calibration; ×100 here for the office percent field.
export function mapBacktest(b: LabBacktest): BacktestSummary {
  const m = b.metrics;
  return {
    id: b.id,
    strategy: null,
    symbol: null,
    period: null,
    pnlPct: m.netPnlPct,
    sharpe: m.sharpe,
    winRatePct: m.winRate === null ? null : m.winRate * 100,
    maxDrawdownPct: m.maxDrawdownPct,
  };
}
```

> `Hypothesis.stage` is `'proposed'|'testing'|'validated'|'rejected'`; lab `status` is only `'validated'|'rejected'`, a valid subset, so `stage: h.status` typechecks. `AgentStatus` comes from the kit via the gateway re-export.

- [ ] **Step 4: Run tests; verify pass**

Run: `npm test -w @trading-office/server -- mappers`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/connector/tradinglab/mappers.ts apps/server/src/connector/tradinglab/mappers.test.ts
git commit -m "feat(server): trading-lab → office DTO mappers (null-honest)"
```

### Task M1.6 — `TradingLabReadConnector` (client + mappers → office reads)

**Files:**
- Create: `apps/server/src/connector/tradinglab/TradingLabReadConnector.ts`
- Create: `apps/server/src/connector/tradinglab/TradingLabReadConnector.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { TradingLabHttpClient } from './TradingLabHttpClient';
import { TradingLabReadConnector } from './TradingLabReadConnector';

const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
const cfg = { readUrl: 'http://lab:3100', readToken: 't', requestTimeoutMs: 1000 };
const conn = (fetchImpl: typeof fetch) => new TradingLabReadConnector(new TradingLabHttpClient({ ...cfg, fetchImpl }));

describe('TradingLabReadConnector', () => {
  it('maps /v1/agents (cursor envelope) → AgentStatusMap with office ids', async () => {
    const c = conn(vi.fn(async () => json({ data: [
      { agentId: 'analyst', status: 'working', currentTaskId: null, lastEvent: null },
      { agentId: 'system', status: 'idle', currentTaskId: null, lastEvent: null },
    ], cursor: null })) as unknown as typeof fetch);
    expect(await c.getAgentStatuses()).toEqual({ analyst: 'thinking', boss: 'idle' });
  });

  it('maps /v1/hypotheses (page envelope) → Hypothesis[]', async () => {
    const c = conn(vi.fn(async () => json({ data: [
      { id: 'h1', profileId: 'p', thesis: 'T', targetBehavior: 'B', status: 'rejected', confidence: 0.2, expectedEffect: { metric: 'm', direction: 'decrease' }, createdAt: 'x', updatedAt: 'y' },
    ], page: { nextCursor: null, limit: 20 } })) as unknown as typeof fetch);
    expect(await c.getHypotheses()).toEqual([{ id: 'h1', title: 'T', summary: 'B', stage: 'rejected' }]);
  });

  it('maps /v1/backtests → BacktestSummary[] preserving nulls', async () => {
    const c = conn(vi.fn(async () => json({ data: [
      { id: 'b1', hypothesisId: 'h1', status: 'completed', metrics: { netPnlUsd: null, netPnlPct: null, totalTrades: null, winRate: null, profitFactor: null, maxDrawdownPct: null, expectancyUsd: null, sharpe: null, topTradeContributionPct: null }, submittedAt: 'x', finishedAt: null, createdAt: 'x', updatedAt: 'y' },
    ], page: { nextCursor: null, limit: 20 } })) as unknown as typeof fetch);
    expect((await c.getBacktests())[0]).toMatchObject({ id: 'b1', pnlPct: null, winRatePct: null, strategy: null });
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npm test -w @trading-office/server -- TradingLabReadConnector`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `TradingLabReadConnector.ts`**

```ts
import type { AgentStatusMap, AgentActivity, Hypothesis, BacktestSummary } from '@trading-office/office-gateway';
import type { TradingLabHttpClient } from './TradingLabHttpClient';
import { mapAgentStatuses, mapAgentActivity, mapHypothesis, mapBacktest } from './mappers';

export class TradingLabReadConnector {
  constructor(private readonly client: TradingLabHttpClient) {}

  async getAgentStatuses(): Promise<AgentStatusMap> {
    const { data } = await this.client.getAgents();
    return mapAgentStatuses(data);
  }
  async getAgentActivity(agentId: string): Promise<AgentActivity> {
    return mapAgentActivity(await this.client.getAgent(agentId));
  }
  async getHypotheses(): Promise<Hypothesis[]> {
    const { data } = await this.client.getHypotheses();
    return data.map(mapHypothesis);
  }
  async getBacktests(): Promise<BacktestSummary[]> {
    const { data } = await this.client.getBacktests();
    return data.map(mapBacktest);
  }
}
```

- [ ] **Step 4: Run tests; verify pass**

Run: `npm test -w @trading-office/server -- TradingLabReadConnector`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/connector/tradinglab/TradingLabReadConnector.ts apps/server/src/connector/tradinglab/TradingLabReadConnector.test.ts
git commit -m "feat(server): TradingLabReadConnector wires client + mappers"
```

### Task M1.7 — `InfraAggregator` (office + lab health + sources map)

**Files:**
- Create: `apps/server/src/connector/InfraAggregator.ts`
- Create: `apps/server/src/connector/InfraAggregator.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { InfraAggregator } from './InfraAggregator';

const NOW = () => '2026-06-14T00:00:00.000Z';
const byDomain = (infra: Awaited<ReturnType<InfraAggregator['getInfraStatus']>>) =>
  Object.fromEntries((infra.sources ?? []).map((s) => [s.domain, s.state]));

describe('InfraAggregator', () => {
  it('read-api live + knowledge/bot-health gaps when readyz ok', async () => {
    const client = { getReadyz: async () => ({ status: 'ok' as const, checks: { db: true } }) };
    const infra = await new InfraAggregator(client, () => 'live', NOW).getInfraStatus();
    const d = byDomain(infra);
    expect(d['trading-lab-read-api']).toBe('live');
    expect(d['trading-lab-stream']).toBe('live');
    expect(d['knowledge']).toBe('gap');
    expect(d['bot-health']).toBe('gap');
    expect(infra.queues).toEqual([]);
    expect(infra.lastSync).toBe('2026-06-14T00:00:00.000Z');
  });

  it('read-api error when readyz throws; stream state reflected', async () => {
    const client = { getReadyz: async () => { throw new Error('down'); } };
    const infra = await new InfraAggregator(client, () => 'error', NOW).getInfraStatus();
    const d = byDomain(infra);
    expect(d['trading-lab-read-api']).toBe('error');
    expect(d['trading-lab-stream']).toBe('error');
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npm test -w @trading-office/server -- InfraAggregator`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `InfraAggregator.ts`**

```ts
import type { InfraStatus, InfraSource, InfraSourceState } from '@trading-office/office-gateway';
import type { TradingLabHttpClient } from './tradinglab/TradingLabHttpClient';

type ReadyzClient = Pick<TradingLabHttpClient, 'getReadyz'>;
type StreamState = Extract<InfraSourceState, 'live' | 'degraded' | 'error'>;

export class InfraAggregator {
  constructor(
    private readonly client: ReadyzClient,
    private readonly streamState: () => StreamState,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async getInfraStatus(): Promise<InfraStatus> {
    const services: InfraStatus['services'] = [{ name: 'office-server', up: true, detail: 'ok' }];
    let readApi: InfraSourceState = 'live';
    let readDetail = 'reachable';
    try {
      const ready = await this.client.getReadyz();
      const up = ready.status === 'ok';
      services.push({ name: 'trading-lab-read-api', up, detail: ready.status });
      readApi = up ? 'live' : 'degraded';
      readDetail = `readyz: ${ready.status}`;
    } catch {
      services.push({ name: 'trading-lab-read-api', up: false, detail: 'unreachable' });
      readApi = 'error';
      readDetail = 'unreachable';
    }
    const stream = this.streamState();
    const sources: InfraSource[] = [
      { domain: 'office-server', state: 'live', detail: 'office server' },
      { domain: 'trading-lab-read-api', state: readApi, detail: readDetail },
      { domain: 'trading-lab-stream', state: stream, detail: `stream ${stream}` },
      { domain: 'knowledge', state: 'gap', detail: 'Knowledge source is not connected yet' },
      { domain: 'bot-health', state: 'gap', detail: 'Bot runtime monitoring is not connected yet' },
    ];
    return { services, queues: [], lastSync: this.now(), sources };
  }
}
```

- [ ] **Step 4: Run tests; verify pass**

Run: `npm test -w @trading-office/server -- InfraAggregator`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/connector/InfraAggregator.ts apps/server/src/connector/InfraAggregator.test.ts
git commit -m "feat(server): InfraAggregator with honest source map"
```

### Task M1.8 — `CompositeOfficeReadConnector` (route reads; empty gaps)

**Files:**
- Create: `apps/server/src/connector/CompositeOfficeReadConnector.ts`
- Create: `apps/server/src/connector/CompositeOfficeReadConnector.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { CompositeOfficeReadConnector } from './CompositeOfficeReadConnector';

const read = {
  getAgentStatuses: vi.fn(async () => ({ analyst: 'idle' as const })),
  getAgentActivity: vi.fn(async () => ({ agentId: 'analyst', status: 'idle' as const, currentTask: null, logs: [] })),
  getHypotheses: vi.fn(async () => [{ id: 'h1', title: 't', summary: 's', stage: 'validated' as const }]),
  getBacktests: vi.fn(async () => []),
};
const infra = { getInfraStatus: vi.fn(async () => ({ services: [], queues: [], lastSync: 'x', sources: [] })) };
const make = (startBridge = () => () => {}) =>
  new CompositeOfficeReadConnector({ read: read as never, infra: infra as never, startBridge });

describe('CompositeOfficeReadConnector', () => {
  it('routes reads to the lab read connector', async () => {
    const c = make();
    expect(await c.getAgentStatuses()).toEqual({ analyst: 'idle' });
    expect(await c.getHypotheses()).toHaveLength(1);
    expect(read.getBacktests).toHaveBeenCalled();
  });
  it('returns honest empty gaps for knowledge + bot-health (no fixtures)', async () => {
    const c = make();
    expect(await c.getKnowledge()).toEqual([]);
    expect(await c.getBotHealth()).toEqual([]);
  });
  it('delegates start() to the bridge factory and returns its stop', () => {
    const stop = vi.fn();
    const startBridge = vi.fn(() => stop);
    const off = make(startBridge).start(() => {});
    expect(startBridge).toHaveBeenCalledOnce();
    off();
    expect(stop).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npm test -w @trading-office/server -- CompositeOfficeReadConnector`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `CompositeOfficeReadConnector.ts`**

```ts
import type { OfficeReadConnector } from './OfficeReadConnector';
import type {
  OfficeEvent, AgentStatusMap, AgentActivity, Hypothesis, BacktestSummary, BotHealth, KnowledgeEntry, InfraStatus,
} from '@trading-office/office-gateway';
import type { TradingLabReadConnector } from './tradinglab/TradingLabReadConnector';
import type { InfraAggregator } from './InfraAggregator';

export interface CompositeDeps {
  read: Pick<TradingLabReadConnector, 'getAgentStatuses' | 'getAgentActivity' | 'getHypotheses' | 'getBacktests'>;
  infra: Pick<InfraAggregator, 'getInfraStatus'>;
  /** M2 injects the real SSE bridge; M1 passes a no-op. */
  startBridge: (emit: (e: OfficeEvent) => void) => () => void;
}

export class CompositeOfficeReadConnector implements OfficeReadConnector {
  constructor(private readonly deps: CompositeDeps) {}

  getAgentStatuses(): Promise<AgentStatusMap> { return this.deps.read.getAgentStatuses(); }
  getAgentActivity(agentId: string): Promise<AgentActivity> { return this.deps.read.getAgentActivity(agentId); }
  getHypotheses(): Promise<Hypothesis[]> { return this.deps.read.getHypotheses(); }
  getBacktests(): Promise<BacktestSummary[]> { return this.deps.read.getBacktests(); }

  // Honest gaps — no fixtures in trading-lab mode.
  async getKnowledge(): Promise<KnowledgeEntry[]> { return []; }
  async getBotHealth(): Promise<BotHealth[]> { return []; }

  getInfraStatus(): Promise<InfraStatus> { return this.deps.infra.getInfraStatus(); }

  start(emit: (e: OfficeEvent) => void): () => void { return this.deps.startBridge(emit); }
}
```

- [ ] **Step 4: Run tests; verify pass**

Run: `npm test -w @trading-office/server -- CompositeOfficeReadConnector`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/connector/CompositeOfficeReadConnector.ts apps/server/src/connector/CompositeOfficeReadConnector.test.ts
git commit -m "feat(server): CompositeOfficeReadConnector (lab reads + honest gaps)"
```

### Task M1.9 — Bootstrap mode switch (`buildConnector` + `index.ts`)

**Files:**
- Create: `apps/server/src/connector/buildConnector.ts`
- Create: `apps/server/src/connector/buildConnector.test.ts`
- Modify: `apps/server/src/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { buildConnector } from './buildConnector';
import { loadConfig } from '../config';

describe('buildConnector', () => {
  it('returns the fixture connector in fixture mode (knowledge is sample data)', async () => {
    const conn = buildConnector(loadConfig({}));
    expect((await conn.getKnowledge()).length).toBeGreaterThan(0);
  });

  it('returns the composite (empty knowledge gap) in trading-lab mode', async () => {
    const config = loadConfig({ OFFICE_CONNECTOR_MODE: 'trading-lab', TRADING_LAB_READ_URL: 'http://lab:3100', TRADING_LAB_READ_TOKEN: 't' });
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [], cursor: null }), { status: 200 }));
    const conn = buildConnector(config, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await conn.getKnowledge()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npm test -w @trading-office/server -- buildConnector`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `buildConnector.ts`**

```ts
import type { OfficeServerConfig } from '../config';
import type { OfficeReadConnector } from './OfficeReadConnector';
import { FixtureOfficeReadConnector } from './FixtureOfficeReadConnector';
import { CompositeOfficeReadConnector } from './CompositeOfficeReadConnector';
import { TradingLabHttpClient } from './tradinglab/TradingLabHttpClient';
import { TradingLabReadConnector } from './tradinglab/TradingLabReadConnector';
import { InfraAggregator } from './InfraAggregator';

export interface BuildConnectorDeps {
  fetchImpl?: typeof fetch;
}

export function buildConnector(config: OfficeServerConfig, deps: BuildConnectorDeps = {}): OfficeReadConnector {
  if (config.connectorMode === 'fixture') {
    return new FixtureOfficeReadConnector(config);
  }
  const client = new TradingLabHttpClient({
    readUrl: config.tradingLab.readUrl,
    readToken: config.tradingLab.readToken,
    requestTimeoutMs: config.tradingLab.requestTimeoutMs,
    fetchImpl: deps.fetchImpl,
  });
  const read = new TradingLabReadConnector(client);
  // M2 replaces the static 'live' + no-op startBridge with the real TradingLabStreamBridge.
  const infra = new InfraAggregator(client, () => 'live');
  return new CompositeOfficeReadConnector({ read, infra, startBridge: () => () => {} });
}
```

- [ ] **Step 4: Run tests; verify pass**

Run: `npm test -w @trading-office/server -- buildConnector`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire `index.ts` to use it**

In `apps/server/src/index.ts`, replace the connector construction line:

```ts
// before:
// const connector = new FixtureOfficeReadConnector(config);
// after:
import { buildConnector } from './connector/buildConnector';
const connector = buildConnector(config);
```

Remove the now-unused `FixtureOfficeReadConnector` import from `index.ts` if it becomes unused. Leave the rest (bus, `connector.start(...)`, heartbeat, `serve`, `injectWebSocket`, shutdown) unchanged — `start()` is a no-op in trading-lab mode until M2.

- [ ] **Step 6: Typecheck + full server suite**

Run: `npm run typecheck && npm test -w @trading-office/server`
Expected: PASS (all green; existing Phase 2 tests unaffected).

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/connector/buildConnector.ts apps/server/src/connector/buildConnector.test.ts apps/server/src/index.ts
git commit -m "feat(server): bootstrap connector mode switch (fixture|trading-lab)"
```

### Task M1.10 — Web: `—` for null backtests + honest gap empty-states

**Files:**
- Create: `apps/web/src/floor/panels/format.ts`
- Create: `apps/web/src/floor/panels/format.test.ts`
- Create: `apps/web/src/floor/infraSources.ts`
- Create: `apps/web/src/floor/infraSources.test.ts`
- Modify: `apps/web/src/floor/panels/BacktestsPanel.tsx`
- Modify: `apps/web/src/floor/panels/KnowledgePanel.tsx`
- Modify: `apps/web/src/floor/panels/BotHealthPanel.tsx`
- Modify: `apps/web/src/floor/panels/InfraPanel.tsx`

- [ ] **Step 1: Write the failing pure-helper tests**

`apps/web/src/floor/panels/format.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { fmtNum, fmtPct, fmtText, dash } from './format';

describe('format fallbacks (null → —)', () => {
  it('formats or dashes', () => {
    expect(fmtPct(null)).toBe(dash);
    expect(fmtPct(4.25)).toBe('4.3%');
    expect(fmtNum(null)).toBe(dash);
    expect(fmtNum(1.5)).toBe('1.50');
    expect(fmtText(null)).toBe(dash);
    expect(fmtText('')).toBe(dash);
    expect(fmtText('BTC')).toBe('BTC');
  });
});
```

`apps/web/src/floor/infraSources.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { sourceState, isGap } from './infraSources';

const infra = { services: [], queues: [], lastSync: 'x', sources: [{ domain: 'knowledge', state: 'gap', detail: 'd' }] } as never;

describe('infra source helpers', () => {
  it('reads a domain state and detects gap', () => {
    expect(sourceState(infra, 'knowledge')).toBe('gap');
    expect(isGap(sourceState(infra, 'knowledge'))).toBe(true);
    expect(isGap(sourceState(infra, 'office-server'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run them; verify they fail**

Run: `npm test -w @trading-office/web -- format infraSources`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement the helpers**

`apps/web/src/floor/panels/format.ts`:

```ts
export const dash = '—';
export const fmtNum = (n: number | null, digits = 2): string => (n === null ? dash : n.toFixed(digits));
export const fmtPct = (n: number | null, digits = 1): string => (n === null ? dash : `${n.toFixed(digits)}%`);
export const fmtText = (s: string | null): string => (s === null || s === '' ? dash : s);
```

`apps/web/src/floor/infraSources.ts`:

```ts
import type { InfraStatus, InfraSourceDomain, InfraSourceState } from '@trading-office/office-gateway';

export function sourceState(infra: InfraStatus | undefined, domain: InfraSourceDomain): InfraSourceState | undefined {
  return infra?.sources?.find((s) => s.domain === domain)?.state;
}
export const isGap = (state: InfraSourceState | undefined): boolean => state === 'gap';
```

- [ ] **Step 4: Run them; verify pass**

Run: `npm test -w @trading-office/web -- format infraSources`
Expected: PASS.

- [ ] **Step 5: Wire the panels (no render test — house style is pure-logic tests only)**

In `BacktestsPanel.tsx`, import `fmtPct, fmtNum, fmtText` and render each cell through them: `strategy`/`symbol`/`period` → `fmtText(...)`; `pnlPct`/`winRatePct`/`maxDrawdownPct` → `fmtPct(...)`; `sharpe` → `fmtNum(...)`. (Read the current cells and replace each `{row.field}` with the matching helper call.)

In `KnowledgePanel.tsx` and `BotHealthPanel.tsx`, take the current `InfraStatus` from the runtime store (the panels already receive snapshot data via the gateway; thread `infra` in if not already present) and when `isGap(sourceState(infra, 'knowledge'))` / `'bot-health'`, render the empty-state copy instead of the list:
- Knowledge: **"Knowledge source is not connected yet"**
- Bot health: **"Bot runtime monitoring is not connected yet"**

In `InfraPanel.tsx`, render the `infra.sources` array as a small status list (domain → state badge + detail), in addition to the existing services/queues.

> Keep the JSX consistent with each panel's existing markup; only the value expressions + the gap branch change.

- [ ] **Step 6: Typecheck + web suite + build**

Run: `npm run typecheck && npm test -w @trading-office/web && npm run build`
Expected: PASS (helpers covered; panels typecheck; build green).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/floor
git commit -m "feat(web): — for null backtest fields + honest knowledge/bot-health gaps"
```

### Task M1.11 — Calibration pass #1 + terminal taxonomy (feeds M3)

This task creates the calibration-filled taxonomy module + the helpers M3's follower uses, and runs the **calibration procedure** against a real trading-lab to confirm `winRate` units and per-`taskType` terminal event types. It is an investigation task: the file ships with provisional defaults so M2/M3 are unblocked; the procedure confirms or corrects them.

**Files:**
- Create: `apps/server/src/connector/tradinglab/terminalTaxonomy.ts`
- Create: `apps/server/src/connector/tradinglab/terminalTaxonomy.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { successTypesFor, isFailureType } from './terminalTaxonomy';

describe('terminal taxonomy', () => {
  it('returns success types by task prefix (empty for unknown → degrade)', () => {
    expect(successTypesFor('research.run_cycle')).toContain('research.run_cycle.completed');
    expect(successTypesFor('strategy.onboard')).toContain('strategy_analyst.completed');
    expect(successTypesFor('totally.unknown')).toEqual([]);
  });
  it('detects failure by suffix + plan-advance-failed', () => {
    expect(isFailureType('builder.failed')).toBe(true);
    expect(isFailureType('strategy.onboard.rejected')).toBe(true);
    expect(isFailureType('something.error')).toBe(true);
    expect(isFailureType('chat.plan.advance_failed')).toBe(true);
    expect(isFailureType('research.run_cycle.completed')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npm test -w @trading-office/server -- terminalTaxonomy`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `terminalTaxonomy.ts`**

```ts
// taskType-prefix → confirmed task-completion event `type`s.
// PROVISIONAL until confirmed by the calibration procedure below. An EMPTY successTypes for a
// matched prefix means "terminal not confirmed" → the ConversationFollower (M3) degrades honestly
// (streams correlated deltas, finalizes via guard with "terminal status could not be confirmed").
export interface TerminalRule {
  prefixes: string[];
  successTypes: string[];
}

export const TERMINAL_TAXONOMY: TerminalRule[] = [
  { prefixes: ['strategy.onboard', 'strategy.analyze_source'], successTypes: ['strategy_analyst.completed'] },
  { prefixes: ['research.run_cycle'], successTypes: ['research.run_cycle.completed'] },
  { prefixes: ['hypothesis.build'], successTypes: ['evaluation.completed'] },
];

export const FAILURE_SUFFIXES = ['failed', 'rejected', 'error'];
export const PLAN_ADVANCE_FAILED = 'chat.plan.advance_failed';

export function successTypesFor(taskType: string): string[] {
  return TERMINAL_TAXONOMY.find((r) => r.prefixes.some((p) => taskType.startsWith(p)))?.successTypes ?? [];
}
export function isFailureType(type: string): boolean {
  if (type === PLAN_ADVANCE_FAILED) return true;
  const suffix = type.split(/[._]/).pop() ?? '';
  return FAILURE_SUFFIXES.includes(suffix);
}
```

- [ ] **Step 4: Run it; verify pass**

Run: `npm test -w @trading-office/server -- terminalTaxonomy`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the calibration procedure against a real trading-lab**

Prereq: a trading-lab checkout running locally with the Read API + chat ingress up and `TRADING_LAB_READ_TOKEN` / `TRADING_LAB_CHAT_TOKEN` set (see `trading-lab/src/read-api/README.md`).

1. Confirm the `winRate` unit: fetch a completed backtest —
   `curl -s -H "Authorization: Bearer $TRADING_LAB_READ_TOKEN" http://localhost:3100/v1/backtests | jq '.data[0].metrics.winRate'`
   If the value is ≤ 1 it is a fraction (keep `× 100` in `mappers.ts`); if it is already 0..100, **remove the `× 100`** in `mapBacktest` and update the mapper test.
2. Drive a chat task and capture its events —
   `curl -s -XPOST -H "Authorization: Bearer $TRADING_LAB_CHAT_TOKEN" -H 'content-type: application/json' -d '{"message":"research BTC funding reversion"}' http://localhost:3000/chat/messages` → note `taskId`.
   `curl -s -H "Authorization: Bearer $TRADING_LAB_READ_TOKEN" "http://localhost:3100/v1/agent-events?taskId=<taskId>" | jq '.data[] | {type, correlationId, taskId}'`
3. From the captured event `type`s, identify the **final** event that marks the *task* done for each supported `taskType` (distinct from mid-workflow `*.completed`). Cross-check against `trading-lab/src/read-api/agent-taxonomy.ts` (`lifecycleForType`) + the orchestrator/worker handlers.
4. **Record findings:** edit `TERMINAL_TAXONOMY.successTypes` to the confirmed event `type`(s) per prefix. If a task type's terminal cannot be confirmed, set its `successTypes: []` (the follower will degrade honestly for that type — do NOT guess).
5. Re-run `npm test -w @trading-office/server -- terminalTaxonomy mappers` and adjust expectations to the confirmed values.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/connector/tradinglab/terminalTaxonomy.ts apps/server/src/connector/tradinglab/terminalTaxonomy.test.ts apps/server/src/connector/tradinglab/mappers.ts apps/server/src/connector/tradinglab/mappers.test.ts
git commit -m "feat(server): terminal taxonomy + calibration #1 (winRate unit, terminal types)"
```

**M1 done** — `npm run typecheck && npm test --workspaces && npm run build` all green; `OFFICE_CONNECTOR_MODE=trading-lab` reads come from the real Read API; knowledge/bot-health are honest gaps; infra reflects office + lab health.

---

## Milestone M2 — SSE → office WS bridge

After M2: one long-lived upstream `/v1/stream` connection maps trading-lab events to office WS events on the live floor, resumes via `Last-Event-ID`, degrades visibly (HTTP reads keep working), and exposes an appended-event subscription that M3's followers will filter by `correlationId`.

### Task M2.1 — Incremental `text/event-stream` parser

**Files:**
- Create: `apps/server/src/connector/tradinglab/sseParse.ts`
- Create: `apps/server/src/connector/tradinglab/sseParse.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { createSseParser } from './sseParse';

describe('createSseParser', () => {
  it('parses a complete frame', () => {
    const p = createSseParser();
    expect(p.push('event: agent_status_changed\ndata: {"a":1}\n\n')).toEqual([
      { event: 'agent_status_changed', data: '{"a":1}', id: undefined },
    ]);
  });
  it('reassembles a frame split across chunks', () => {
    const p = createSseParser();
    expect(p.push('event: x\nda')).toEqual([]);
    expect(p.push('ta: hi\n\n')).toEqual([{ event: 'x', data: 'hi', id: undefined }]);
  });
  it('ignores comment heartbeats and captures id', () => {
    const p = createSseParser();
    expect(p.push(': ping\n\n')).toEqual([]);
    expect(p.push('id: c1\nevent: agent_event_appended\ndata: {}\n\n')).toEqual([
      { event: 'agent_event_appended', data: '{}', id: 'c1' },
    ]);
  });
  it('joins multiple data lines with newline and tolerates CRLF', () => {
    const p = createSseParser();
    expect(p.push('data: a\r\ndata: b\r\n\r\n')).toEqual([{ event: undefined, data: 'a\nb', id: undefined }]);
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npm test -w @trading-office/server -- sseParse`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `sseParse.ts`**

```ts
export interface SseFrame {
  event?: string;
  data: string;
  id?: string;
}

interface Pending {
  event?: string;
  data: string[];
  id?: string;
}

export function createSseParser(): { push(chunk: string): SseFrame[] } {
  let buf = '';
  let cur: Pending = { data: [] };

  const dispatch = (sink: SseFrame[]): void => {
    const hasContent = cur.event !== undefined || cur.id !== undefined || cur.data.length > 0;
    if (!hasContent) return;
    sink.push({ event: cur.event, data: cur.data.join('\n'), id: cur.id });
    cur = { data: [] };
  };

  const handleLine = (line: string, sink: SseFrame[]): void => {
    if (line === '') { dispatch(sink); return; }
    if (line.startsWith(':')) return; // comment / heartbeat
    const idx = line.indexOf(':');
    const field = idx === -1 ? line : line.slice(0, idx);
    let value = idx === -1 ? '' : line.slice(idx + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') cur.event = value;
    else if (field === 'data') cur.data.push(value);
    else if (field === 'id') cur.id = value;
  };

  return {
    push(chunk: string): SseFrame[] {
      const frames: SseFrame[] = [];
      buf += chunk;
      let nl: number;
      while ((nl = buf.indexOf('\n')) !== -1) {
        let line = buf.slice(0, nl);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        buf = buf.slice(nl + 1);
        handleLine(line, frames);
      }
      return frames;
    },
  };
}
```

- [ ] **Step 4: Run tests; verify pass**

Run: `npm test -w @trading-office/server -- sseParse`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/connector/tradinglab/sseParse.ts apps/server/src/connector/tradinglab/sseParse.test.ts
git commit -m "feat(server): incremental SSE parser"
```

### Task M2.2 — `TradingLabStreamBridge` (one connection, resume, degrade, fan-out)

**Files:**
- Create: `apps/server/src/connector/tradinglab/TradingLabStreamBridge.ts`
- Create: `apps/server/src/connector/tradinglab/TradingLabStreamBridge.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { TradingLabStreamBridge, type SseConnect, type SseConnection } from './TradingLabStreamBridge';
import type { OfficeEvent } from '@trading-office/office-gateway';

const NOW = () => '2026-06-14T00:00:00.000Z';
const framesOf = (arr: unknown[]): SseConnection => ({
  frames: (async function* () { for (const f of arr) yield f as never; })(),
  close: () => {},
});
const parkUntilAbort = (signal: AbortSignal): SseConnection => ({
  frames: (async function* () { await new Promise<void>((res) => signal.addEventListener('abort', () => res())); })(),
  close: () => {},
});

describe('TradingLabStreamBridge', () => {
  it('maps frames to office events, tracks resume id, notices degrade, re-snapshots', async () => {
    const emitted: OfficeEvent[] = [];
    const seen: Array<Record<string, string>> = [];
    const connect: SseConnect = async ({ headers, signal }) => {
      seen.push(headers);
      if (seen.length === 1) {
        return framesOf([
          { event: 'agent_status_changed', data: JSON.stringify({ agentId: 'builder', status: 'working', currentTaskId: 't', ts: 'x' }) },
          { event: 'agent_event_appended', id: 'c1', data: JSON.stringify({ agentId: 'researcher', event: { id: 'e1', ts: 'x', type: 'research.run_cycle.started', taskId: 't', level: 'info', summary: 'Research Run Cycle Started' } }) },
        ]);
      }
      return parkUntilAbort(signal);
    };
    const bridge = new TradingLabStreamBridge({
      url: 'http://lab:3100', readToken: 't', reconnectBaseMs: 1, reconnectMaxMs: 1,
      onSnapshot: async () => ({}), connect, now: NOW, sleep: async () => {},
    });
    const appended: string[] = [];
    bridge.subscribeAppended((e) => appended.push(e.type));
    const stop = bridge.start((e) => emitted.push(e));
    await new Promise((r) => setTimeout(r, 10));
    stop();

    expect(emitted).toContainEqual({ type: 'agent_status_changed', ts: NOW(), agentId: 'builder', status: 'running' });
    expect(emitted).toContainEqual({ type: 'agent_trace_appended', ts: NOW(), agentId: 'researcher', line: { ts: 'x', level: 'info', text: 'Research Run Cycle Started' } });
    expect(appended).toEqual(['research.run_cycle.started']);
    expect(seen[0]['Last-Event-ID']).toBeUndefined();
    expect(seen[1]['Last-Event-ID']).toBe('c1');                       // resume cursor
    expect(emitted.some((e) => e.type === 'system_notice' && e.level === 'warn')).toBe(true);
    expect(emitted.some((e) => e.type === 'agent_statuses_snapshot')).toBe(true); // re-sync on reconnect
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npm test -w @trading-office/server -- TradingLabStreamBridge`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `TradingLabStreamBridge.ts`**

```ts
import type { OfficeEvent, AgentStatusMap } from '@trading-office/office-gateway';
import type { LabAgentEvent, LabAgentId, LabLifecycle } from './labDtos';
import { createSseParser, type SseFrame } from './sseParse';
import { mapAgentId, mapAgentStatus } from './mappers';

export interface SseConnection {
  frames: AsyncIterable<SseFrame>;
  close(): void;
}
export interface SseConnectOpts {
  url: string;
  headers: Record<string, string>;
  signal: AbortSignal;
}
export type SseConnect = (opts: SseConnectOpts) => Promise<SseConnection>;

export type StreamState = 'live' | 'degraded' | 'error';

export interface StreamBridgeDeps {
  url: string;
  readToken: string;
  reconnectBaseMs: number;
  reconnectMaxMs: number;
  onSnapshot: () => Promise<AgentStatusMap>;
  connect?: SseConnect;
  now?: () => string;
  sleep?: (ms: number) => Promise<void>;
}

const safeJson = (s: string): unknown => { try { return JSON.parse(s); } catch { return null; } };

const defaultSseConnect: SseConnect = async ({ url, headers, signal }) => {
  const res = await fetch(url, { headers, signal });
  if (!res.ok || !res.body) throw new Error(`stream connect failed: ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();
  async function* gen(): AsyncGenerator<SseFrame> {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      for (const f of parser.push(decoder.decode(value, { stream: true }))) yield f;
    }
  }
  return { frames: gen(), close: () => { void reader.cancel(); } };
};

export class TradingLabStreamBridge {
  private stopped = false;
  private ctrl: AbortController | null = null;
  private lastEventId: string | undefined;
  private _state: StreamState = 'error';
  private noticed = false;
  private readonly subs = new Set<(e: LabAgentEvent) => void>();
  private readonly now: () => string;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly connect: SseConnect;

  constructor(private readonly deps: StreamBridgeDeps) {
    this.now = deps.now ?? (() => new Date().toISOString());
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.connect = deps.connect ?? defaultSseConnect;
  }

  state(): StreamState { return this._state; }

  subscribeAppended(cb: (e: LabAgentEvent) => void): () => void {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }

  start(emit: (e: OfficeEvent) => void): () => void {
    this.stopped = false;
    void this.loop(emit);
    return () => { this.stopped = true; this.ctrl?.abort(); };
  }

  private async loop(emit: (e: OfficeEvent) => void): Promise<void> {
    let backoff = this.deps.reconnectBaseMs;
    let firstConnect = true;
    while (!this.stopped) {
      this.ctrl = new AbortController();
      try {
        const conn = await this.connect({
          url: `${this.deps.url}/v1/stream`,
          headers: {
            Authorization: `Bearer ${this.deps.readToken}`,
            accept: 'text/event-stream',
            ...(this.lastEventId ? { 'Last-Event-ID': this.lastEventId } : {}),
          },
          signal: this.ctrl.signal,
        });
        this._state = 'live';
        this.noticed = false;
        backoff = this.deps.reconnectBaseMs;
        if (!firstConnect) {
          emit({ type: 'agent_statuses_snapshot', ts: this.now(), statuses: await this.deps.onSnapshot() });
        }
        firstConnect = false;
        for await (const frame of conn.frames) {
          if (this.stopped) break;
          this.handleFrame(frame, emit);
        }
        conn.close();
      } catch {
        /* fall through to degrade + backoff */
      }
      if (this.stopped) break;
      this._state = this._state === 'live' ? 'degraded' : 'error';
      if (!this.noticed) {
        this.noticed = true;
        emit({ type: 'system_notice', ts: this.now(), level: 'warn', text: 'live stream degraded — reconnecting' });
      }
      await this.sleep(backoff);
      backoff = Math.min(backoff * 2, this.deps.reconnectMaxMs);
    }
  }

  private handleFrame(frame: SseFrame, emit: (e: OfficeEvent) => void): void {
    if (frame.event === 'agent_status_changed') {
      const d = safeJson(frame.data) as { agentId?: LabAgentId; status?: LabLifecycle } | null;
      if (!d?.agentId || !d.status) return;
      emit({ type: 'agent_status_changed', ts: this.now(), agentId: mapAgentId(d.agentId), status: mapAgentStatus(d.agentId, d.status) });
    } else if (frame.event === 'agent_event_appended') {
      if (frame.id) this.lastEventId = frame.id;
      const d = safeJson(frame.data) as { agentId?: LabAgentId; event?: LabAgentEvent } | null;
      if (!d?.agentId || !d.event) return;
      emit({ type: 'agent_trace_appended', ts: this.now(), agentId: mapAgentId(d.agentId), line: { ts: d.event.ts, level: d.event.level, text: d.event.summary } });
      for (const sub of this.subs) sub(d.event);
    }
  }
}
```

- [ ] **Step 4: Run tests; verify pass**

Run: `npm test -w @trading-office/server -- TradingLabStreamBridge`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/connector/tradinglab/TradingLabStreamBridge.ts apps/server/src/connector/tradinglab/TradingLabStreamBridge.test.ts
git commit -m "feat(server): trading-lab SSE bridge (resume, degrade, fan-out)"
```

### Task M2.3 — Wire the bridge into the runtime (+ stream-event → WS-event integration)

**Files:**
- Create: `apps/server/src/connector/createTradingLabWiring.ts`
- Create: `apps/server/src/connector/createTradingLabWiring.test.ts`
- Modify: `apps/server/src/connector/buildConnector.ts`
- Modify: `apps/server/src/connector/buildConnector.test.ts`

- [ ] **Step 1: Write the failing integration test** (the spec's explicit "stream event → office WS event")

```ts
import { describe, it, expect } from 'vitest';
import { createTradingLabWiring } from './createTradingLabWiring';
import { loadConfig } from '../config';
import type { SseConnect, SseConnection } from './tradinglab/TradingLabStreamBridge';
import type { OfficeEvent } from '@trading-office/office-gateway';

const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });

describe('createTradingLabWiring', () => {
  it('turns a trading-lab stream event into an office WS event', async () => {
    const config = loadConfig({ OFFICE_CONNECTOR_MODE: 'trading-lab', TRADING_LAB_READ_URL: 'http://lab:3100', TRADING_LAB_READ_TOKEN: 't' });
    const fetchImpl = (async () => json({ status: 'ok', checks: { db: true } })) as unknown as typeof fetch;
    const connect: SseConnect = async ({ signal }): Promise<SseConnection> => ({
      frames: (async function* () {
        yield { event: 'agent_status_changed', data: JSON.stringify({ agentId: 'critic', status: 'working', currentTaskId: null, ts: 'x' }) } as never;
        await new Promise<void>((res) => signal.addEventListener('abort', () => res()));
      })(),
      close: () => {},
    });
    const wiring = createTradingLabWiring(config, { fetchImpl, connect, now: () => 'T' });
    const out: OfficeEvent[] = [];
    const stop = wiring.connector.start((e) => out.push(e));
    await new Promise((r) => setTimeout(r, 10));
    stop();
    expect(out).toContainEqual({ type: 'agent_status_changed', ts: 'T', agentId: 'critic', status: 'reviewing' });
    expect(wiring.bridge.state()).toBe('live');
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npm test -w @trading-office/server -- createTradingLabWiring`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `createTradingLabWiring.ts`**

```ts
import type { OfficeServerConfig } from '../config';
import type { OfficeReadConnector } from './OfficeReadConnector';
import type { SseConnect } from './tradinglab/TradingLabStreamBridge';
import { TradingLabHttpClient } from './tradinglab/TradingLabHttpClient';
import { TradingLabReadConnector } from './tradinglab/TradingLabReadConnector';
import { TradingLabStreamBridge } from './tradinglab/TradingLabStreamBridge';
import { InfraAggregator } from './InfraAggregator';
import { CompositeOfficeReadConnector } from './CompositeOfficeReadConnector';

export interface TradingLabWiringDeps {
  fetchImpl?: typeof fetch;
  connect?: SseConnect;
  now?: () => string;
  sleep?: (ms: number) => Promise<void>;
}

export interface TradingLabWiring {
  connector: OfficeReadConnector;
  bridge: TradingLabStreamBridge;
  client: TradingLabHttpClient;
}

export function createTradingLabWiring(config: OfficeServerConfig, deps: TradingLabWiringDeps = {}): TradingLabWiring {
  const client = new TradingLabHttpClient({
    readUrl: config.tradingLab.readUrl,
    readToken: config.tradingLab.readToken,
    requestTimeoutMs: config.tradingLab.requestTimeoutMs,
    fetchImpl: deps.fetchImpl,
  });
  const read = new TradingLabReadConnector(client);
  const bridge = new TradingLabStreamBridge({
    url: config.tradingLab.readUrl,
    readToken: config.tradingLab.readToken,
    reconnectBaseMs: config.stream.reconnectBaseMs,
    reconnectMaxMs: config.stream.reconnectMaxMs,
    onSnapshot: () => read.getAgentStatuses(),
    connect: deps.connect,
    now: deps.now,
    sleep: deps.sleep,
  });
  const infra = new InfraAggregator(client, () => bridge.state(), deps.now);
  const connector = new CompositeOfficeReadConnector({ read, infra, startBridge: (emit) => bridge.start(emit) });
  return { connector, bridge, client };
}
```

- [ ] **Step 4: Refactor `buildConnector.ts` to delegate** (keep its `OfficeReadConnector` return for fixture mode + the M1 test)

```ts
import type { OfficeServerConfig } from '../config';
import type { OfficeReadConnector } from './OfficeReadConnector';
import { FixtureOfficeReadConnector } from './FixtureOfficeReadConnector';
import { createTradingLabWiring, type TradingLabWiringDeps } from './createTradingLabWiring';

export function buildConnector(config: OfficeServerConfig, deps: TradingLabWiringDeps = {}): OfficeReadConnector {
  if (config.connectorMode === 'fixture') return new FixtureOfficeReadConnector(config);
  return createTradingLabWiring(config, deps).connector;
}
```

The M1 `buildConnector.test.ts` still passes unchanged (it asserts `.getKnowledge()` on the returned connector). No edit needed unless the import path moved.

- [ ] **Step 5: Run tests; verify pass**

Run: `npm test -w @trading-office/server -- createTradingLabWiring buildConnector`
Expected: PASS.

- [ ] **Step 6: Point `index.ts` at the wiring (so M3 can reuse bridge + client)**

In `apps/server/src/index.ts`, in trading-lab mode build the wiring once and keep the handles for M3:

```ts
import { createTradingLabWiring } from './connector/createTradingLabWiring';
import { FixtureOfficeReadConnector } from './connector/FixtureOfficeReadConnector';

const config = loadConfig();
const bus = new OfficeEventBus();
const wiring = config.connectorMode === 'trading-lab' ? createTradingLabWiring(config) : null;
const connector = wiring ? wiring.connector : new FixtureOfficeReadConnector(config);
const stopConnector = connector.start((e) => bus.publish(e));
// ...heartbeat, createOfficeApp({ connector, bus, config }), serve, injectWebSocket (unchanged)...
// (M3 will pass an operator responder built from `wiring.client` + `wiring.bridge`.)
```

Keep `buildConnector` for callers/tests that only need the connector; `index.ts` uses `createTradingLabWiring` directly.

- [ ] **Step 7: Typecheck + full server suite + build**

Run: `npm run typecheck && npm test -w @trading-office/server && npm run build`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/connector/createTradingLabWiring.ts apps/server/src/connector/createTradingLabWiring.test.ts apps/server/src/connector/buildConnector.ts apps/server/src/index.ts
git commit -m "feat(server): wire SSE bridge into runtime (stream event → office WS)"
```

**M2 done** — live floor in trading-lab mode reflects real agent status/trace; stream resumes + degrades honestly; the bridge exposes `subscribeAppended` for M3.

---

## Milestone M3 — operator chat: follow downstream (RISK-HEAVY)

After M3: an operator message calls the real chat ingress; the synchronous `ChatResponse` maps to the office lifecycle; for an actionable task the office follows real downstream progress by tailing the SSE stream **filtered by an explicitly-obtained `correlationId`**, with terminal detection from correlated events only and an honest fallback when correlation/terminal cannot be confirmed.

> **Degradation gate:** if the M1 calibration left a task type's `successTypes: []` (terminal unconfirmed), the follower below already degrades honestly for it (streams correlated deltas, finalizes via guard with "live progress stream ended") — no code change needed, that is the designed behavior.

### Task M3.1 — Agent-event noise filter

**Files:**
- Create: `apps/server/src/operator/summaryFilter.ts`
- Create: `apps/server/src/operator/summaryFilter.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { isNoiseEventType } from './summaryFilter';

describe('isNoiseEventType', () => {
  it('flags orchestration/meta + dedupe/reuse plumbing as noise', () => {
    expect(isNoiseEventType('chat.intent_classifier.started')).toBe(true);
    expect(isNoiseEventType('chat.task_created')).toBe(true);
    expect(isNoiseEventType('chat.plan.advanced')).toBe(true);
    expect(isNoiseEventType('hypothesis.deduped')).toBe(true);
    expect(isNoiseEventType('backtest.reused')).toBe(true);
    expect(isNoiseEventType('artifact.stored')).toBe(true);
  });
  it('passes real progress events through', () => {
    expect(isNoiseEventType('research.run_cycle.started')).toBe(false);
    expect(isNoiseEventType('strategy_analyst.completed')).toBe(false);
    expect(isNoiseEventType('hypothesis.validated')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npm test -w @trading-office/server -- summaryFilter`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `summaryFilter.ts`**

```ts
// Filters internal/plumbing agent-event types out of the operator chat delta stream.
// NOTE: terminal/failure detection is done BEFORE this filter (see ConversationFollower),
// so e.g. `chat.plan.advance_failed` is still handled as a failure even though it is "noise" here.
const NOISE_PREFIXES = ['chat.intent_', 'chat.task_created', 'chat.plan.'];
const NOISE_SUFFIXES = ['deduped', 'reused', 'stored', 'skipped'];

export function isNoiseEventType(type: string): boolean {
  if (NOISE_PREFIXES.some((p) => type.startsWith(p))) return true;
  const suffix = type.split(/[._]/).pop() ?? '';
  return NOISE_SUFFIXES.includes(suffix);
}
```

- [ ] **Step 4: Run tests; verify pass**

Run: `npm test -w @trading-office/server -- summaryFilter`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/operator/summaryFilter.ts apps/server/src/operator/summaryFilter.test.ts
git commit -m "feat(server): operator-chat agent-event noise filter"
```

### Task M3.2 — `TradingLabChatConnector` (POST /chat/messages, Bearer chat token)

**Files:**
- Create: `apps/server/src/operator/TradingLabChatConnector.ts`
- Create: `apps/server/src/operator/TradingLabChatConnector.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { TradingLabChatConnector } from './TradingLabChatConnector';

const cfg = { chatUrl: 'http://lab:3000', chatToken: 'ct', requestTimeoutMs: 1000 };

describe('TradingLabChatConnector', () => {
  it('POSTs /chat/messages with Bearer chat token + body, returns ChatResponse', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ kind: 'task_created', sessionId: 's', taskId: 't1', taskType: 'research.run_cycle', status: 'queued' }), { status: 200 }));
    const c = new TradingLabChatConnector({ ...cfg, fetchImpl });
    const r = await c.send({ message: 'hi', sessionId: 's' });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe('http://lab:3000/chat/messages');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer ct');
    expect(JSON.parse(init.body as string)).toEqual({ message: 'hi', sessionId: 's', channel: 'web' });
    expect(r).toMatchObject({ kind: 'task_created', taskId: 't1' });
  });

  it('maps 503 (chat not configured) to upstream_unavailable', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 503 }));
    const c = new TradingLabChatConnector({ ...cfg, fetchImpl });
    await expect(c.send({ message: 'x', sessionId: 's' })).rejects.toMatchObject({ office: { code: 'upstream_unavailable' } });
  });

  it('maps 401 to upstream_unauthorized', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 401 }));
    const c = new TradingLabChatConnector({ ...cfg, fetchImpl });
    await expect(c.send({ message: 'x', sessionId: 's' })).rejects.toMatchObject({ office: { code: 'upstream_unauthorized' } });
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npm test -w @trading-office/server -- TradingLabChatConnector`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `TradingLabChatConnector.ts`**

```ts
import type { LabChatResponse } from '../connector/tradinglab/labDtos';

export interface ChatUpstreamError extends Error {
  office: { code: 'upstream_unavailable' | 'upstream_unauthorized' | 'upstream_bad_request'; message: string };
}
const makeErr = (code: ChatUpstreamError['office']['code'], message: string): ChatUpstreamError =>
  Object.assign(new Error(message), { office: { code, message } }) as ChatUpstreamError;

export interface ChatConnectorDeps {
  chatUrl: string;
  chatToken: string;
  requestTimeoutMs: number;
  fetchImpl?: typeof fetch;
}
export interface ChatSendInput {
  message: string;
  sessionId: string;
  channel?: 'web' | 'telegram';
}

export class TradingLabChatConnector {
  private readonly fetchImpl: typeof fetch;
  constructor(private readonly deps: ChatConnectorDeps) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
  }

  async send(input: ChatSendInput): Promise<LabChatResponse> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.deps.requestTimeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.deps.chatUrl}/chat/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${this.deps.chatToken}` },
        body: JSON.stringify({ message: input.message, sessionId: input.sessionId, channel: input.channel ?? 'web' }),
        signal: ctrl.signal,
      });
    } catch (e) {
      throw makeErr('upstream_unavailable', `chat ingress request failed: ${(e as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401 || res.status === 403) throw makeErr('upstream_unauthorized', `chat ingress returned ${res.status}`);
    if (res.status === 503) throw makeErr('upstream_unavailable', 'chat ingress not configured');
    if (res.status >= 500) throw makeErr('upstream_unavailable', `chat ingress returned ${res.status}`);
    if (res.status >= 400) throw makeErr('upstream_bad_request', `chat ingress returned ${res.status}`);
    return (await res.json()) as LabChatResponse;
  }
}
```

- [ ] **Step 4: Run tests; verify pass**

Run: `npm test -w @trading-office/server -- TradingLabChatConnector`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/operator/TradingLabChatConnector.ts apps/server/src/operator/TradingLabChatConnector.test.ts
git commit -m "feat(server): trading-lab chat ingress connector"
```

### Task M3.3 — `ConversationFollower` (correlation bootstrap, correlated-only terminal, guards)

**Files:**
- Create: `apps/server/src/operator/ConversationFollower.ts`
- Create: `apps/server/src/operator/ConversationFollower.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { ConversationFollower } from './ConversationFollower';
import type { LabAgentEvent } from '../connector/tradinglab/labDtos';
import type { OfficeEvent } from '@trading-office/office-gateway';

const ids = { operatorMessageId: 'm1', conversationId: 'c1', replyMessageId: 'r1' };
const guards = { maxMs: 99999, idleMs: 99999, maxDeltas: 100, bootstrapRetries: 3, bootstrapIntervalMs: 0 };
const NOW = () => 'T';
const noSchedule = (_ms: number, _cb: () => void) => () => {};
const ev = (over: Partial<LabAgentEvent>): LabAgentEvent => ({ id: 'e', ts: 'x', type: 't', taskId: 't1', level: 'info', summary: 's', ...over });

function fakeBridge() {
  let cb: ((e: LabAgentEvent) => void) | null = null;
  return { subscribeAppended: (fn: (e: LabAgentEvent) => void) => { cb = fn; return () => { cb = null; }; }, push: (e: LabAgentEvent) => cb?.(e) };
}
const clientWith = (data: LabAgentEvent[]) => ({ getAgentEvents: vi.fn(async () => ({ data, page: { nextCursor: null, limit: 20 } })) });
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('ConversationFollower', () => {
  it('bootstraps correlationId then completes on a correlated success-terminal', async () => {
    const bridge = fakeBridge();
    const out: OfficeEvent[] = [];
    const f = new ConversationFollower({
      ids, taskId: 't1', taskType: 'research.run_cycle', emit: (e) => out.push(e),
      client: clientWith([ev({ type: 'research.run_cycle.started', correlationId: 'corr1' })]) as never,
      bridge: bridge as never, guards, now: NOW, sleep: async () => {}, schedule: noSchedule,
    });
    const p = f.run();
    await tick();
    bridge.push(ev({ type: 'research.run_cycle.completed', correlationId: 'corr1', summary: 'Research Run Cycle Completed' }));
    await p;
    expect(out.map((e) => e.type)).toContain('operator_message_completed');
    expect(out.some((e) => e.type === 'operator_message_failed')).toBe(false);
  });

  it('fails on a correlated failure event but IGNORES an uncorrelated failure', async () => {
    const bridge = fakeBridge();
    const out: OfficeEvent[] = [];
    const f = new ConversationFollower({
      ids, taskId: 't1', taskType: 'research.run_cycle', emit: (e) => out.push(e),
      client: clientWith([ev({ type: 'research.run_cycle.started', correlationId: 'corr1' })]) as never,
      bridge: bridge as never, guards, now: NOW, sleep: async () => {}, schedule: noSchedule,
    });
    const p = f.run();
    await tick();
    bridge.push(ev({ type: 'builder.failed', correlationId: 'OTHER', summary: 'someone else' })); // ignored
    bridge.push(ev({ type: 'builder.failed', correlationId: 'corr1', summary: 'Builder Failed' }));  // terminal
    await p;
    const failed = out.find((e) => e.type === 'operator_message_failed') as Extract<OfficeEvent, { type: 'operator_message_failed' }>;
    expect(failed).toBeTruthy();
    expect(failed.error.message).toBe('Builder Failed');
  });

  it('streams correlated non-noise summaries as deltas; filters noise', async () => {
    const bridge = fakeBridge();
    const out: OfficeEvent[] = [];
    const f = new ConversationFollower({
      ids, taskId: 't1', taskType: 'research.run_cycle', emit: (e) => out.push(e),
      client: clientWith([ev({ type: 'research.run_cycle.started', correlationId: 'corr1' })]) as never,
      bridge: bridge as never, guards, now: NOW, sleep: async () => {}, schedule: noSchedule,
    });
    const p = f.run();
    await tick();
    bridge.push(ev({ type: 'hypothesis.validated', correlationId: 'corr1', summary: 'Hypothesis Validated' }));
    bridge.push(ev({ type: 'chat.plan.advanced', correlationId: 'corr1', summary: 'noise' }));        // filtered
    bridge.push(ev({ type: 'research.run_cycle.completed', correlationId: 'corr1', summary: 'done' })); // terminal
    await p;
    const deltas = out.filter((e) => e.type === 'operator_message_delta') as Array<Extract<OfficeEvent, { type: 'operator_message_delta' }>>;
    expect(deltas.map((d) => d.textDelta)).toEqual(['Hypothesis Validated\n']);
  });

  it('no correlationId within cap → honest "live progress unavailable" completed', async () => {
    const bridge = fakeBridge();
    const out: OfficeEvent[] = [];
    const f = new ConversationFollower({
      ids, taskId: 't1', taskType: 'research.run_cycle', emit: (e) => out.push(e),
      client: clientWith([ev({ type: 'research.run_cycle.started' })]) as never, // no correlationId, ever
      bridge: bridge as never, guards, now: NOW, sleep: async () => {}, schedule: noSchedule,
    });
    await f.run();
    const completed = out.find((e) => e.type === 'operator_message_completed') as Extract<OfficeEvent, { type: 'operator_message_completed' }>;
    expect(completed.reply.text).toMatch(/Live task progress is unavailable/);
  });

  it('idle guard finalizes honestly without asserting success', async () => {
    const bridge = fakeBridge();
    const timers: Array<{ ms: number; cb: () => void }> = [];
    const schedule = (ms: number, cb: () => void) => { const t = { ms, cb }; timers.push(t); return () => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); }; };
    const out: OfficeEvent[] = [];
    const f = new ConversationFollower({
      ids, taskId: 't1', taskType: 'research.run_cycle', emit: (e) => out.push(e),
      client: clientWith([ev({ type: 'research.run_cycle.started', correlationId: 'corr1' })]) as never,
      bridge: bridge as never, guards: { ...guards, idleMs: 10 }, now: NOW, sleep: async () => {}, schedule,
    });
    const p = f.run();
    await tick();
    timers.find((t) => t.ms === 10)!.cb(); // fire idle guard
    await p;
    const completed = out.find((e) => e.type === 'operator_message_completed') as Extract<OfficeEvent, { type: 'operator_message_completed' }>;
    expect(completed.reply.text).toMatch(/live progress stream ended/);
    expect(out.some((e) => e.type === 'operator_message_failed')).toBe(false);
  });

  it('with a planned chain (expectChain), does NOT complete on the first task terminal — finishes via guard', async () => {
    const bridge = fakeBridge();
    const timers: Array<{ ms: number; cb: () => void }> = [];
    const schedule = (ms: number, cb: () => void) => { const t = { ms, cb }; timers.push(t); return () => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); }; };
    const out: OfficeEvent[] = [];
    const f = new ConversationFollower({
      ids, taskId: 't1', taskType: 'strategy.onboard', expectChain: true, emit: (e) => out.push(e),
      client: clientWith([ev({ type: 'strategy_analyst.started', correlationId: 'corr1' })]) as never,
      bridge: bridge as never, guards: { ...guards, idleMs: 10 }, now: NOW, sleep: async () => {}, schedule,
    });
    const p = f.run();
    await tick();
    bridge.push(ev({ type: 'strategy_analyst.completed', correlationId: 'corr1', summary: 'Strategy Analyst Completed' })); // first task terminal
    expect(out.some((e) => e.type === 'operator_message_completed')).toBe(false); // chain pending → not done
    timers.find((t) => t.ms === 10)!.cb(); // chained task goes quiet → idle guard finalizes honestly
    await p;
    const completed = out.find((e) => e.type === 'operator_message_completed') as Extract<OfficeEvent, { type: 'operator_message_completed' }>;
    expect(completed.reply.text).toMatch(/live progress stream ended/);
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npm test -w @trading-office/server -- ConversationFollower`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `ConversationFollower.ts`**

```ts
import type { OfficeEvent, OperatorReply } from '@trading-office/office-gateway';
import type { LabAgentEvent } from '../connector/tradinglab/labDtos';
import type { TradingLabHttpClient } from '../connector/tradinglab/TradingLabHttpClient';
import type { TradingLabStreamBridge } from '../connector/tradinglab/TradingLabStreamBridge';
import { successTypesFor, isFailureType } from '../connector/tradinglab/terminalTaxonomy';
import { isNoiseEventType } from './summaryFilter';

export interface FollowerIds { operatorMessageId: string; conversationId: string; replyMessageId: string }
export interface FollowerGuards {
  maxMs: number;
  idleMs: number;
  maxDeltas: number;
  bootstrapRetries: number;
  bootstrapIntervalMs: number;
}
export interface ConversationFollowerDeps {
  ids: FollowerIds;
  taskId: string;
  taskType?: string;
  /** True when the chat response carried plannedNextStep: a chain is expected, so the first task's
   *  success-terminal is NOT the plan's terminal — keep streaming and finish honestly via guard. */
  expectChain?: boolean;
  emit: (e: OfficeEvent) => void;
  client: Pick<TradingLabHttpClient, 'getAgentEvents'>;
  bridge: Pick<TradingLabStreamBridge, 'subscribeAppended'>;
  guards: FollowerGuards;
  now?: () => string;
  sleep?: (ms: number) => Promise<void>;
  schedule?: (ms: number, cb: () => void) => () => void;
}

export class ConversationFollower {
  private readonly now: () => string;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly schedule: (ms: number, cb: () => void) => () => void;
  private done = false;
  private deltaCount = 0;
  private readonly accumulated: string[] = [];

  constructor(private readonly deps: ConversationFollowerDeps) {
    this.now = deps.now ?? (() => new Date().toISOString());
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.schedule = deps.schedule ?? ((ms, cb) => { const h = setTimeout(cb, ms); return () => clearTimeout(h); });
  }

  async run(): Promise<void> {
    const correlationId = await this.bootstrap();
    if (this.done) return;
    if (!correlationId) {
      this.finishCompleted('Live task progress is unavailable.');
      return;
    }
    await this.follow(correlationId);
  }

  private async bootstrap(): Promise<string | undefined> {
    for (let i = 0; i < this.deps.guards.bootstrapRetries && !this.done; i++) {
      try {
        const { data } = await this.deps.client.getAgentEvents({ taskId: this.deps.taskId });
        const hit = data.find((e) => e.correlationId);
        if (hit?.correlationId) return hit.correlationId;
      } catch {
        /* retry */
      }
      await this.sleep(this.deps.guards.bootstrapIntervalMs);
    }
    return undefined;
  }

  private follow(correlationId: string): Promise<void> {
    return new Promise<void>((resolve) => {
      let unsub: () => void = () => {};
      let cancelIdle: () => void = () => {};
      const finish = (fn: () => void): void => {
        if (this.done) return;
        fn();
        cancelMax();
        cancelIdle();
        unsub();
        resolve();
      };
      const resetIdle = (): void => {
        cancelIdle();
        cancelIdle = this.schedule(this.deps.guards.idleMs, () => finish(() => this.finishCompleted('live progress stream ended')));
      };
      const cancelMax = this.schedule(this.deps.guards.maxMs, () => finish(() => this.finishCompleted('live progress stream ended')));

      unsub = this.deps.bridge.subscribeAppended((e: LabAgentEvent) => {
        if (this.done) return;
        if (e.correlationId !== correlationId) return; // explicit-field correlation ONLY
        resetIdle();
        if (isFailureType(e.type)) {
          finish(() => this.finishFailed(e.summary));
          return;
        }
        // A planned chain (expectChain) means the first task's success-terminal is NOT plan-complete;
        // keep streaming the chained task's deltas and let the guard finish honestly (we don't know the
        // chained task's terminal type, so we never assert success on its behalf).
        if (!this.deps.expectChain && this.deps.taskType && successTypesFor(this.deps.taskType).includes(e.type)) {
          finish(() => this.finishCompleted());
          return;
        }
        if (!isNoiseEventType(e.type)) {
          this.emitDelta(e.summary);
          if (this.deltaCount >= this.deps.guards.maxDeltas) {
            finish(() => this.finishCompleted('live progress stream ended'));
          }
        }
      });

      resetIdle();
    });
  }

  private emitDelta(text: string): void {
    this.accumulated.push(text);
    this.deltaCount++;
    this.deps.emit({
      type: 'operator_message_delta',
      ts: this.now(),
      operatorMessageId: this.deps.ids.operatorMessageId,
      conversationId: this.deps.ids.conversationId,
      replyMessageId: this.deps.ids.replyMessageId,
      textDelta: `${text}\n`,
    });
  }

  private finishCompleted(extra?: string): void {
    this.done = true;
    const body = this.accumulated.join('\n');
    const text = [body, extra].filter(Boolean).join(body && extra ? ' · ' : '') || 'Done.';
    const reply: OperatorReply = {
      replyMessageId: this.deps.ids.replyMessageId,
      operatorMessageId: this.deps.ids.operatorMessageId,
      conversationId: this.deps.ids.conversationId,
      text,
      ts: this.now(),
    };
    this.deps.emit({
      type: 'operator_message_completed',
      ts: this.now(),
      operatorMessageId: this.deps.ids.operatorMessageId,
      conversationId: this.deps.ids.conversationId,
      replyMessageId: this.deps.ids.replyMessageId,
      reply,
    });
  }

  private finishFailed(message: string): void {
    this.done = true;
    this.deps.emit({
      type: 'operator_message_failed',
      ts: this.now(),
      operatorMessageId: this.deps.ids.operatorMessageId,
      conversationId: this.deps.ids.conversationId,
      replyMessageId: this.deps.ids.replyMessageId,
      error: { code: 'task_failed', message },
    });
  }
}
```

- [ ] **Step 4: Run tests; verify pass**

Run: `npm test -w @trading-office/server -- ConversationFollower`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/operator/ConversationFollower.ts apps/server/src/operator/ConversationFollower.test.ts
git commit -m "feat(server): ConversationFollower (correlated-only terminal + honest guards)"
```

### Task M3.4 — `TradingLabOperatorResponder` (ChatResponse → lifecycle; starts follower)

**Files:**
- Create: `apps/server/src/operator/TradingLabOperatorResponder.ts`
- Create: `apps/server/src/operator/TradingLabOperatorResponder.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { makeTradingLabOperatorResponder } from './TradingLabOperatorResponder';
import { OfficeEventBus } from '../events/OfficeEventBus';
import type { LabChatResponse } from '../connector/tradinglab/labDtos';
import type { OfficeEvent } from '@trading-office/office-gateway';

const msg = { text: 'hi', source: 'web', target: 'orchestrator', floorId: 'f1' } as const;
const guards = { maxMs: 1, idleMs: 1, maxDeltas: 1, bootstrapRetries: 1, bootstrapIntervalMs: 0 };
const NOW = () => 'T';
const fixedIds = () => ({ operatorMessageId: 'm1', conversationId: 'c1', replyMessageId: 'r1' });
const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(resp: LabChatResponse, startFollow = vi.fn()) {
  const bus = new OfficeEventBus();
  const seen: OfficeEvent[] = [];
  bus.subscribe((e) => seen.push(e));
  const chat = { send: vi.fn(async () => resp) };
  const responder = makeTradingLabOperatorResponder({
    chat: chat as never, client: {} as never, bridge: {} as never, guards, now: NOW, newIds: fixedIds, startFollow,
  });
  return { bus, seen, chat, responder, startFollow };
}

describe('makeTradingLabOperatorResponder', () => {
  it('returns accepted synchronously and calls chat ingress with the message', async () => {
    const { responder, chat, bus } = setup({ kind: 'out_of_scope', sessionId: 'c1', message: 'nope' });
    const acc = responder(msg, bus);
    expect(acc).toEqual({ operatorMessageId: 'm1', conversationId: 'c1', status: 'accepted' });
    await flush();
    expect(chat.send).toHaveBeenCalledWith({ message: 'hi', sessionId: 'c1', channel: 'web' });
  });

  it('out_of_scope → accepted then completed (no follow)', async () => {
    const { responder, bus, seen, startFollow } = setup({ kind: 'out_of_scope', sessionId: 'c1', message: 'nope' });
    responder(msg, bus);
    await flush();
    expect(seen.map((e) => e.type)).toEqual(['operator_message_accepted', 'operator_message_completed']);
    expect(startFollow).not.toHaveBeenCalled();
  });

  it('rejected → failed; error → failed', async () => {
    const r1 = setup({ kind: 'rejected', sessionId: 'c1', reason: 'bad' });
    r1.responder(msg, r1.bus); await flush();
    expect(r1.seen.map((e) => e.type)).toEqual(['operator_message_accepted', 'operator_message_failed']);
  });

  it('task_created → accepted, progress, then starts the follower', async () => {
    const { responder, bus, seen, startFollow } = setup({ kind: 'task_created', sessionId: 'c1', taskId: 't9', taskType: 'research.run_cycle', status: 'queued' });
    responder(msg, bus);
    await flush();
    expect(seen.map((e) => e.type)).toEqual(['operator_message_accepted', 'operator_message_progress']);
    expect(startFollow).toHaveBeenCalledWith(expect.objectContaining({ taskId: 't9', taskType: 'research.run_cycle' }));
  });

  it('task_status active → progress + follow with unknown taskType', async () => {
    const { responder, bus, startFollow } = setup({ kind: 'task_status', sessionId: 'c1', taskId: 't5', status: 'running' });
    responder(msg, bus);
    await flush();
    expect(startFollow).toHaveBeenCalledWith(expect.objectContaining({ taskId: 't5', taskType: undefined }));
  });

  it('task_status completed → completed (no follow); failed → failed', async () => {
    const done = setup({ kind: 'task_status', sessionId: 'c1', taskId: 't5', status: 'completed' });
    done.responder(msg, done.bus); await flush();
    expect(done.seen.map((e) => e.type)).toEqual(['operator_message_accepted', 'operator_message_completed']);
    expect(done.startFollow).not.toHaveBeenCalled();
  });

  it('chat ingress error → failed', async () => {
    const bus = new OfficeEventBus();
    const seen: OfficeEvent[] = [];
    bus.subscribe((e) => seen.push(e));
    const chat = { send: vi.fn(async () => { throw Object.assign(new Error('down'), { office: { code: 'upstream_unavailable' } }); }) };
    const responder = makeTradingLabOperatorResponder({ chat: chat as never, client: {} as never, bridge: {} as never, guards, now: NOW, newIds: fixedIds });
    responder(msg, bus);
    await flush();
    expect(seen.map((e) => e.type)).toEqual(['operator_message_accepted', 'operator_message_failed']);
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npm test -w @trading-office/server -- TradingLabOperatorResponder`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `TradingLabOperatorResponder.ts`**

```ts
import type { OfficeEvent, OperatorMessage, OperatorMessageAccepted, OperatorReply } from '@trading-office/office-gateway';
import type { OfficeEventBus } from '../events/OfficeEventBus';
import type { ChatFollowConfig } from '../config';
import type { LabChatResponse } from '../connector/tradinglab/labDtos';
import type { TradingLabChatConnector } from './TradingLabChatConnector';
import type { TradingLabHttpClient } from '../connector/tradinglab/TradingLabHttpClient';
import type { TradingLabStreamBridge } from '../connector/tradinglab/TradingLabStreamBridge';
import { assertNoExecutionAuthority } from '../guard/noExecutionAuthority';
import { ConversationFollower, type FollowerIds } from './ConversationFollower';

export type OperatorResponder = (msg: OperatorMessage, bus: OfficeEventBus) => OperatorMessageAccepted;

export function defaultNewIds(): () => FollowerIds {
  let c = 0;
  return () => { c += 1; return { operatorMessageId: `m${c}`, conversationId: `c${c}`, replyMessageId: `r${c}` }; };
}

export interface StartFollowArgs { ids: FollowerIds; taskId: string; taskType?: string; expectChain?: boolean; emit: (e: OfficeEvent) => void }

export interface TradingLabOperatorResponderDeps {
  chat: Pick<TradingLabChatConnector, 'send'>;
  client: Pick<TradingLabHttpClient, 'getAgentEvents'>;
  bridge: Pick<TradingLabStreamBridge, 'subscribeAppended'>;
  guards: ChatFollowConfig;
  now?: () => string;
  newIds?: () => FollowerIds;
  startFollow?: (args: StartFollowArgs) => void;
}

export function makeTradingLabOperatorResponder(deps: TradingLabOperatorResponderDeps): OperatorResponder {
  const now = deps.now ?? (() => new Date().toISOString());
  const newIds = deps.newIds ?? defaultNewIds();
  const startFollow = deps.startFollow ?? ((args: StartFollowArgs) => {
    void new ConversationFollower({
      ids: args.ids, taskId: args.taskId, taskType: args.taskType, expectChain: args.expectChain, emit: args.emit,
      client: deps.client, bridge: deps.bridge, guards: deps.guards,
    }).run();
  });

  return (msg, bus) => {
    assertNoExecutionAuthority(msg);
    const ids = newIds();
    const emit = (e: OfficeEvent): void => bus.publish(e);
    emit({ type: 'operator_message_accepted', ts: now(), operatorMessageId: ids.operatorMessageId, conversationId: ids.conversationId });
    void runTurn(msg, ids, emit, deps, now, startFollow);
    return { operatorMessageId: ids.operatorMessageId, conversationId: ids.conversationId, status: 'accepted' };
  };
}

async function runTurn(
  msg: OperatorMessage,
  ids: FollowerIds,
  emit: (e: OfficeEvent) => void,
  deps: TradingLabOperatorResponderDeps,
  now: () => string,
  startFollow: (args: StartFollowArgs) => void,
): Promise<void> {
  const progress = (stage: string, note: string): void =>
    emit({ type: 'operator_message_progress', ts: now(), operatorMessageId: ids.operatorMessageId, conversationId: ids.conversationId, replyMessageId: ids.replyMessageId, stage, note });
  const completed = (text: string): void => {
    const reply: OperatorReply = { replyMessageId: ids.replyMessageId, operatorMessageId: ids.operatorMessageId, conversationId: ids.conversationId, text, ts: now() };
    emit({ type: 'operator_message_completed', ts: now(), operatorMessageId: ids.operatorMessageId, conversationId: ids.conversationId, replyMessageId: ids.replyMessageId, reply });
  };
  const failed = (code: string, message: string): void =>
    emit({ type: 'operator_message_failed', ts: now(), operatorMessageId: ids.operatorMessageId, conversationId: ids.conversationId, replyMessageId: ids.replyMessageId, error: { code, message } });

  let resp: LabChatResponse;
  try {
    resp = await deps.chat.send({ message: msg.text, sessionId: ids.conversationId, channel: 'web' });
  } catch (e) {
    const err = e as { office?: { code: string }; message?: string };
    failed(err.office?.code ?? 'chat_error', err.message ?? 'chat ingress error');
    return;
  }

  switch (resp.kind) {
    case 'needs_clarification': completed(resp.question); return;
    case 'out_of_scope': completed(resp.message); return;
    case 'help': completed(resp.supportedIntents.length ? `${resp.message} (${resp.supportedIntents.join(', ')})` : resp.message); return;
    case 'capability_not_available': completed(resp.message); return;
    case 'rejected': failed('rejected', resp.reason); return;
    case 'error': failed('error', resp.message); return;
    case 'task_created':
      progress('task_created', `${resp.taskType} · ${resp.taskId}`);
      startFollow({ ids, taskId: resp.taskId, taskType: resp.taskType, expectChain: Boolean(resp.plannedNextStep), emit });
      return;
    case 'task_status':
      if (resp.status === 'completed') { completed(`Task ${resp.taskId} completed`); return; }
      if (resp.status === 'failed' || resp.status === 'rejected') { failed('task_failed', `Task ${resp.taskId} ${resp.status}`); return; }
      progress('task_status', `status: ${resp.status}`);
      startFollow({ ids, taskId: resp.taskId, taskType: undefined, emit });
      return;
  }
}

/** Used in trading-lab mode when the chat token is unset: accept, notice, fail — never silently inert. */
export function makeChatUnavailableResponder(now: () => string = () => new Date().toISOString(), newIds = defaultNewIds()): OperatorResponder {
  return (msg, bus) => {
    assertNoExecutionAuthority(msg);
    const ids = newIds();
    bus.publish({ type: 'operator_message_accepted', ts: now(), operatorMessageId: ids.operatorMessageId, conversationId: ids.conversationId });
    bus.publish({ type: 'system_notice', ts: now(), level: 'warn', text: 'chat ingress not configured' });
    bus.publish({ type: 'operator_message_failed', ts: now(), operatorMessageId: ids.operatorMessageId, conversationId: ids.conversationId, replyMessageId: ids.replyMessageId, error: { code: 'chat_not_configured', message: 'chat ingress not configured' } });
    return { operatorMessageId: ids.operatorMessageId, conversationId: ids.conversationId, status: 'accepted' };
  };
}
```

- [ ] **Step 4: Run tests; verify pass**

Run: `npm test -w @trading-office/server -- TradingLabOperatorResponder`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/operator/TradingLabOperatorResponder.ts apps/server/src/operator/TradingLabOperatorResponder.test.ts
git commit -m "feat(server): operator responder maps ChatResponse → lifecycle + follow"
```

### Task M3.5 — Wire the responder into the app + bootstrap (+ chat integration test)

**Files:**
- Modify: `apps/server/src/app.ts`
- Create: `apps/server/src/operatorChat.integration.test.ts`
- Modify: `apps/server/src/index.ts`

- [ ] **Step 1: Make `createOfficeApp` accept an injectable operator responder**

In `apps/server/src/app.ts`:
- Import the type: `import type { OperatorResponder } from './operator/TradingLabOperatorResponder';`
- Add `operatorResponder?: OperatorResponder;` to `OfficeAppDeps`.
- In the POST `operatorMessages` handler, replace the direct `handleOperatorMessage(parsed.data, bus)` call with:

```ts
const respond: OperatorResponder = deps.operatorResponder ?? ((m, b) => handleOperatorMessage(m, b));
return c.json(respond(parsed.data, bus));
```

Leave the `operatorMessageSchema.safeParse` + 400 path unchanged. The inert `handleOperatorMessage` remains the default (fixture mode + existing tests untouched).

- [ ] **Step 2: Write the failing integration test** (spec's "operator message → chat ingress → office lifecycle")

Create `apps/server/src/operatorChat.integration.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createOfficeApp } from './app';
import { loadConfig } from './config';
import { OfficeEventBus } from './events/OfficeEventBus';
import { FixtureOfficeReadConnector } from './connector/FixtureOfficeReadConnector';
import { makeTradingLabOperatorResponder } from './operator/TradingLabOperatorResponder';
import { OFFICE_API } from '@trading-office/office-gateway';
import type { OfficeEvent } from '@trading-office/office-gateway';

describe('operator chat integration (trading-lab responder over the HTTP route)', () => {
  it('POST operator message → calls chat ingress with the body → emits accepted+progress', async () => {
    const config = loadConfig({});
    const bus = new OfficeEventBus();
    const seen: OfficeEvent[] = [];
    bus.subscribe((e) => seen.push(e));
    const chat = { send: vi.fn(async () => ({ kind: 'task_created' as const, sessionId: 'c1', taskId: 't1', taskType: 'research.run_cycle', status: 'queued' as const })) };
    const operatorResponder = makeTradingLabOperatorResponder({
      chat: chat as never, client: {} as never, bridge: { subscribeAppended: () => () => {} } as never,
      guards: config.chatFollow, startFollow: vi.fn(),
    });
    const { app } = createOfficeApp({ connector: new FixtureOfficeReadConnector(config), bus, config, operatorResponder });

    const res = await app.request(OFFICE_API.operatorMessages, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'research BTC', source: 'web', target: 'orchestrator', floorId: 'f1' }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'accepted' });
    await new Promise((r) => setTimeout(r, 0));
    expect(chat.send).toHaveBeenCalledWith({ message: 'research BTC', sessionId: expect.any(String), channel: 'web' });
    expect(seen.map((e) => e.type)).toEqual(['operator_message_accepted', 'operator_message_progress']);
  });
});
```

- [ ] **Step 3: Run it; verify it fails**

Run: `npm test -w @trading-office/server -- operatorChat.integration`
Expected: FAIL (until Step 1's `operatorResponder` dep exists — if you wrote Step 1 first, it passes here).

- [ ] **Step 4: Wire `index.ts`** to build the responder in trading-lab mode

In `apps/server/src/index.ts` (trading-lab branch from M2.3), add:

```ts
import { TradingLabChatConnector } from './operator/TradingLabChatConnector';
import { makeTradingLabOperatorResponder, makeChatUnavailableResponder } from './operator/TradingLabOperatorResponder';

let operatorResponder; // undefined in fixture mode → app uses the inert default
if (wiring) {
  if (config.tradingLab.chatToken) {
    const chat = new TradingLabChatConnector({
      chatUrl: config.tradingLab.chatUrl,
      chatToken: config.tradingLab.chatToken,
      requestTimeoutMs: config.tradingLab.requestTimeoutMs,
    });
    operatorResponder = makeTradingLabOperatorResponder({ chat, client: wiring.client, bridge: wiring.bridge, guards: config.chatFollow });
  } else {
    operatorResponder = makeChatUnavailableResponder();
  }
}
// pass operatorResponder into createOfficeApp({ connector, bus, config, operatorResponder })
```

- [ ] **Step 5: Run tests; verify pass**

Run: `npm test -w @trading-office/server -- operatorChat.integration && npm test -w @trading-office/server`
Expected: PASS (integration green; existing inert-operator tests still green — default path unchanged).

- [ ] **Step 6: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/app.ts apps/server/src/operatorChat.integration.test.ts apps/server/src/index.ts
git commit -m "feat(server): wire trading-lab operator responder into app + bootstrap"
```

**M3 done** — operator chat calls the real ingress; actionable tasks follow real downstream progress by correlationId; everything degrades honestly (no correlation / unconfirmed terminal / chat unset → honest message, never fake progress).

---

## Milestone M4 — boundary + exposure guards, conformance, smoke

After M4: the import boundary and token-non-exposure are test-enforced, the `mock == connected` fixture conformance is green, and the connected+trading-lab path is smoked locally.

### Task M4.1 — Import-boundary guard (no trading-lab/platform imports)

**Files:**
- Create: `apps/server/src/importBoundary.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const SRC = fileURLToPath(new URL('.', import.meta.url)); // apps/server/src

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

// Forbid importing the trading-lab / trading-platform repos or their @-scopes.
// Allowed: @trading-office/* (incl. @trading-office/trading-lab-floor).
const FORBIDDEN = /from ['"](trading-lab|trading-platform|@trading-lab\/|@trading-platform\/)/;

describe('import boundary', () => {
  it('no apps/server source imports the trading-lab/platform repos', () => {
    const offenders = walk(SRC)
      .filter((f) => f.endsWith('.ts'))
      .filter((f) => FORBIDDEN.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it; verify it passes** (the connector mirrors DTOs, never imports)

Run: `npm test -w @trading-office/server -- importBoundary`
Expected: PASS. (If it fails, a file is importing trading-lab — replace with a `labDtos.ts` mirror.)

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/importBoundary.test.ts
git commit -m "test(server): enforce no trading-lab/platform imports"
```

### Task M4.2 — Token-non-exposure guard (web never sees lab tokens/urls)

**Files:**
- Create: `apps/web/src/runtime/tokenExposure.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const SRC = fileURLToPath(new URL('..', import.meta.url)); // apps/web/src

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('no trading-lab token/url exposure in the web app', () => {
  it('web source never references TRADING_LAB_* (tokens/urls are server-only)', () => {
    const offenders = walk(SRC)
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .filter((f) => /TRADING_LAB/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it; verify it passes**

Run: `npm test -w @trading-office/web -- tokenExposure`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/runtime/tokenExposure.test.ts
git commit -m "test(web): guard against trading-lab token/url exposure"
```

### Task M4.3 — Conformance + full-suite green (fixture mode unchanged)

**Files:**
- Modify (only if snapshot drift): `apps/web/src/runtime/conformance.test.ts`

- [ ] **Step 1: Run the conformance test**

Run: `npm test -w @trading-office/web -- conformance`
Expected: PASS. `mock` and `connected` both use the same fixtures (connected mode defaults to `OFFICE_CONNECTOR_MODE=fixture`), so they remain equal even with the `InfraStatus.sources` + nullable-backtest widening (fixtures populate real values + `fixture`/`live` sources).

- [ ] **Step 2: If a snapshot drifted** (e.g. infra now carries `sources`), update the expected snapshot to include the new field — do NOT weaken the equality; both sides must still match exactly.

- [ ] **Step 3: Full workspace verification**

Run: `npm run typecheck && npm test --workspaces && npm run build`
Expected: PASS — every workspace green, build clean.

- [ ] **Step 4: Commit (only if a file changed)**

```bash
git add -A
git commit -m "test(web): keep mock==connected conformance green under phase-3 widening"
```

### Task M4.4 — Env example + local trading-lab smoke

**Files:**
- Modify: `apps/server/.env.example`

- [ ] **Step 1: Update `apps/server/.env.example`**

Append the Phase 3 server-only vars (document, do not commit real tokens):

```bash
# Phase 3 — trading-lab integration (server-only; NEVER expose to the browser)
OFFICE_CONNECTOR_MODE=fixture            # fixture | trading-lab
TRADING_LAB_READ_URL=http://localhost:3100
TRADING_LAB_READ_TOKEN=
TRADING_LAB_CHAT_URL=http://localhost:3000
TRADING_LAB_CHAT_TOKEN=
# chat-follow guards (optional)
OFFICE_CHAT_FOLLOW_MAX_MS=300000
OFFICE_CHAT_FOLLOW_IDLE_MS=45000
OFFICE_CHAT_FOLLOW_MAX_DELTAS=200
OFFICE_CHAT_BOOTSTRAP_RETRIES=8
OFFICE_CHAT_BOOTSTRAP_INTERVAL_MS=750
OFFICE_STREAM_RECONNECT_BASE_MS=1000
OFFICE_STREAM_RECONNECT_MAX_MS=30000
```

Confirm `apps/web/.env.example` only has `VITE_OFFICE_MODE` / office-server URL — **no** `TRADING_LAB_*`.

- [ ] **Step 2: Local smoke (manual — requires a running trading-lab)**

1. Start trading-lab with the Read API + chat ingress up and tokens set (`READ_API_PORT=3100`, `INGRESS_PORT=3000`, `TRADING_LAB_READ_TOKEN`, `TRADING_LAB_CHAT_TOKEN`). See `trading-lab/src/read-api/README.md`.
2. Start the office server in trading-lab mode:
   `OFFICE_CONNECTOR_MODE=trading-lab TRADING_LAB_READ_TOKEN=<t> TRADING_LAB_CHAT_TOKEN=<c> npm run dev:connected`
3. Verify:
   - **reads:** hypotheses/backtests/agents panels show real data; backtests with missing metrics render `—` (not `0`); knowledge + bot-health show the honest "not connected yet" empty-states.
   - **live:** the floor reflects real agent status/trace as trading-lab emits events; kill the trading-lab stream → office shows a degraded notice + keeps serving reads → restore → fresh snapshot.
   - **chat:** send an operator message → accepted → (for an actionable request) progress + streamed correlated deltas → completed/failed on the real terminal; send something out-of-scope → single completed reply.
4. **Bundle check:** `npm run build -w @trading-office/web` then confirm the dist bundle contains no read/chat token: `! grep -rIl "$TRADING_LAB_READ_TOKEN" apps/web/dist`.

- [ ] **Step 3: Commit**

```bash
git add apps/server/.env.example
git commit -m "docs(server): document phase-3 trading-lab env (server-only)"
```

---

## Definition of done

- `npm run typecheck && npm test --workspaces && npm run build` all green.
- `OFFICE_CONNECTOR_MODE=fixture` (default): identical to Phase 2; `mock == connected` conformance green.
- `OFFICE_CONNECTOR_MODE=trading-lab`: reads/activity/hypotheses/backtests from the real Read API; live floor from `/v1/stream`; operator chat calls the real ingress and follows downstream progress by `correlationId`.
- **Honesty invariants:** no fixtures in trading-lab mode; knowledge/bot-health are explicit gaps; null metrics render `—` not `0`; correlation/terminal only from explicit fields; degraded stream + unconfigured chat + unconfirmable terminal all surface honest messages — never fabricated data.
- **Boundary invariants (test-enforced):** no trading-lab/platform imports from trading-office; no `TRADING_LAB_*` in the web app/bundle; `OfficeReadConnector` stays read-only by type; no command channel over WS.
- M1 calibration recorded the confirmed `winRate` unit + per-`taskType` terminal event types in `terminalTaxonomy.ts` (or left `successTypes: []` where unconfirmed, so the follower degrades honestly).
