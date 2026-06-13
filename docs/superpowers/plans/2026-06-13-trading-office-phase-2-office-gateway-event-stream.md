# Trading Office — Phase 2: Office Gateway + Realtime Event Stream — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a real `trading-office` server (`apps/server`, Hono) behind the existing read-only `OfficeGateway` contract, with real HTTP snapshots + one read-only WebSocket event stream, switchable mock/connected — data and events still fixture-backed.

**Architecture:** Two new pure packages — `@trading-office/office-gateway` (the wire contract: types + zod + route descriptors) and `@trading-office/office-fixtures` (shared deterministic demo data) — are consumed by both a new Hono server app (`apps/server`, which holds a read-only `OfficeReadConnector` port + a fixture implementation + an in-proc event bus) and the existing `apps/web` (which gains an `HttpOfficeGateway` and a Vite-env mode switch). No app imports the other in production code; no app imports `trading-lab`/`trading-platform`.

**Tech Stack:** TypeScript (ES2022, `moduleResolution: bundler`, `verbatimModuleSyntax`), Hono + `@hono/node-server` + `@hono/node-ws` (server), `ws` client, `zod` (wire validation), Vite 7 + React 19 (web, unchanged), Vitest 3 (node env), `tsx` (server dev runner), `concurrently` (combined dev), npm workspaces.

**Source of truth:** the approved spec at `docs/superpowers/specs/2026-06-13-trading-office-phase-2-office-gateway-event-stream-design.md`. Read it before starting.

---

## Conventions every task must follow

- **`verbatimModuleSyntax` is on:** type-only imports/exports MUST use `import type` / `export type`. zod schemas are runtime values (normal `import`/`export`); `z.infer<...>` aliases are types (`export type`).
- **Packages export raw TS** via an `exports` map pointing at `src/index.ts` (no build step) — mirror `packages/trading-lab-floor`.
- **All configs extend `../../tsconfig.base.json`.** There is no root `tsconfig.json`.
- **Tests are `*.test.ts`, node environment, Vitest.** No DOM/React rendering tests (pure logic + reducers only), matching Phase 1.
- **Run everything from the repo root.** `npm install` at root wires workspace symlinks (run it after adding any new package).
- **Commit after each task** with a conventional-commit message.
- The `AgentStatus` union's single source of truth stays the kit (`@trading-office/office-visual-kit`); the contract re-exports it via `import type` (erased at runtime — no Pixi pulled into the contract or server).

## File structure (what each new/changed file owns)

```
packages/office-gateway/                 NEW — pure wire contract (no runtime, browser-safe)
  package.json                           exports src/index.ts; dep: zod, office-visual-kit (types only)
  tsconfig.json                          extends base
  src/schemas.ts                         zod schemas — the wire SSOT for every serialized payload
  src/dto.ts                             types inferred from schemas + AgentStatus re-export
  src/events.ts                          OfficeEvent type (inferred) + event-type union
  src/http.ts                            OFFICE_API route/path descriptors (string patterns + url builders)
  src/errors.ts                          OfficeError / OfficeErrorBody (inferred)
  src/gateway.ts                         OfficeGateway interface
  src/index.ts                           barrel re-export
  src/schemas.test.ts                    zod round-trip (valid parses, malformed rejected)

packages/office-fixtures/                NEW — shared deterministic demo data (pure, browser-safe)
  package.json                           exports src/index.ts; dep: office-gateway
  tsconfig.json                          extends base
  src/snapshots.ts                       INITIAL_STATUSES, HYPOTHESES, BACKTESTS, BOTS, KNOWLEDGE, INFRA
  src/agents.ts                          STATUS_POOLS, TASKS, agentActivity(agentId)
  src/operator.ts                        cannedOperatorReply(text), operatorReplyChunks(text)
  src/index.ts                           barrel re-export
  src/fixtures.test.ts                   every fixture satisfies the contract zod schemas

apps/server/                             NEW — Hono runtime (Node)
  package.json                           hono, @hono/node-server, @hono/node-ws, ws, zod, office-gateway, office-fixtures; dev: tsx, vitest, @types/node, @types/ws
  tsconfig.json                          extends base; types: [node]
  src/config.ts                          loadConfig() from env (port, corsOrigin, tick/heartbeat/latency ms)
  src/connector/OfficeReadConnector.ts   read-only port (no write affordance)
  src/connector/FixtureOfficeReadConnector.ts  fixture reads + start(emit) producer
  src/events/OfficeEventBus.ts           in-proc pub/sub (fan-out)
  src/events/fixtureEventProducer.ts     status loop + occasional traces
  src/operator/responder.ts              inert operator responder (mints ids, emits lifecycle)
  src/guard/noExecutionAuthority.ts      centralized guard for the operator path
  src/app.ts                             createOfficeApp(deps) — routes + WS, returns { app, injectWebSocket }
  src/index.ts                           bootstrap: serve + injectWebSocket + shutdown
  src/*.test.ts                          bus, connector, producer, guard, routes, WS tests

apps/web/                                CHANGED
  package.json                           + deps office-gateway, office-fixtures; + devDep @trading-office/server (conformance test only)
  src/runtime/types.ts                   re-export from @trading-office/office-gateway (kept as a thin compat shim)
  src/runtime/OfficeGateway.ts           re-export OfficeGateway from the contract
  src/runtime/MockOfficeGateway.ts       implement new contract over office-fixtures
  src/runtime/MockOfficeGateway.test.ts  updated for sendOperatorMessage / subscribeOfficeEvents
  src/runtime/HttpOfficeGateway.ts       NEW — HTTP reads + one WS + connection signaling; injectable fetchImpl/wsFactory
  src/runtime/HttpOfficeGateway.test.ts  NEW — reads, non-2xx throw, WS fan-out, connection state
  src/runtime/OfficeRuntimeStore.ts      + reduce(event) (statuses) + shell connection state
  src/runtime/OfficeRuntimeStore.test.ts NEW — reducer + connection
  src/runtime/RuntimeContext.tsx         createGateway() Vite-env mode switch + connection wiring + useConnectionStatus
  src/runtime/conformance.test.ts        NEW — mock == connected snapshots (in-process Hono)
  src/runtime/importBoundary.test.ts     NEW — production import-boundary guard
  src/floor/panels/operatorTranscript.ts NEW — pure transcript reducer
  src/floor/panels/operatorTranscript.test.ts NEW
  src/floor/panels/OperatorChatPanel.tsx NEW (replaces BossCommandPanel.tsx)
  src/floor/floorSelection.ts            + operator?: boolean (the /operator shell route)
  src/floor/panelRegistry.ts             boss → agent-activity; operator-chat only from /operator route
  src/floor/panelRegistry.test.ts        updated (boss → activity; operator via shell route)
  src/floor/PanelDock.tsx                render OperatorChatPanel (kind from the shell route)
  src/floor/FloorScreen.tsx              office events → store.reduce; Operator button + /operator route; connection banner

root + tooling                           CHANGED
  package.json                           + scripts dev:server / dev:web:connected / dev:connected; test --workspaces; + devDep concurrently
  apps/web/.env.example                  VITE_OFFICE_MODE / URLs
  apps/server/.env.example               OFFICE_* vars
```

---

## Task Group A — `packages/office-gateway` (the wire contract)

### Task A1: Scaffold the contract package

**Files:**
- Create: `packages/office-gateway/package.json`
- Create: `packages/office-gateway/tsconfig.json`
- Create: `packages/office-gateway/src/index.ts`

- [ ] **Step 1: Create `packages/office-gateway/package.json`**

```json
{
  "name": "@trading-office/office-gateway",
  "version": "0.1.0",
  "license": "MIT",
  "private": true,
  "type": "module",
  "description": "Trading Office gateway wire contract — DTOs, zod schemas, route descriptors, OfficeEvent schema (pure, browser-safe)",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  },
  "files": ["src"],
  "scripts": {
    "typecheck": "tsc --noEmit",
    "build": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@trading-office/office-visual-kit": "*",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "typescript": "^5.8.3",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/office-gateway/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create a placeholder `packages/office-gateway/src/index.ts`** (filled in later tasks)

```ts
export {};
```

- [ ] **Step 4: Install + verify the workspace resolves**

Run: `npm install`
Expected: completes; `node_modules/@trading-office/office-gateway` symlink exists.

- [ ] **Step 5: Commit**

```bash
git add packages/office-gateway package-lock.json
git commit -m "feat(office-gateway): scaffold pure contract package"
```

### Task A2: zod schemas + inferred DTO types (the wire SSOT)

**Files:**
- Create: `packages/office-gateway/src/schemas.ts`
- Create: `packages/office-gateway/src/dto.ts`
- Create: `packages/office-gateway/src/errors.ts`
- Test: `packages/office-gateway/src/schemas.test.ts`

- [ ] **Step 1: Write the failing round-trip test** (`src/schemas.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import {
  agentActivitySchema,
  backtestSummarySchema,
  infraStatusSchema,
  operatorMessageSchema,
  operatorMessageAcceptedSchema,
  officeErrorBodySchema,
} from './schemas';

describe('contract schemas round-trip', () => {
  it('accepts a valid AgentActivity', () => {
    const v = {
      agentId: 'researcher',
      status: 'thinking',
      currentTask: 'sweeping windows',
      logs: [{ ts: '09:41', level: 'info', text: 'go' }],
    };
    expect(agentActivitySchema.parse(v)).toEqual(v);
  });

  it('rejects a malformed BacktestSummary (missing sharpe)', () => {
    const bad = { id: 'b1', strategy: 's', symbol: 'BTCUSDT', period: 'Q4', pnlPct: 1, winRatePct: 50, maxDrawdownPct: 5 };
    expect(() => backtestSummarySchema.parse(bad)).toThrow();
  });

  it('accepts a valid InfraStatus', () => {
    const v = { services: [{ name: 'x', up: true, detail: 'ok' }], queues: [{ name: 'q', depth: 0 }], lastSync: '09:41' };
    expect(infraStatusSchema.parse(v)).toEqual(v);
  });

  it('round-trips an OperatorMessage and its accepted response', () => {
    const msg = { text: 'status?', source: 'web', target: 'orchestrator', floorId: 'trading-lab' };
    expect(operatorMessageSchema.parse(msg)).toEqual(msg);
    const acc = { operatorMessageId: 'm1', conversationId: 'c1', status: 'accepted' };
    expect(operatorMessageAcceptedSchema.parse(acc)).toEqual(acc);
  });

  it('rejects an OperatorMessage with a non-web source it does not know', () => {
    expect(() => operatorMessageSchema.parse({ text: 'x', source: 'sms', target: 'orchestrator', floorId: 'trading-lab' })).toThrow();
  });

  it('shapes an error body', () => {
    const e = { error: { code: 'not_found', message: 'no such agent' } };
    expect(officeErrorBodySchema.parse(e)).toEqual(e);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -w @trading-office/office-gateway`
Expected: FAIL — cannot find module `./schemas`.

- [ ] **Step 3: Create `packages/office-gateway/src/schemas.ts`**

```ts
import { z } from 'zod';
import type { AgentStatus } from '@trading-office/office-visual-kit';

// AgentStatus' union SSOT is the kit; validate structurally at the wire (string),
// keep the precise union at the type level via z.custom<AgentStatus>().
export const agentStatusSchema = z.custom<AgentStatus>((v) => typeof v === 'string');
export const agentStatusMapSchema = z.record(z.string(), agentStatusSchema);

export const traceLineSchema = z.object({
  ts: z.string(),
  level: z.enum(['debug', 'info', 'warn', 'error']),
  text: z.string(),
});

export const agentActivitySchema = z.object({
  agentId: z.string(),
  status: agentStatusSchema,
  currentTask: z.string().nullable(),
  logs: z.array(traceLineSchema),
});

export const hypothesisSchema = z.object({
  id: z.string(),
  title: z.string(),
  stage: z.enum(['proposed', 'testing', 'validated', 'rejected']),
  summary: z.string(),
});

export const backtestSummarySchema = z.object({
  id: z.string(),
  strategy: z.string(),
  symbol: z.string(),
  period: z.string(),
  pnlPct: z.number(),
  sharpe: z.number(),
  winRatePct: z.number(),
  maxDrawdownPct: z.number(),
});

export const botHealthSchema = z.object({
  id: z.string(),
  name: z.string(),
  state: z.enum(['running', 'paused', 'error']),
  uptime: z.string(),
  lastHeartbeat: z.string(),
});

export const knowledgeEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(['doc', 'experiment', 'note']),
  updated: z.string(),
  tags: z.array(z.string()),
});

export const infraServiceSchema = z.object({ name: z.string(), up: z.boolean(), detail: z.string() });
export const infraStatusSchema = z.object({
  services: z.array(infraServiceSchema),
  queues: z.array(z.object({ name: z.string(), depth: z.number() })),
  lastSync: z.string(),
});

export const operatorMessageSchema = z.object({
  text: z.string(),
  source: z.enum(['web']),
  target: z.enum(['orchestrator']),
  floorId: z.string(),
});
export const operatorMessageAcceptedSchema = z.object({
  operatorMessageId: z.string(),
  conversationId: z.string(),
  status: z.literal('accepted'),
});
export const operatorReplySchema = z.object({
  replyMessageId: z.string(),
  operatorMessageId: z.string(),
  conversationId: z.string(),
  text: z.string(),
  ts: z.string(),
});

export const officeErrorSchema = z.object({ code: z.string(), message: z.string() });
export const officeErrorBodySchema = z.object({ error: officeErrorSchema });
```

- [ ] **Step 4: Create `packages/office-gateway/src/dto.ts`** (types inferred from the schemas)

```ts
import type { z } from 'zod';
import type { AgentStatus } from '@trading-office/office-visual-kit';
import type {
  agentStatusMapSchema,
  traceLineSchema,
  agentActivitySchema,
  hypothesisSchema,
  backtestSummarySchema,
  botHealthSchema,
  knowledgeEntrySchema,
  infraServiceSchema,
  infraStatusSchema,
  operatorMessageSchema,
  operatorMessageAcceptedSchema,
  operatorReplySchema,
} from './schemas';

export type { AgentStatus };
export type AgentStatusMap = z.infer<typeof agentStatusMapSchema>;
export type TraceLine = z.infer<typeof traceLineSchema>;
export type AgentActivity = z.infer<typeof agentActivitySchema>;
export type Hypothesis = z.infer<typeof hypothesisSchema>;
export type BacktestSummary = z.infer<typeof backtestSummarySchema>;
export type BotHealth = z.infer<typeof botHealthSchema>;
export type KnowledgeEntry = z.infer<typeof knowledgeEntrySchema>;
export type InfraService = z.infer<typeof infraServiceSchema>;
export type InfraStatus = z.infer<typeof infraStatusSchema>;
export type OperatorMessage = z.infer<typeof operatorMessageSchema>;
export type OperatorMessageAccepted = z.infer<typeof operatorMessageAcceptedSchema>;
export type OperatorReply = z.infer<typeof operatorReplySchema>;
```

- [ ] **Step 5: Create `packages/office-gateway/src/errors.ts`**

```ts
import type { z } from 'zod';
import type { officeErrorSchema, officeErrorBodySchema } from './schemas';

export type OfficeError = z.infer<typeof officeErrorSchema>;
export type OfficeErrorBody = z.infer<typeof officeErrorBodySchema>;
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm run test -w @trading-office/office-gateway`
Expected: PASS (6 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/office-gateway/src
git commit -m "feat(office-gateway): zod wire schemas + inferred DTO types"
```

### Task A3: `OfficeEvent` schema, route descriptors, gateway interface, barrel

**Files:**
- Modify: `packages/office-gateway/src/schemas.ts` (append the event schema)
- Create: `packages/office-gateway/src/events.ts`
- Create: `packages/office-gateway/src/http.ts`
- Create: `packages/office-gateway/src/gateway.ts`
- Modify: `packages/office-gateway/src/index.ts`
- Test: `packages/office-gateway/src/schemas.test.ts` (append event cases)

- [ ] **Step 1: Append the failing event-schema test** to `src/schemas.test.ts`

```ts
import { officeEventSchema } from './schemas';

describe('OfficeEvent schema', () => {
  it('parses a statuses snapshot', () => {
    const e = { type: 'agent_statuses_snapshot', ts: '09:41', statuses: { boss: 'thinking' } };
    expect(officeEventSchema.parse(e)).toEqual(e);
  });
  it('parses an operator delta carrying replyMessageId', () => {
    const e = { type: 'operator_message_delta', ts: '09:41', operatorMessageId: 'm1', conversationId: 'c1', replyMessageId: 'r1', textDelta: 'hi' };
    expect(officeEventSchema.parse(e)).toEqual(e);
  });
  it('rejects an unknown event type', () => {
    expect(() => officeEventSchema.parse({ type: 'nope', ts: '09:41' })).toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -w @trading-office/office-gateway`
Expected: FAIL — `officeEventSchema` is not exported.

- [ ] **Step 3: Append `officeEventSchema` to `src/schemas.ts`**

```ts
export const officeEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('agent_statuses_snapshot'), ts: z.string(), statuses: agentStatusMapSchema }),
  z.object({ type: z.literal('agent_status_changed'), ts: z.string(), agentId: z.string(), status: agentStatusSchema }),
  z.object({ type: z.literal('agent_trace_appended'), ts: z.string(), agentId: z.string(), line: traceLineSchema }),
  z.object({ type: z.literal('operator_message_accepted'), ts: z.string(), operatorMessageId: z.string(), conversationId: z.string() }),
  z.object({ type: z.literal('operator_message_progress'), ts: z.string(), operatorMessageId: z.string(), conversationId: z.string(), replyMessageId: z.string(), stage: z.string().optional(), note: z.string().optional() }),
  z.object({ type: z.literal('operator_message_delta'), ts: z.string(), operatorMessageId: z.string(), conversationId: z.string(), replyMessageId: z.string(), textDelta: z.string() }),
  z.object({ type: z.literal('operator_message_completed'), ts: z.string(), operatorMessageId: z.string(), conversationId: z.string(), replyMessageId: z.string(), reply: operatorReplySchema }),
  z.object({ type: z.literal('operator_message_failed'), ts: z.string(), operatorMessageId: z.string(), conversationId: z.string(), replyMessageId: z.string().optional(), error: officeErrorSchema }),
  z.object({ type: z.literal('system_notice'), ts: z.string(), level: z.enum(['info', 'warn', 'error']), text: z.string() }),
  z.object({ type: z.literal('office_error'), ts: z.string(), error: officeErrorSchema }),
  z.object({ type: z.literal('heartbeat'), ts: z.string() }),
]);
```

- [ ] **Step 4: Create `packages/office-gateway/src/events.ts`**

```ts
import type { z } from 'zod';
import type { officeEventSchema } from './schemas';

export type OfficeEvent = z.infer<typeof officeEventSchema>;
export type OfficeEventType = OfficeEvent['type'];
```

- [ ] **Step 5: Create `packages/office-gateway/src/http.ts`** (the single source for paths)

```ts
export const OFFICE_API = {
  agentStatuses: '/api/office/agents/statuses',
  agentActivityPattern: '/api/office/agents/:agentId/activity',
  agentActivity: (agentId: string) => `/api/office/agents/${encodeURIComponent(agentId)}/activity`,
  hypotheses: '/api/office/hypotheses',
  backtests: '/api/office/backtests',
  bots: '/api/office/bots',
  knowledge: '/api/office/knowledge',
  infra: '/api/office/infra',
  operatorMessages: '/api/office/operator/messages',
  events: '/api/office/events',
} as const;
```

- [ ] **Step 6: Create `packages/office-gateway/src/gateway.ts`**

```ts
import type {
  AgentActivity,
  AgentStatusMap,
  BacktestSummary,
  BotHealth,
  Hypothesis,
  InfraStatus,
  KnowledgeEntry,
  OperatorMessage,
  OperatorMessageAccepted,
} from './dto';
import type { OfficeEvent } from './events';

/**
 * The single boundary the browser crosses for office data. Read-only except
 * sendOperatorMessage, which is INERT: it is accepted and answered with a
 * simulated reply lifecycle over the event stream — never an execution action.
 */
export interface OfficeGateway {
  getAgentStatuses(): Promise<AgentStatusMap>;
  getAgentActivity(agentId: string): Promise<AgentActivity>;
  getHypotheses(): Promise<Hypothesis[]>;
  getBacktests(): Promise<BacktestSummary[]>;
  getBotHealth(): Promise<BotHealth[]>;
  getKnowledge(): Promise<KnowledgeEntry[]>;
  getInfraStatus(): Promise<InfraStatus>;
  sendOperatorMessage(msg: OperatorMessage): Promise<OperatorMessageAccepted>;
  subscribeOfficeEvents?(cb: (e: OfficeEvent) => void): () => void;
}
```

- [ ] **Step 7: Replace `packages/office-gateway/src/index.ts`** with the barrel

```ts
export * from './schemas';
export type * from './dto';
export type * from './events';
export type * from './errors';
export type * from './gateway';
export * from './http';
```

- [ ] **Step 8: Run tests + typecheck**

Run: `npm run test -w @trading-office/office-gateway && npm run typecheck -w @trading-office/office-gateway`
Expected: PASS (9 tests) and no type errors.

- [ ] **Step 9: Commit**

```bash
git add packages/office-gateway/src
git commit -m "feat(office-gateway): OfficeEvent schema, route descriptors, OfficeGateway interface"
```

---

## Task Group B — `packages/office-fixtures` (shared demo data)

### Task B1: Scaffold + relocate the demo data

**Files:**
- Create: `packages/office-fixtures/package.json`
- Create: `packages/office-fixtures/tsconfig.json`
- Create: `packages/office-fixtures/src/snapshots.ts`
- Create: `packages/office-fixtures/src/agents.ts`
- Create: `packages/office-fixtures/src/operator.ts`
- Create: `packages/office-fixtures/src/index.ts`

- [ ] **Step 1: Create `packages/office-fixtures/package.json`**

```json
{
  "name": "@trading-office/office-fixtures",
  "version": "0.1.0",
  "license": "MIT",
  "private": true,
  "type": "module",
  "description": "Trading Office shared deterministic demo data (pure, browser-safe) — used by MockOfficeGateway and the server's fixture connector",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  },
  "files": ["src"],
  "scripts": {
    "typecheck": "tsc --noEmit",
    "build": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@trading-office/office-gateway": "*"
  },
  "devDependencies": {
    "typescript": "^5.8.3",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/office-fixtures/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/office-fixtures/src/snapshots.ts`** (lifted from `apps/web/src/runtime/fixtures.ts`, retyped against the contract)

```ts
import type {
  AgentStatus,
  AgentStatusMap,
  BacktestSummary,
  BotHealth,
  Hypothesis,
  InfraStatus,
  KnowledgeEntry,
} from '@trading-office/office-gateway';

export const INITIAL_STATUSES: AgentStatusMap = {
  boss: 'thinking',
  analyst: 'idle',
  researcher: 'thinking',
  critic: 'reviewing',
  builder: 'running',
  evaluator: 'backtesting',
  'perf-monitor': 'idle',
};

export const HYPOTHESES: Hypothesis[] = [
  { id: 'h1', title: 'BTC funding-rate reversion', stage: 'testing', summary: 'Negative funding precedes short-horizon mean reversion.' },
  { id: 'h2', title: 'ETH volatility breakout', stage: 'proposed', summary: 'ATR expansion predicts trend continuation on 4h.' },
  { id: 'h3', title: 'Cross-asset lead-lag', stage: 'validated', summary: 'BTC moves lead alts by ~15m in high-vol regimes.' },
  { id: 'h4', title: 'Weekend liquidity fade', stage: 'rejected', summary: 'No durable edge after fees; drawdown too high.' },
];

export const BACKTESTS: BacktestSummary[] = [
  { id: 'b1', strategy: 'mr-funding', symbol: 'BTCUSDT', period: '2024-Q4', pnlPct: 12.4, sharpe: 1.8, winRatePct: 57, maxDrawdownPct: 6.2 },
  { id: 'b2', strategy: 'vol-breakout', symbol: 'ETHUSDT', period: '2024-Q4', pnlPct: 8.1, sharpe: 1.1, winRatePct: 49, maxDrawdownPct: 9.7 },
  { id: 'b3', strategy: 'lead-lag', symbol: 'SOLUSDT', period: '2024-Q4', pnlPct: -2.3, sharpe: -0.3, winRatePct: 44, maxDrawdownPct: 11.5 },
];

export const BOTS: BotHealth[] = [
  { id: 'bot1', name: 'paper-mr-funding', state: 'running', uptime: '3d 4h', lastHeartbeat: '2s ago' },
  { id: 'bot2', name: 'paper-vol-breakout', state: 'paused', uptime: '—', lastHeartbeat: '12m ago' },
  { id: 'bot3', name: 'shadow-lead-lag', state: 'error', uptime: '0m', lastHeartbeat: '4m ago' },
];

export const KNOWLEDGE: KnowledgeEntry[] = [
  { id: 'k1', title: 'Funding-rate reversion writeup', kind: 'doc', updated: '2026-06-10', tags: ['btc', 'reversion'] },
  { id: 'k2', title: 'Walk-forward harness notes', kind: 'note', updated: '2026-06-09', tags: ['backtest'] },
  { id: 'k3', title: 'Experiment 2026-06-08 vol breakout', kind: 'experiment', updated: '2026-06-08', tags: ['eth', 'breakout'] },
];

export const INFRA: InfraStatus = {
  services: [
    { name: 'office-gateway', up: true, detail: 'serving fixtures' },
    { name: 'market-data feed', up: true, detail: 'lag 120ms' },
    { name: 'backtest workers', up: true, detail: '3/3 healthy' },
    { name: 'archive store', up: false, detail: 'read-only snapshot' },
  ],
  queues: [
    { name: 'backtest-jobs', depth: 2 },
    { name: 'ingest', depth: 0 },
  ],
  lastSync: '09:41:30',
};

// Re-export AgentStatus so consumers can build typed status data from one import.
export type { AgentStatus };
```

- [ ] **Step 4: Create `packages/office-fixtures/src/agents.ts`**

```ts
import type { AgentActivity, AgentStatus } from '@trading-office/office-gateway';
import { INITIAL_STATUSES } from './snapshots';

/** Plausible status loops per agent for the simulated event producer. */
export const STATUS_POOLS: Record<string, AgentStatus[]> = {
  boss: ['thinking', 'running', 'waiting', 'thinking'],
  analyst: ['thinking', 'reviewing', 'idle', 'success'],
  researcher: ['thinking', 'running', 'idle', 'thinking'],
  critic: ['reviewing', 'blocked', 'reviewing', 'idle'],
  builder: ['running', 'idle', 'success', 'running'],
  evaluator: ['backtesting', 'success', 'backtesting', 'failed'],
  'perf-monitor': ['idle', 'running', 'failed', 'running'],
};

const TASKS: Record<string, string> = {
  boss: 'Coordinating the BTC mean-reversion research sprint',
  analyst: 'Scoring 12 candidate features for regime detection',
  researcher: 'Sweeping lookback windows on the momentum signal',
  critic: 'Auditing risk on the latest strategy proposal',
  builder: 'Compiling strategy v0.4 into the backtest harness',
  evaluator: 'Running walk-forward backtest on ETH 4h',
  'perf-monitor': 'Watching live paper-trading drawdown',
};

export function agentActivity(agentId: string): AgentActivity {
  const status: AgentStatus = INITIAL_STATUSES[agentId] ?? 'idle';
  return {
    agentId,
    status,
    currentTask: status === 'idle' ? null : (TASKS[agentId] ?? 'Working'),
    logs: [
      { ts: '09:41:02', level: 'info', text: `agent ${agentId} picked up task` },
      { ts: '09:41:08', level: 'debug', text: 'loaded dataset shard 3/8' },
      { ts: '09:41:15', level: 'info', text: 'evaluating candidate parameters' },
      { ts: '09:41:21', level: 'warn', text: 'sharpe below threshold on fold 2' },
      { ts: '09:41:30', level: 'info', text: 'continuing sweep' },
    ],
  };
}
```

- [ ] **Step 5: Create `packages/office-fixtures/src/operator.ts`**

```ts
/** Inert canned reply — never an execution action. */
export function cannedOperatorReply(text: string): string {
  const t = text.toLowerCase();
  if (t.includes('status')) return 'All seven agents are active. Evaluator hit a failed fold; researcher is re-sweeping. (no execution authority)';
  if (t.includes('pause') || t.includes('stop')) return 'No execution authority — I can only report. Nothing was paused. (no execution authority)';
  return `Acknowledged: "${text}". This office is a read-only control room — no trading actions are taken. (no execution authority)`;
}

/** Split a reply into a few deterministic streaming chunks for the lifecycle. */
export function operatorReplyChunks(text: string): string[] {
  const reply = cannedOperatorReply(text);
  const words = reply.split(' ');
  const mid = Math.ceil(words.length / 3);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += mid) {
    chunks.push(words.slice(i, i + mid).join(' ') + (i + mid < words.length ? ' ' : ''));
  }
  return chunks;
}
```

- [ ] **Step 6: Create `packages/office-fixtures/src/index.ts`**

```ts
export * from './snapshots';
export * from './agents';
export * from './operator';
```

- [ ] **Step 7: Install + typecheck**

Run: `npm install && npm run typecheck -w @trading-office/office-fixtures`
Expected: completes, no type errors.

- [ ] **Step 8: Commit**

```bash
git add packages/office-fixtures package-lock.json
git commit -m "feat(office-fixtures): shared deterministic demo data + pure templates"
```

### Task B2: Fixtures-satisfy-contract test

**Files:**
- Test: `packages/office-fixtures/src/fixtures.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import {
  agentStatusMapSchema,
  hypothesisSchema,
  backtestSummarySchema,
  botHealthSchema,
  knowledgeEntrySchema,
  infraStatusSchema,
  agentActivitySchema,
} from '@trading-office/office-gateway';
import { INITIAL_STATUSES, HYPOTHESES, BACKTESTS, BOTS, KNOWLEDGE, INFRA, agentActivity } from './index';

describe('fixtures are valid wire payloads', () => {
  it('INITIAL_STATUSES', () => { expect(() => agentStatusMapSchema.parse(INITIAL_STATUSES)).not.toThrow(); });
  it('HYPOTHESES', () => { for (const h of HYPOTHESES) expect(() => hypothesisSchema.parse(h)).not.toThrow(); });
  it('BACKTESTS', () => { for (const b of BACKTESTS) expect(() => backtestSummarySchema.parse(b)).not.toThrow(); });
  it('BOTS', () => { for (const b of BOTS) expect(() => botHealthSchema.parse(b)).not.toThrow(); });
  it('KNOWLEDGE', () => { for (const k of KNOWLEDGE) expect(() => knowledgeEntrySchema.parse(k)).not.toThrow(); });
  it('INFRA', () => { expect(() => infraStatusSchema.parse(INFRA)).not.toThrow(); });
  it('agentActivity(any)', () => { expect(() => agentActivitySchema.parse(agentActivity('researcher'))).not.toThrow(); });
});
```

- [ ] **Step 2: Run it**

Run: `npm run test -w @trading-office/office-fixtures`
Expected: PASS (7 tests). If any fails, the fixture drifted from the schema — fix the fixture.

- [ ] **Step 3: Commit**

```bash
git add packages/office-fixtures/src/fixtures.test.ts
git commit -m "test(office-fixtures): assert every fixture satisfies the contract schemas"
```

---

## Task Group C — `apps/server` (Hono runtime + connector + event bus)

### Task C1: Scaffold the server app + config

**Files:**
- Create: `apps/server/package.json`
- Create: `apps/server/tsconfig.json`
- Create: `apps/server/src/config.ts`
- Test: `apps/server/src/config.test.ts`

- [ ] **Step 1: Create `apps/server/package.json`**

```json
{
  "name": "@trading-office/server",
  "version": "0.1.0",
  "license": "MIT",
  "private": true,
  "type": "module",
  "description": "Trading Office server/gateway (Hono) — HTTP snapshots + one read-only WebSocket event stream over a fixture connector",
  "exports": {
    ".": {
      "types": "./src/app.ts",
      "default": "./src/app.ts"
    }
  },
  "files": ["src"],
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "typecheck": "tsc --noEmit",
    "build": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@hono/node-server": "^1.13.0",
    "@hono/node-ws": "^1.0.4",
    "@trading-office/office-fixtures": "*",
    "@trading-office/office-gateway": "*",
    "hono": "^4.6.0",
    "ws": "^8.18.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22.7.0",
    "@types/ws": "^8.5.12",
    "tsx": "^4.19.0",
    "typescript": "^5.8.3",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create `apps/server/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write the failing config test** (`src/config.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('defaults when env is empty', () => {
    const c = loadConfig({});
    expect(c.port).toBe(8787);
    expect(c.corsOrigin).toBe('http://localhost:5174');
    expect(c.eventTickMs).toBeGreaterThan(0);
  });
  it('reads overrides from env', () => {
    const c = loadConfig({ OFFICE_SERVER_PORT: '9999', OFFICE_CORS_ORIGIN: 'http://x' });
    expect(c.port).toBe(9999);
    expect(c.corsOrigin).toBe('http://x');
  });
});
```

- [ ] **Step 4: Create `apps/server/src/config.ts`**

```ts
export interface OfficeServerConfig {
  port: number;
  corsOrigin: string;
  eventTickMs: number;
  heartbeatMs: number;
  fixtureLatencyMs: number;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): OfficeServerConfig {
  return {
    port: Number(env.OFFICE_SERVER_PORT ?? 8787),
    corsOrigin: env.OFFICE_CORS_ORIGIN ?? 'http://localhost:5174',
    eventTickMs: Number(env.OFFICE_EVENT_TICK_MS ?? 2600),
    heartbeatMs: Number(env.OFFICE_HEARTBEAT_MS ?? 15000),
    fixtureLatencyMs: Number(env.OFFICE_FIXTURE_LATENCY_MS ?? 0),
  };
}
```

- [ ] **Step 5: Install + run the test**

Run: `npm install && npm run test -w @trading-office/server`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/server package-lock.json
git commit -m "feat(server): scaffold Hono server app + config loader"
```

### Task C2: `OfficeEventBus` (in-proc pub/sub)

**Files:**
- Create: `apps/server/src/events/OfficeEventBus.ts`
- Test: `apps/server/src/events/OfficeEventBus.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { OfficeEventBus } from './OfficeEventBus';

describe('OfficeEventBus', () => {
  it('fans out to all subscribers and stops on unsubscribe', () => {
    const bus = new OfficeEventBus();
    const a: string[] = [];
    const b: string[] = [];
    const offA = bus.subscribe((e) => a.push(e.type));
    bus.subscribe((e) => b.push(e.type));
    bus.publish({ type: 'heartbeat', ts: '1' });
    expect(a).toEqual(['heartbeat']);
    expect(b).toEqual(['heartbeat']);
    offA();
    bus.publish({ type: 'heartbeat', ts: '2' });
    expect(a).toEqual(['heartbeat']);        // a unsubscribed
    expect(b).toEqual(['heartbeat', 'heartbeat']);
    expect(bus.size).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -w @trading-office/server`
Expected: FAIL — cannot find `./OfficeEventBus`.

- [ ] **Step 3: Create `apps/server/src/events/OfficeEventBus.ts`**

```ts
import type { OfficeEvent } from '@trading-office/office-gateway';

export class OfficeEventBus {
  private readonly subscribers = new Set<(e: OfficeEvent) => void>();

  subscribe(fn: (e: OfficeEvent) => void): () => void {
    this.subscribers.add(fn);
    return () => { this.subscribers.delete(fn); };
  }

  publish(e: OfficeEvent): void {
    for (const fn of this.subscribers) fn(e);
  }

  get size(): number {
    return this.subscribers.size;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -w @trading-office/server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/events/OfficeEventBus.ts apps/server/src/events/OfficeEventBus.test.ts
git commit -m "feat(server): in-proc OfficeEventBus pub/sub"
```

### Task C3: `fixtureEventProducer` (status loop + traces)

**Files:**
- Create: `apps/server/src/events/fixtureEventProducer.ts`
- Test: `apps/server/src/events/fixtureEventProducer.test.ts`

- [ ] **Step 1: Write the failing test (fake timers)**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { OfficeEvent } from '@trading-office/office-gateway';
import { STATUS_POOLS } from '@trading-office/office-fixtures';
import { createFixtureEventProducer } from './fixtureEventProducer';

afterEach(() => vi.useRealTimers());

describe('createFixtureEventProducer', () => {
  it('emits a status_changed for every pool agent on each tick, and stops cleanly', () => {
    vi.useFakeTimers();
    const events: OfficeEvent[] = [];
    const stop = createFixtureEventProducer((e) => events.push(e), 100);
    vi.advanceTimersByTime(100);
    const changed = events.filter((e) => e.type === 'agent_status_changed');
    expect(changed.length).toBe(Object.keys(STATUS_POOLS).length);
    stop();
    vi.advanceTimersByTime(500);
    expect(events.filter((e) => e.type === 'agent_status_changed').length).toBe(Object.keys(STATUS_POOLS).length);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -w @trading-office/server`
Expected: FAIL — cannot find `./fixtureEventProducer`.

- [ ] **Step 3: Create `apps/server/src/events/fixtureEventProducer.ts`**

```ts
import { STATUS_POOLS } from '@trading-office/office-fixtures';
import type { OfficeEvent } from '@trading-office/office-gateway';

const nowIso = (): string => new Date().toISOString();

/**
 * Server-side replacement for the Phase 1 client-side setInterval status loop.
 * Cycles each agent's status on a fixed tick and occasionally appends a trace.
 * Returns a stop function.
 */
export function createFixtureEventProducer(emit: (e: OfficeEvent) => void, tickMs: number): () => void {
  const ids = Object.keys(STATUS_POOLS);
  let tick = 0;
  const timer = setInterval(() => {
    tick += 1;
    for (const id of ids) {
      const pool = STATUS_POOLS[id]!;
      emit({ type: 'agent_status_changed', ts: nowIso(), agentId: id, status: pool[tick % pool.length]! });
    }
    if (tick % 3 === 0) {
      emit({ type: 'agent_trace_appended', ts: nowIso(), agentId: 'researcher', line: { ts: nowIso(), level: 'info', text: `sweep tick ${tick}` } });
    }
  }, tickMs);
  return () => clearInterval(timer);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -w @trading-office/server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/events/fixtureEventProducer.ts apps/server/src/events/fixtureEventProducer.test.ts
git commit -m "feat(server): fixture event producer (status loop + traces)"
```

### Task C4: `OfficeReadConnector` port + `FixtureOfficeReadConnector`

**Files:**
- Create: `apps/server/src/connector/OfficeReadConnector.ts`
- Create: `apps/server/src/connector/FixtureOfficeReadConnector.ts`
- Test: `apps/server/src/connector/FixtureOfficeReadConnector.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { INITIAL_STATUSES, BACKTESTS } from '@trading-office/office-fixtures';
import { loadConfig } from '../config';
import { FixtureOfficeReadConnector } from './FixtureOfficeReadConnector';

afterEach(() => vi.useRealTimers());

describe('FixtureOfficeReadConnector', () => {
  it('serves fixture snapshots', async () => {
    const c = new FixtureOfficeReadConnector(loadConfig({}));
    expect(await c.getAgentStatuses()).toEqual(INITIAL_STATUSES);
    expect(await c.getBacktests()).toEqual(BACKTESTS);
    expect((await c.getAgentActivity('researcher')).agentId).toBe('researcher');
  });

  it('start() drives live events and stop() halts them', () => {
    vi.useFakeTimers();
    const c = new FixtureOfficeReadConnector({ ...loadConfig({}), eventTickMs: 50 });
    const types: string[] = [];
    const stop = c.start((e) => types.push(e.type));
    vi.advanceTimersByTime(50);
    expect(types).toContain('agent_status_changed');
    stop();
    const n = types.length;
    vi.advanceTimersByTime(500);
    expect(types.length).toBe(n);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -w @trading-office/server`
Expected: FAIL — cannot find the connector modules.

- [ ] **Step 3: Create `apps/server/src/connector/OfficeReadConnector.ts`** (the read-only port — no write affordance)

```ts
import type {
  AgentActivity,
  AgentStatusMap,
  BacktestSummary,
  BotHealth,
  Hypothesis,
  InfraStatus,
  KnowledgeEntry,
  OfficeEvent,
} from '@trading-office/office-gateway';

/**
 * The office's single read boundary. READ-ONLY BY DESIGN: there is no write /
 * execute / command method, so the office cannot command an agent system —
 * the no-execution-authority guarantee is structural (enforced by this type).
 *
 * Phase 3 implements this same port as a CompositeOfficeConnector composing a
 * TradingLabReadConnector + a read-only PlatformMonitoringConnector.
 */
export interface OfficeReadConnector {
  getAgentStatuses(): Promise<AgentStatusMap>;
  getAgentActivity(agentId: string): Promise<AgentActivity>;
  getHypotheses(): Promise<Hypothesis[]>;
  getBacktests(): Promise<BacktestSummary[]>;
  getBotHealth(): Promise<BotHealth[]>;
  getKnowledge(): Promise<KnowledgeEntry[]>;
  getInfraStatus(): Promise<InfraStatus>;
  /** Begin the live event source; returns a stop function. */
  start(emit: (e: OfficeEvent) => void): () => void;
}
```

- [ ] **Step 4: Create `apps/server/src/connector/FixtureOfficeReadConnector.ts`**

```ts
import {
  agentActivity,
  BACKTESTS,
  BOTS,
  HYPOTHESES,
  INFRA,
  INITIAL_STATUSES,
  KNOWLEDGE,
} from '@trading-office/office-fixtures';
import type {
  AgentActivity,
  AgentStatusMap,
  BacktestSummary,
  BotHealth,
  Hypothesis,
  InfraStatus,
  KnowledgeEntry,
  OfficeEvent,
} from '@trading-office/office-gateway';
import type { OfficeServerConfig } from '../config';
import { createFixtureEventProducer } from '../events/fixtureEventProducer';
import type { OfficeReadConnector } from './OfficeReadConnector';

export class FixtureOfficeReadConnector implements OfficeReadConnector {
  constructor(private readonly config: OfficeServerConfig) {}

  private delay<T>(value: T): Promise<T> {
    const ms = this.config.fixtureLatencyMs;
    return ms > 0 ? new Promise((r) => setTimeout(() => r(value), ms)) : Promise.resolve(value);
  }

  getAgentStatuses(): Promise<AgentStatusMap> { return this.delay({ ...INITIAL_STATUSES }); }
  getAgentActivity(agentId: string): Promise<AgentActivity> { return this.delay(agentActivity(agentId)); }
  getHypotheses(): Promise<Hypothesis[]> { return this.delay(HYPOTHESES); }
  getBacktests(): Promise<BacktestSummary[]> { return this.delay(BACKTESTS); }
  getBotHealth(): Promise<BotHealth[]> { return this.delay(BOTS); }
  getKnowledge(): Promise<KnowledgeEntry[]> { return this.delay(KNOWLEDGE); }
  getInfraStatus(): Promise<InfraStatus> { return this.delay(INFRA); }

  start(emit: (e: OfficeEvent) => void): () => void {
    return createFixtureEventProducer(emit, this.config.eventTickMs);
  }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm run test -w @trading-office/server`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/connector
git commit -m "feat(server): read-only OfficeReadConnector port + fixture implementation"
```

### Task C5: No-execution-authority guard + inert operator responder

**Files:**
- Create: `apps/server/src/guard/noExecutionAuthority.ts`
- Create: `apps/server/src/operator/responder.ts`
- Test: `apps/server/src/operator/responder.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import type { OperatorMessage } from '@trading-office/office-gateway';
import { OfficeEventBus } from '../events/OfficeEventBus';
import { assertNoExecutionAuthority, ExecutionAuthorityError } from '../guard/noExecutionAuthority';
import { handleOperatorMessage } from './responder';

const msg: OperatorMessage = { text: 'what is the status?', source: 'web', target: 'orchestrator', floorId: 'trading-lab' };

describe('handleOperatorMessage (inert)', () => {
  it('returns accepted and emits a full lifecycle with paired ids', () => {
    const bus = new OfficeEventBus();
    const events: any[] = [];
    bus.subscribe((e) => events.push(e));
    const accepted = handleOperatorMessage(msg, bus, (fn) => fn()); // synchronous schedule
    expect(accepted.status).toBe('accepted');
    const types = events.map((e) => e.type);
    expect(types[0]).toBe('operator_message_accepted');
    expect(types).toContain('operator_message_delta');
    expect(types[types.length - 1]).toBe('operator_message_completed');
    const completed = events.at(-1);
    expect(completed.operatorMessageId).toBe(accepted.operatorMessageId);
    expect(completed.conversationId).toBe(accepted.conversationId);
    expect(completed.reply.replyMessageId).toBe(completed.replyMessageId);
    expect(completed.reply.text.toLowerCase()).toContain('no execution authority');
  });
});

describe('assertNoExecutionAuthority', () => {
  it('passes an orchestrator-targeted message', () => {
    expect(assertNoExecutionAuthority(msg)).toBe(msg);
  });
  it('refuses any other target', () => {
    const bad = { ...msg, target: 'executor' } as unknown as OperatorMessage;
    expect(() => assertNoExecutionAuthority(bad)).toThrow(ExecutionAuthorityError);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -w @trading-office/server`
Expected: FAIL — guard/responder modules missing.

- [ ] **Step 3: Create `apps/server/src/guard/noExecutionAuthority.ts`**

```ts
import type { OperatorMessage } from '@trading-office/office-gateway';

export class ExecutionAuthorityError extends Error {}

/**
 * The single chokepoint the operator path passes through. The office has NO
 * execution authority: an operator message may only target the orchestrator for
 * reporting. This performs no side effects and reaches no connector (there is no
 * write path to reach) — it returns the validated message or throws.
 */
export function assertNoExecutionAuthority(msg: OperatorMessage): OperatorMessage {
  if (msg.target !== 'orchestrator') {
    throw new ExecutionAuthorityError(`operator message target '${msg.target}' is not permitted (no execution authority)`);
  }
  return msg;
}
```

- [ ] **Step 4: Create `apps/server/src/operator/responder.ts`**

```ts
import { operatorReplyChunks } from '@trading-office/office-fixtures';
import type { OperatorMessage, OperatorMessageAccepted } from '@trading-office/office-gateway';
import type { OfficeEventBus } from '../events/OfficeEventBus';
import { assertNoExecutionAuthority } from '../guard/noExecutionAuthority';

const nowIso = (): string => new Date().toISOString();

let counter = 0;

/**
 * Inert operator responder. Mints paired ids, returns 'accepted', and schedules
 * a simulated reply lifecycle on the bus. It has NO connector access and makes
 * NO outbound call — the office cannot command anything.
 */
export function handleOperatorMessage(
  raw: OperatorMessage,
  bus: OfficeEventBus,
  schedule: (fn: () => void, ms: number) => void = (fn, ms) => { setTimeout(fn, ms); },
): OperatorMessageAccepted {
  const msg = assertNoExecutionAuthority(raw);
  const k = ++counter;
  const operatorMessageId = `m${k}`;
  const conversationId = `c${k}`;
  const replyMessageId = `r${k}`;

  bus.publish({ type: 'operator_message_accepted', ts: nowIso(), operatorMessageId, conversationId });

  const chunks = operatorReplyChunks(msg.text);
  let acc = '';
  chunks.forEach((chunk, i) => {
    schedule(() => {
      acc += chunk;
      bus.publish({ type: 'operator_message_delta', ts: nowIso(), operatorMessageId, conversationId, replyMessageId, textDelta: chunk });
      if (i === chunks.length - 1) {
        bus.publish({
          type: 'operator_message_completed',
          ts: nowIso(),
          operatorMessageId,
          conversationId,
          replyMessageId,
          reply: { replyMessageId, operatorMessageId, conversationId, text: acc, ts: nowIso() },
        });
      }
    }, (i + 1) * 50);
  });

  return { operatorMessageId, conversationId, status: 'accepted' };
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm run test -w @trading-office/server`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/guard apps/server/src/operator
git commit -m "feat(server): no-execution-authority guard + inert operator responder"
```

### Task C5.5: WS adapter compatibility spike (before the WS route)

A short spike to confirm the chosen Node WS adapter before building on it. The
contract is fixed regardless: if `@hono/node-ws` does not fit cleanly, swap the
Node WS wiring (e.g. a `ws.Server` attached to the `@hono/node-server` HTTP
server in `index.ts`) **without any change** to the `OfficeEvent` schema or the
`WS /api/office/events` path.

- [ ] **Step 1: Spike `@hono/node-ws`** — add a throwaway `apps/server/src/ws.spike.ts`:

```ts
import { serve } from '@hono/node-server';
import { createNodeWebSocket } from '@hono/node-ws';
import { Hono } from 'hono';

const app = new Hono();
const { upgradeWebSocket, injectWebSocket } = createNodeWebSocket({ app });
app.get('/ws', upgradeWebSocket(() => ({
  onOpen(_e, ws) { ws.send('hello'); },
  onMessage(evt, ws) { ws.send(`echo:${String(evt.data)}`); },
})));
const server = serve({ fetch: app.fetch, port: 8799 }, () => console.log('spike on :8799'));
injectWebSocket(server);
```

Run: `npx tsx apps/server/src/ws.spike.ts`, then from another shell connect (e.g. `npx wscat -c ws://localhost:8799/ws`). Confirm you receive `hello` on connect and `echo:<msg>` on send.

- [ ] **Step 2: Decide.** If it works, keep `@hono/node-ws` (the plan's default, used by Task C6). If not, switch `index.ts`/`app.ts` to a `ws.Server` attached to the Node HTTP server — the routes, contract, and `OfficeEvent` shapes do not change.

- [ ] **Step 3: Clean up**

```bash
rm -f apps/server/src/ws.spike.ts
```

### Task C6: `createOfficeApp` — HTTP routes + operator POST + WS route + CORS

**Files:**
- Create: `apps/server/src/app.ts`
- Test: `apps/server/src/app.test.ts`

- [ ] **Step 1: Write the failing route tests**

```ts
import { describe, it, expect, vi } from 'vitest';
import { OFFICE_API } from '@trading-office/office-gateway';
import { INITIAL_STATUSES, BACKTESTS } from '@trading-office/office-fixtures';
import { loadConfig } from './config';
import { OfficeEventBus } from './events/OfficeEventBus';
import { FixtureOfficeReadConnector } from './connector/FixtureOfficeReadConnector';
import { createOfficeApp } from './app';

function makeApp() {
  const config = loadConfig({});
  const bus = new OfficeEventBus();
  const connector = new FixtureOfficeReadConnector(config);
  const { app } = createOfficeApp({ connector, bus, config });
  return { app, bus, connector };
}

describe('office HTTP routes', () => {
  it('GET agent statuses returns the fixture snapshot', async () => {
    const { app } = makeApp();
    const res = await app.request(OFFICE_API.agentStatuses);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(INITIAL_STATUSES);
  });

  it('GET backtests returns the fixture list', async () => {
    const { app } = makeApp();
    expect(await (await app.request(OFFICE_API.backtests)).json()).toEqual(BACKTESTS);
  });

  it('GET agent activity reads by id', async () => {
    const { app } = makeApp();
    const body = await (await app.request(OFFICE_API.agentActivity('researcher'))).json();
    expect(body.agentId).toBe('researcher');
  });

  it('POST operator message is accepted and INERT (no connector read, only an accepted event synchronously)', async () => {
    const { app, bus, connector } = makeApp();
    const spy = vi.spyOn(connector, 'getAgentStatuses');
    const seen: string[] = [];
    bus.subscribe((e) => seen.push(e.type));
    const res = await app.request(OFFICE_API.operatorMessages, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'pause all bots', source: 'web', target: 'orchestrator', floorId: 'trading-lab' }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe('accepted');
    expect(body.operatorMessageId).toBeTruthy();
    expect(seen).toEqual(['operator_message_accepted']); // deltas are scheduled later
    expect(spy).not.toHaveBeenCalled();                  // never reached the connector
  });

  it('POST operator message rejects a malformed body with the error shape', async () => {
    const { app } = makeApp();
    const res = await app.request(OFFICE_API.operatorMessages, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nope: true }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('bad_request');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -w @trading-office/server`
Expected: FAIL — cannot find `./app`.

- [ ] **Step 3: Create `apps/server/src/app.ts`**

```ts
import { createNodeWebSocket } from '@hono/node-ws';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { OFFICE_API, operatorMessageSchema } from '@trading-office/office-gateway';
import type { OfficeEvent } from '@trading-office/office-gateway';
import type { OfficeServerConfig } from './config';
import type { OfficeReadConnector } from './connector/OfficeReadConnector';
import type { OfficeEventBus } from './events/OfficeEventBus';
import { handleOperatorMessage } from './operator/responder';

const nowIso = (): string => new Date().toISOString();

export interface OfficeAppDeps {
  connector: OfficeReadConnector;
  bus: OfficeEventBus;
  config: OfficeServerConfig;
}

export function createOfficeApp(deps: OfficeAppDeps) {
  const app = new Hono();
  const { upgradeWebSocket, injectWebSocket } = createNodeWebSocket({ app });

  app.use('*', cors({ origin: deps.config.corsOrigin }));

  app.get(OFFICE_API.agentStatuses, async (c) => c.json(await deps.connector.getAgentStatuses()));
  app.get(OFFICE_API.agentActivityPattern, async (c) => c.json(await deps.connector.getAgentActivity(c.req.param('agentId'))));
  app.get(OFFICE_API.hypotheses, async (c) => c.json(await deps.connector.getHypotheses()));
  app.get(OFFICE_API.backtests, async (c) => c.json(await deps.connector.getBacktests()));
  app.get(OFFICE_API.bots, async (c) => c.json(await deps.connector.getBotHealth()));
  app.get(OFFICE_API.knowledge, async (c) => c.json(await deps.connector.getKnowledge()));
  app.get(OFFICE_API.infra, async (c) => c.json(await deps.connector.getInfraStatus()));

  app.post(OFFICE_API.operatorMessages, async (c) => {
    const parsed = operatorMessageSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: { code: 'bad_request', message: 'invalid operator message' } }, 400);
    }
    return c.json(handleOperatorMessage(parsed.data, deps.bus));
  });

  app.get(
    OFFICE_API.events,
    upgradeWebSocket(() => {
      let off: (() => void) | null = null;
      return {
        async onOpen(_evt, ws) {
          const snapshot: OfficeEvent = { type: 'agent_statuses_snapshot', ts: nowIso(), statuses: await deps.connector.getAgentStatuses() };
          ws.send(JSON.stringify(snapshot));
          off = deps.bus.subscribe((e) => ws.send(JSON.stringify(e)));
        },
        onClose() { off?.(); off = null; },
      };
    }),
  );

  return { app, injectWebSocket };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -w @trading-office/server`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/app.ts apps/server/src/app.test.ts
git commit -m "feat(server): Hono app — snapshot GETs, inert operator POST, WS route, CORS"
```

### Task C7: Bootstrap (`index.ts`) + WS integration test

**Files:**
- Create: `apps/server/src/index.ts`
- Test: `apps/server/src/ws.test.ts`

- [ ] **Step 1: Write the failing WS integration test**

```ts
import { describe, it, expect } from 'vitest';
import { serve } from '@hono/node-server';
import { WebSocket } from 'ws';
import type { OfficeEvent } from '@trading-office/office-gateway';
import { OFFICE_API } from '@trading-office/office-gateway';
import { loadConfig } from './config';
import { OfficeEventBus } from './events/OfficeEventBus';
import { FixtureOfficeReadConnector } from './connector/FixtureOfficeReadConnector';
import { createOfficeApp } from './app';

describe('WS /api/office/events', () => {
  it('sends a snapshot then live events, and unsubscribes on close', async () => {
    const config = { ...loadConfig({}), eventTickMs: 20 };
    const bus = new OfficeEventBus();
    const connector = new FixtureOfficeReadConnector(config);
    const stopProducer = connector.start((e) => bus.publish(e));
    const { app, injectWebSocket } = createOfficeApp({ connector, bus, config });

    const port: number = await new Promise((resolve) => {
      const s = serve({ fetch: app.fetch, port: 0 }, (info) => resolve(info.port));
      injectWebSocket(s);
      // keep a handle for cleanup
      (globalThis as any).__srv = s;
    });

    const messages: OfficeEvent[] = [];
    const ws = new WebSocket(`ws://localhost:${port}${OFFICE_API.events}`);
    await new Promise<void>((resolve, reject) => {
      ws.on('message', (data) => {
        messages.push(JSON.parse(data.toString()));
        if (messages.length >= 2) resolve();
      });
      ws.on('error', reject);
      setTimeout(() => reject(new Error('WS timeout')), 2000);
    });

    expect(messages[0]!.type).toBe('agent_statuses_snapshot');
    expect(messages.length).toBeGreaterThanOrEqual(2);
    expect(bus.size).toBe(1);

    ws.close();
    await new Promise((r) => setTimeout(r, 80));
    expect(bus.size).toBe(0);

    stopProducer();
    await new Promise<void>((r) => (globalThis as any).__srv.close(() => r()));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -w @trading-office/server`
Expected: FAIL initially only if `app`/`injectWebSocket` WS wiring is wrong; if Task C6 is correct this test may already pass. Either way, proceed to add the bootstrap.

- [ ] **Step 3: Create `apps/server/src/index.ts`** (the runnable entry)

```ts
import { serve } from '@hono/node-server';
import type { OfficeEvent } from '@trading-office/office-gateway';
import { createOfficeApp } from './app';
import { loadConfig } from './config';
import { FixtureOfficeReadConnector } from './connector/FixtureOfficeReadConnector';
import { OfficeEventBus } from './events/OfficeEventBus';

const nowIso = (): string => new Date().toISOString();

const config = loadConfig();
const bus = new OfficeEventBus();
const connector = new FixtureOfficeReadConnector(config);
const stopProducer = connector.start((e) => bus.publish(e));
const heartbeat = setInterval(() => {
  const e: OfficeEvent = { type: 'heartbeat', ts: nowIso() };
  bus.publish(e);
}, config.heartbeatMs);

const { app, injectWebSocket } = createOfficeApp({ connector, bus, config });
const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`office server listening on :${info.port}`);
});
injectWebSocket(server);

const shutdown = (): void => {
  clearInterval(heartbeat);
  stopProducer();
  server.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

- [ ] **Step 4: Run the WS test + typecheck**

Run: `npm run test -w @trading-office/server && npm run typecheck -w @trading-office/server`
Expected: PASS, no type errors.

- [ ] **Step 5: Manually smoke the server (optional but recommended)**

Run: `npm run dev:server` (added in Task E3) — or `npm run start -w @trading-office/server`
Expected: logs `office server listening on :8787`. Ctrl-C stops it cleanly.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/index.ts apps/server/src/ws.test.ts
git commit -m "feat(server): runnable bootstrap (serve + WS inject + heartbeat) and WS integration test"
```

---

## Task Group D — `apps/web` (client: HttpOfficeGateway, mode switch, operator panel)

> Ordering keeps the app compiling after every commit: additive pieces (deps,
> store reducer, transcript reducer, HttpOfficeGateway) land first; the single
> contract **flip** (Task D5) rewires the mock + all consumers together.

### Task D1: Add contract + fixtures dependencies

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Add dependencies** to `apps/web/package.json` (`dependencies` block) and a dev-only dependency on the server for the conformance test:

In `"dependencies"`, add:
```json
    "@trading-office/office-fixtures": "*",
    "@trading-office/office-gateway": "*",
```
In `"devDependencies"`, add:
```json
    "@trading-office/server": "*",
```

- [ ] **Step 2: Install**

Run: `npm install`
Expected: completes; symlinks for the three workspace packages exist under `apps/web/node_modules/@trading-office/`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json package-lock.json
git commit -m "chore(web): depend on office-gateway + office-fixtures (+ server for conformance test)"
```

### Task D2: `OfficeRuntimeStore.reduce(event)` (status events only)

**Files:**
- Modify: `apps/web/src/runtime/OfficeRuntimeStore.ts`
- Test: `apps/web/src/runtime/OfficeRuntimeStore.test.ts`

- [ ] **Step 1: Write the failing test** (`OfficeRuntimeStore.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import { OfficeRuntimeStore } from './OfficeRuntimeStore';

describe('OfficeRuntimeStore.reduce', () => {
  it('applies a snapshot then a single status change', () => {
    const store = new OfficeRuntimeStore();
    store.reduce({ type: 'agent_statuses_snapshot', ts: '1', statuses: { boss: 'thinking', analyst: 'idle' } });
    expect(store.getSnapshot().statuses).toEqual({ boss: 'thinking', analyst: 'idle' });
    store.reduce({ type: 'agent_status_changed', ts: '2', agentId: 'analyst', status: 'running' });
    expect(store.getSnapshot().statuses.analyst).toBe('running');
  });

  it('ignores non-status events (stays narrow — not a god-object)', () => {
    const store = new OfficeRuntimeStore();
    store.reduce({ type: 'agent_statuses_snapshot', ts: '1', statuses: { boss: 'thinking' } });
    store.reduce({ type: 'heartbeat', ts: '2' });
    store.reduce({ type: 'agent_trace_appended', ts: '3', agentId: 'boss', line: { ts: '3', level: 'info', text: 'x' } });
    expect(store.getSnapshot().statuses).toEqual({ boss: 'thinking' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -w @trading-office/web`
Expected: FAIL — `reduce` is not a function.

- [ ] **Step 3: Add the `reduce` method** to `apps/web/src/runtime/OfficeRuntimeStore.ts`. Change the top import line and add the method.

Change the import at the top from:
```ts
import type { AgentStatus, AgentStatusMap } from './types';
```
to:
```ts
import type { AgentStatus, AgentStatusMap, OfficeEvent } from './types';
```

Add this method to the `OfficeRuntimeStore` class (e.g. just after `setStatuses`):
```ts
  /** Narrow reducer: only floor-shell status state. Other events are panel-local. */
  reduce(e: OfficeEvent): void {
    if (e.type === 'agent_statuses_snapshot') this.setStatuses(e.statuses);
    else if (e.type === 'agent_status_changed') this.setStatus(e.agentId, e.status);
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -w @trading-office/web`
Expected: PASS. (`OfficeEvent` resolves because `types.ts` re-exports the contract after Task D5; until then add a temporary `import type { OfficeEvent } from '@trading-office/office-gateway';` — but D5 lands the re-export, so prefer running this task's test after D5 if typecheck complains. The pure reducer logic is what this task verifies.)

> Note: `types.ts` becomes a re-export of the contract in Task D5. If you run D2 strictly before D5, import `OfficeEvent` directly from `@trading-office/office-gateway` here, then simplify to `./types` after D5. Either resolves to the same type.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/runtime/OfficeRuntimeStore.ts apps/web/src/runtime/OfficeRuntimeStore.test.ts
git commit -m "feat(web): OfficeRuntimeStore.reduce — narrow status-event reducer"
```

### Task D3: Operator transcript reducer (pure)

**Files:**
- Create: `apps/web/src/floor/panels/operatorTranscript.ts`
- Test: `apps/web/src/floor/panels/operatorTranscript.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { transcriptReducer, emptyTranscript } from './operatorTranscript';

describe('transcriptReducer', () => {
  it('drives a turn through submit → accepted → delta → completed', () => {
    let s = emptyTranscript;
    s = transcriptReducer(s, { kind: 'submit', localId: 'L1', text: 'status?' });
    expect(s.turns[0]!.status).toBe('pending');
    s = transcriptReducer(s, { kind: 'accepted', localId: 'L1', operatorMessageId: 'm1', conversationId: 'c1' });
    expect(s.turns[0]!.status).toBe('streaming');
    s = transcriptReducer(s, { kind: 'event', event: { type: 'operator_message_delta', ts: '1', operatorMessageId: 'm1', conversationId: 'c1', replyMessageId: 'r1', textDelta: 'All ' } });
    s = transcriptReducer(s, { kind: 'event', event: { type: 'operator_message_delta', ts: '2', operatorMessageId: 'm1', conversationId: 'c1', replyMessageId: 'r1', textDelta: 'good.' } });
    expect(s.turns[0]!.replyText).toBe('All good.');
    s = transcriptReducer(s, { kind: 'event', event: { type: 'operator_message_completed', ts: '3', operatorMessageId: 'm1', conversationId: 'c1', replyMessageId: 'r1', reply: { replyMessageId: 'r1', operatorMessageId: 'm1', conversationId: 'c1', text: 'All good. (no execution authority)', ts: '3' } } });
    expect(s.turns[0]!.status).toBe('completed');
    expect(s.turns[0]!.replyText).toContain('no execution authority');
  });

  it('ignores events for messages it does not know', () => {
    const before = transcriptReducer(emptyTranscript, { kind: 'submit', localId: 'L1', text: 'x' });
    const after = transcriptReducer(before, { kind: 'event', event: { type: 'operator_message_delta', ts: '1', operatorMessageId: 'other', conversationId: 'c9', replyMessageId: 'r9', textDelta: 'zzz' } });
    expect(after).toEqual(before);
  });

  it('marks a turn failed', () => {
    let s = transcriptReducer(emptyTranscript, { kind: 'submit', localId: 'L1', text: 'x' });
    s = transcriptReducer(s, { kind: 'accepted', localId: 'L1', operatorMessageId: 'm1', conversationId: 'c1' });
    s = transcriptReducer(s, { kind: 'event', event: { type: 'operator_message_failed', ts: '2', operatorMessageId: 'm1', conversationId: 'c1', error: { code: 'x', message: 'boom' } } });
    expect(s.turns[0]!.status).toBe('failed');
    expect(s.turns[0]!.error).toBe('boom');
  });

  it('marks a turn failed when the HTTP submit itself fails', () => {
    let s = transcriptReducer(emptyTranscript, { kind: 'submit', localId: 'L1', text: 'x' });
    s = transcriptReducer(s, { kind: 'submit_failed', localId: 'L1', error: 'server unavailable' });
    expect(s.turns[0]!.status).toBe('failed');
    expect(s.turns[0]!.error).toBe('server unavailable');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -w @trading-office/web`
Expected: FAIL — cannot find `./operatorTranscript`.

- [ ] **Step 3: Create `apps/web/src/floor/panels/operatorTranscript.ts`**

```ts
import type { OfficeEvent } from '@trading-office/office-gateway';

export interface OperatorTurn {
  localId: string;
  operatorMessageId: string | null;
  conversationId: string | null;
  userText: string;
  replyText: string;
  status: 'pending' | 'streaming' | 'completed' | 'failed';
  error?: string;
}

export interface OperatorTranscriptState {
  turns: OperatorTurn[];
}

export const emptyTranscript: OperatorTranscriptState = { turns: [] };

export type TranscriptAction =
  | { kind: 'submit'; localId: string; text: string }
  | { kind: 'accepted'; localId: string; operatorMessageId: string; conversationId: string }
  | { kind: 'submit_failed'; localId: string; error: string }
  | { kind: 'event'; event: OfficeEvent };

function mapById(
  state: OperatorTranscriptState,
  operatorMessageId: string,
  fn: (t: OperatorTurn) => OperatorTurn,
): OperatorTranscriptState {
  if (!state.turns.some((t) => t.operatorMessageId === operatorMessageId)) return state;
  return { turns: state.turns.map((t) => (t.operatorMessageId === operatorMessageId ? fn(t) : t)) };
}

export function transcriptReducer(state: OperatorTranscriptState, action: TranscriptAction): OperatorTranscriptState {
  switch (action.kind) {
    case 'submit':
      return {
        turns: [
          ...state.turns,
          { localId: action.localId, operatorMessageId: null, conversationId: null, userText: action.text, replyText: '', status: 'pending' },
        ],
      };
    case 'accepted':
      return {
        turns: state.turns.map((t) =>
          t.localId === action.localId
            ? { ...t, operatorMessageId: action.operatorMessageId, conversationId: action.conversationId, status: 'streaming' }
            : t,
        ),
      };
    case 'submit_failed':
      return {
        turns: state.turns.map((t) =>
          t.localId === action.localId ? { ...t, status: 'failed', error: action.error } : t,
        ),
      };
    case 'event': {
      const e = action.event;
      if (e.type === 'operator_message_delta') return mapById(state, e.operatorMessageId, (t) => ({ ...t, replyText: t.replyText + e.textDelta, status: 'streaming' }));
      if (e.type === 'operator_message_completed') return mapById(state, e.operatorMessageId, (t) => ({ ...t, replyText: e.reply.text, status: 'completed' }));
      if (e.type === 'operator_message_failed') return mapById(state, e.operatorMessageId, (t) => ({ ...t, status: 'failed', error: e.error.message }));
      return state;
    }
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -w @trading-office/web`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/floor/panels/operatorTranscript.ts apps/web/src/floor/panels/operatorTranscript.test.ts
git commit -m "feat(web): pure operator transcript reducer"
```

### Task D4: `HttpOfficeGateway` (HTTP reads + one WS, injectable transport)

**Files:**
- Create: `apps/web/src/runtime/HttpOfficeGateway.ts`
- Test: `apps/web/src/runtime/HttpOfficeGateway.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { OFFICE_API } from '@trading-office/office-gateway';
import { INITIAL_STATUSES, BACKTESTS } from '@trading-office/office-fixtures';
import { HttpOfficeGateway } from './HttpOfficeGateway';

function jsonResponse(data: unknown, ok = true, status = 200): Response {
  return { ok, status, statusText: 'x', json: async () => data } as unknown as Response;
}

class FakeWs {
  closed = false;
  private listeners: Record<string, ((ev: unknown) => void)[]> = {};
  constructor(public url: string) {}
  addEventListener(type: string, fn: (ev: unknown) => void) { (this.listeners[type] ??= []).push(fn); }
  removeEventListener() {}
  send() {}
  close() { this.closed = true; (this.listeners['close'] ?? []).forEach((f) => f({})); }
  emit(event: unknown) { (this.listeners['message'] ?? []).forEach((f) => f({ data: JSON.stringify(event) })); }
}

describe('HttpOfficeGateway', () => {
  it('reads snapshots over HTTP', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith(OFFICE_API.agentStatuses)) return jsonResponse(INITIAL_STATUSES);
      if (url.endsWith(OFFICE_API.backtests)) return jsonResponse(BACKTESTS);
      return jsonResponse(null, false, 404);
    });
    const gw = new HttpOfficeGateway({ baseUrl: 'http://x', fetchImpl });
    expect(await gw.getAgentStatuses()).toEqual(INITIAL_STATUSES);
    expect(await gw.getBacktests()).toEqual(BACKTESTS);
  });

  it('throws on a non-2xx (no silent fallback)', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { code: 'down', message: 'server unavailable' } }, false, 503));
    const gw = new HttpOfficeGateway({ baseUrl: 'http://x', fetchImpl });
    await expect(gw.getHypotheses()).rejects.toThrow(/server unavailable/);
  });

  it('fans out WS events over a single connection and closes on last unsubscribe', () => {
    const sockets: FakeWs[] = [];
    const gw = new HttpOfficeGateway({
      baseUrl: 'http://x',
      fetchImpl: async () => jsonResponse(null),
      wsFactory: (url) => { const s = new FakeWs(url); sockets.push(s); return s; },
    });
    const a: string[] = [];
    const b: string[] = [];
    const offA = gw.subscribeOfficeEvents!((e) => a.push(e.type));
    const offB = gw.subscribeOfficeEvents!((e) => b.push(e.type));
    expect(sockets.length).toBe(1);
    sockets[0]!.emit({ type: 'heartbeat', ts: '1' });
    expect(a).toEqual(['heartbeat']);
    expect(b).toEqual(['heartbeat']);
    offA(); offB();
    expect(sockets[0]!.closed).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -w @trading-office/web`
Expected: FAIL — cannot find `./HttpOfficeGateway`.

- [ ] **Step 3: Create `apps/web/src/runtime/HttpOfficeGateway.ts`**

```ts
import {
  OFFICE_API,
  officeEventSchema,
  type AgentActivity,
  type AgentStatusMap,
  type BacktestSummary,
  type BotHealth,
  type Hypothesis,
  type InfraStatus,
  type KnowledgeEntry,
  type OfficeEvent,
  type OfficeGateway,
  type OperatorMessage,
  type OperatorMessageAccepted,
} from '@trading-office/office-gateway';

interface WebSocketLike {
  send(data: string): void;
  close(): void;
  addEventListener(type: 'message' | 'open' | 'close' | 'error', listener: (ev: { data?: unknown }) => void): void;
  removeEventListener(type: string, listener: (ev: unknown) => void): void;
}

export interface HttpOfficeGatewayOptions {
  baseUrl: string;
  wsUrl?: string;
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
  wsFactory?: (url: string) => WebSocketLike;
}

const MAX_RECONNECT_ATTEMPTS = 6;

export class HttpOfficeGateway implements OfficeGateway {
  private readonly baseUrl: string;
  private readonly wsUrl: string;
  private readonly fetchImpl: (input: string, init?: RequestInit) => Promise<Response>;
  private readonly wsFactory: (url: string) => WebSocketLike;

  private ws: WebSocketLike | null = null;
  private readonly subscribers = new Set<(e: OfficeEvent) => void>();
  private attempts = 0;
  private closedByUs = false;

  constructor(opts: HttpOfficeGatewayOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.wsUrl = (opts.wsUrl ?? this.baseUrl.replace(/^http/, 'ws')).replace(/\/$/, '');
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
    this.wsFactory = opts.wsFactory ?? ((url) => new WebSocket(url) as unknown as WebSocketLike);
  }

  private async get<T>(path: string): Promise<T> {
    const res = await this.fetchImpl(this.baseUrl + path);
    if (!res.ok) {
      let detail = res.statusText;
      try { const body = (await res.json()) as { error?: { message?: string } }; detail = body?.error?.message ?? detail; } catch { /* keep statusText */ }
      throw new Error(`office GET ${path} failed: ${res.status} ${detail}`); // surfaced — NO silent fallback
    }
    return (await res.json()) as T;
  }

  getAgentStatuses() { return this.get<AgentStatusMap>(OFFICE_API.agentStatuses); }
  getAgentActivity(agentId: string) { return this.get<AgentActivity>(OFFICE_API.agentActivity(agentId)); }
  getHypotheses() { return this.get<Hypothesis[]>(OFFICE_API.hypotheses); }
  getBacktests() { return this.get<BacktestSummary[]>(OFFICE_API.backtests); }
  getBotHealth() { return this.get<BotHealth[]>(OFFICE_API.bots); }
  getKnowledge() { return this.get<KnowledgeEntry[]>(OFFICE_API.knowledge); }
  getInfraStatus() { return this.get<InfraStatus>(OFFICE_API.infra); }

  async sendOperatorMessage(msg: OperatorMessage): Promise<OperatorMessageAccepted> {
    const res = await this.fetchImpl(this.baseUrl + OFFICE_API.operatorMessages, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(msg),
    });
    if (!res.ok) throw new Error(`operator message rejected: ${res.status}`);
    return (await res.json()) as OperatorMessageAccepted;
  }

  subscribeOfficeEvents(cb: (e: OfficeEvent) => void): () => void {
    this.subscribers.add(cb);
    if (!this.ws) this.connect();
    return () => {
      this.subscribers.delete(cb);
      if (this.subscribers.size === 0) this.disconnect();
    };
  }

  private connect(): void {
    this.closedByUs = false;
    const ws = this.wsFactory(this.wsUrl + OFFICE_API.events);
    this.ws = ws;
    ws.addEventListener('open', () => { this.attempts = 0; });
    ws.addEventListener('message', (ev) => {
      const raw = typeof ev.data === 'string' ? safeJson(ev.data) : ev.data;
      const parsed = officeEventSchema.safeParse(raw);
      if (parsed.success) for (const fn of this.subscribers) fn(parsed.data);
    });
    ws.addEventListener('close', () => { this.ws = null; this.scheduleReconnect(); });
    ws.addEventListener('error', () => { /* do not swallow in the UI: a close + reconnect follows */ });
  }

  private scheduleReconnect(): void {
    if (this.closedByUs || this.subscribers.size === 0) return;
    if (this.attempts >= MAX_RECONNECT_ATTEMPTS) return; // bounded — no infinite loop, no offline queue
    this.attempts += 1;
    const delay = Math.min(8000, 300 * 2 ** (this.attempts - 1));
    setTimeout(() => { if (!this.ws && this.subscribers.size > 0) this.connect(); }, delay);
  }

  private disconnect(): void {
    this.closedByUs = true;
    this.ws?.close();
    this.ws = null;
  }
}

function safeJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -w @trading-office/web`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/runtime/HttpOfficeGateway.ts apps/web/src/runtime/HttpOfficeGateway.test.ts
git commit -m "feat(web): HttpOfficeGateway — HTTP snapshots + single WS, no silent fallback"
```

### Task D5: The contract flip — re-export shims, evolved mock, operator panel, mode switch

This single task rewires the app onto the new contract and ends green. Do all edits, then run typecheck + the full web test suite.

**Files:**
- Modify: `apps/web/src/runtime/OfficeGateway.ts` (→ re-export)
- Modify: `apps/web/src/runtime/types.ts` (→ re-export)
- Delete: `apps/web/src/runtime/fixtures.ts`
- Rewrite: `apps/web/src/runtime/MockOfficeGateway.ts`
- Rewrite: `apps/web/src/runtime/MockOfficeGateway.test.ts`
- Modify: `apps/web/src/runtime/RuntimeContext.tsx` (mode switch)
- Create: `apps/web/src/env.d.ts`
- Create: `apps/web/src/floor/panels/OperatorChatPanel.tsx`
- Delete: `apps/web/src/floor/panels/BossCommandPanel.tsx`
- Modify: `apps/web/src/floor/floorSelection.ts` (+ `operator?` shell route)
- Modify: `apps/web/src/floor/panelRegistry.ts`
- Modify: `apps/web/src/floor/panelRegistry.test.ts`
- Modify: `apps/web/src/floor/PanelDock.tsx`
- Modify: `apps/web/src/floor/FloorScreen.tsx`

- [ ] **Step 1: Re-point `apps/web/src/runtime/OfficeGateway.ts`** — replace the whole file with:

```ts
export type { OfficeGateway } from '@trading-office/office-gateway';
```

- [ ] **Step 2: Re-point `apps/web/src/runtime/types.ts`** — replace the whole file with:

```ts
// Single source of truth for the wire contract is the office-gateway package.
// Re-export its types so existing app imports (`'../runtime/types'`) keep working.
export type * from '@trading-office/office-gateway';
```

- [ ] **Step 3: Delete the local fixtures module**

```bash
git rm apps/web/src/runtime/fixtures.ts
```

- [ ] **Step 4: Rewrite `apps/web/src/runtime/MockOfficeGateway.ts`**

```ts
import type { OfficeGateway } from './OfficeGateway';
import type {
  AgentActivity,
  AgentStatusMap,
  BacktestSummary,
  BotHealth,
  Hypothesis,
  InfraStatus,
  KnowledgeEntry,
  OfficeEvent,
  OperatorMessage,
  OperatorMessageAccepted,
} from './types';
import {
  agentActivity,
  BACKTESTS,
  BOTS,
  HYPOTHESES,
  INFRA,
  INITIAL_STATUSES,
  KNOWLEDGE,
  operatorReplyChunks,
  STATUS_POOLS,
} from '@trading-office/office-fixtures';

const nowIso = (): string => new Date().toISOString();

export class MockOfficeGateway implements OfficeGateway {
  private readonly latencyMs: number;
  private readonly tickMs: number;
  private counter = 0;
  private readonly subscribers = new Set<(e: OfficeEvent) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private tick = 0;

  constructor(opts: { latencyMs?: number; tickMs?: number } = {}) {
    this.latencyMs = opts.latencyMs ?? 220;
    this.tickMs = opts.tickMs ?? 2600;
  }

  private delay<T>(value: T): Promise<T> {
    return this.latencyMs <= 0 ? Promise.resolve(value) : new Promise((r) => setTimeout(() => r(value), this.latencyMs));
  }
  private emit(e: OfficeEvent): void { for (const fn of this.subscribers) fn(e); }

  getAgentStatuses(): Promise<AgentStatusMap> { return this.delay({ ...INITIAL_STATUSES }); }
  getAgentActivity(agentId: string): Promise<AgentActivity> { return this.delay(agentActivity(agentId)); }
  getHypotheses(): Promise<Hypothesis[]> { return this.delay(HYPOTHESES); }
  getBacktests(): Promise<BacktestSummary[]> { return this.delay(BACKTESTS); }
  getBotHealth(): Promise<BotHealth[]> { return this.delay(BOTS); }
  getKnowledge(): Promise<KnowledgeEntry[]> { return this.delay(KNOWLEDGE); }
  getInfraStatus(): Promise<InfraStatus> { return this.delay(INFRA); }

  sendOperatorMessage(msg: OperatorMessage): Promise<OperatorMessageAccepted> {
    const k = ++this.counter;
    const operatorMessageId = `m${k}`;
    const conversationId = `c${k}`;
    const replyMessageId = `r${k}`;
    this.emit({ type: 'operator_message_accepted', ts: nowIso(), operatorMessageId, conversationId });
    const chunks = operatorReplyChunks(msg.text);
    let acc = '';
    chunks.forEach((chunk, i) => setTimeout(() => {
      acc += chunk;
      this.emit({ type: 'operator_message_delta', ts: nowIso(), operatorMessageId, conversationId, replyMessageId, textDelta: chunk });
      if (i === chunks.length - 1) {
        this.emit({ type: 'operator_message_completed', ts: nowIso(), operatorMessageId, conversationId, replyMessageId, reply: { replyMessageId, operatorMessageId, conversationId, text: acc, ts: nowIso() } });
      }
    }, (i + 1) * 120));
    return this.delay({ operatorMessageId, conversationId, status: 'accepted' });
  }

  subscribeOfficeEvents(cb: (e: OfficeEvent) => void): () => void {
    this.subscribers.add(cb);
    cb({ type: 'agent_statuses_snapshot', ts: nowIso(), statuses: { ...INITIAL_STATUSES } });
    if (!this.timer) this.timer = setInterval(() => this.tickStatuses(), this.tickMs);
    return () => {
      this.subscribers.delete(cb);
      if (this.subscribers.size === 0 && this.timer) { clearInterval(this.timer); this.timer = null; }
    };
  }

  private tickStatuses(): void {
    this.tick += 1;
    for (const id of Object.keys(STATUS_POOLS)) {
      const pool = STATUS_POOLS[id]!;
      this.emit({ type: 'agent_status_changed', ts: nowIso(), agentId: id, status: pool[this.tick % pool.length]! });
    }
  }
}
```

- [ ] **Step 5: Rewrite `apps/web/src/runtime/MockOfficeGateway.test.ts`**

```ts
import { describe, expect, it, vi, afterEach } from 'vitest';
import { MockOfficeGateway } from './MockOfficeGateway';

const gw = new MockOfficeGateway({ latencyMs: 0 });
afterEach(() => vi.useRealTimers());

describe('MockOfficeGateway', () => {
  it('returns agent activity with logs', async () => {
    const a = await gw.getAgentActivity('researcher');
    expect(a.agentId).toBe('researcher');
    expect(a.logs.length).toBeGreaterThan(0);
  });

  it('returns non-empty backtests with the right shape', async () => {
    const rows = await gw.getBacktests();
    expect(rows.length).toBeGreaterThan(0);
    expect(typeof rows[0]!.sharpe).toBe('number');
  });

  it('sendOperatorMessage is accepted and inert', async () => {
    const acc = await gw.sendOperatorMessage({ text: 'pause all bots', source: 'web', target: 'orchestrator', floorId: 'trading-lab' });
    expect(acc.status).toBe('accepted');
    expect(acc.operatorMessageId).toBeTruthy();
    expect(acc.conversationId).toBeTruthy();
  });

  it('subscribeOfficeEvents emits an initial snapshot and can be unsubscribed', () => {
    const types: string[] = [];
    const off = gw.subscribeOfficeEvents((e) => types.push(e.type));
    expect(types[0]).toBe('agent_statuses_snapshot');
    expect(typeof off).toBe('function');
    off();
  });
});
```

- [ ] **Step 6: Create `apps/web/src/env.d.ts`** (type the Vite env vars)

```ts
/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_OFFICE_MODE?: 'mock' | 'connected';
  readonly VITE_OFFICE_GATEWAY_URL?: string;
  readonly VITE_OFFICE_GATEWAY_WS_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 7: Add the mode switch to `apps/web/src/runtime/RuntimeContext.tsx`**

Change the imports block at the top to add the HTTP gateway:
```ts
import { MockOfficeGateway } from './MockOfficeGateway';
import { HttpOfficeGateway } from './HttpOfficeGateway';
import { OfficeRuntimeStore } from './OfficeRuntimeStore';
import type { OfficeGateway } from './OfficeGateway';
```

Add a `createGateway` factory above `RuntimeProvider`:
```ts
function createGateway(): OfficeGateway {
  const mode = import.meta.env.VITE_OFFICE_MODE ?? 'mock';
  if (mode === 'connected') {
    const baseUrl = import.meta.env.VITE_OFFICE_GATEWAY_URL ?? 'http://localhost:8787';
    return new HttpOfficeGateway({ baseUrl, wsUrl: import.meta.env.VITE_OFFICE_GATEWAY_WS_URL });
  }
  return new MockOfficeGateway();
}
```

Change the provider's `useMemo` from `() => ({ gateway: new MockOfficeGateway(), store: new OfficeRuntimeStore() })` to:
```ts
  const value = useMemo<RuntimeContextValue>(
    () => ({ gateway: createGateway(), store: new OfficeRuntimeStore() }),
    [],
  );
```

- [ ] **Step 8: Create `apps/web/src/floor/panels/OperatorChatPanel.tsx`**

```tsx
import { useEffect, useReducer, useRef, useState, type FormEvent } from 'react';
import { useGateway } from '../../runtime/RuntimeContext';
import { PanelChrome } from './PanelChrome';
import { emptyTranscript, transcriptReducer } from './operatorTranscript';

export function OperatorChatPanel({ onClose }: { onClose: () => void }) {
  const gateway = useGateway();
  const [state, dispatch] = useReducer(transcriptReducer, emptyTranscript);
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const localSeq = useRef(0);

  useEffect(() => {
    if (!gateway.subscribeOfficeEvents) return;
    return gateway.subscribeOfficeEvents((event) => dispatch({ kind: 'event', event }));
  }, [gateway]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    const localId = `L${(localSeq.current += 1)}`;
    dispatch({ kind: 'submit', localId, text: trimmed });
    setText('');
    setPending(true);
    try {
      const accepted = await gateway.sendOperatorMessage({ text: trimmed, source: 'web', target: 'orchestrator', floorId: 'trading-lab' });
      dispatch({ kind: 'accepted', localId, operatorMessageId: accepted.operatorMessageId, conversationId: accepted.conversationId });
    } catch (err) {
      dispatch({ kind: 'submit_failed', localId, error: err instanceof Error ? err.message : 'send failed' });
    } finally {
      setPending(false);
    }
  }

  return (
    <PanelChrome title="Operator chat · Orchestrator" badge="no execution authority" onClose={onClose}>
      <div className="chat">
        {state.turns.length === 0 && <p className="panel__state">Message the orchestrator. Read-only — no execution authority.</p>}
        {state.turns.map((t) => (
          <div key={t.localId}>
            <div className="chat__msg chat__msg--user">{t.userText}</div>
            {t.status === 'failed' ? (
              <div className="chat__msg chat__msg--assistant">Failed: {t.error}</div>
            ) : (
              (t.replyText || t.status === 'streaming') && (
                <div className="chat__msg chat__msg--assistant">{t.replyText || '…'}</div>
              )
            )}
          </div>
        ))}
      </div>
      <form className="chat__form" onSubmit={send}>
        <input className="chat__input" value={text} placeholder="Message the orchestrator…" onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="btn btn--primary" disabled={pending}>Send</button>
      </form>
    </PanelChrome>
  );
}
```

- [ ] **Step 9: Delete the old panel**

```bash
git rm apps/web/src/floor/panels/BossCommandPanel.tsx
```

- [ ] **Step 10: Add the `/operator` shell route (`floorSelection.ts`) and rewrite `panelRegistry.ts`** (boss routes like any agent; `operator-chat` comes only from the `/operator` route)

Replace `apps/web/src/floor/floorSelection.ts` with:
```ts
export interface RouteSelection {
  agentId?: string;
  panelTarget?: string;
  operator?: boolean;
}

/** Stable string key for effect deps. */
export function selectionKey(sel: RouteSelection): string {
  return `${sel.agentId ?? ''}|${sel.panelTarget ?? ''}|${sel.operator ? 'op' : ''}`;
}
```

Replace `apps/web/src/floor/panelRegistry.ts` with:
```ts
import type { RouteSelection } from './floorSelection';
import { OBJECT_PANEL_TARGETS, type ObjectPanelTarget } from './objectPanels';

export interface FloorAgentInfo {
  id: string;
  role: string;
}

export type PanelKind =
  | { kind: 'operator-chat' }
  | { kind: 'agent-activity'; agentId: string }
  | { kind: 'object'; panelTarget: ObjectPanelTarget }
  | { kind: 'exit' }
  | { kind: 'none' }
  | { kind: 'unknown'; key: string };

const KNOWN_OBJECT_PANELS = new Set<string>(OBJECT_PANEL_TARGETS);

export function resolvePanel(sel: RouteSelection, agents: FloorAgentInfo[]): PanelKind {
  if (sel.operator) return { kind: 'operator-chat' }; // global shell surface — not a floor entity
  if (sel.agentId) {
    const agent = agents.find((a) => a.id === sel.agentId);
    if (!agent) return { kind: 'unknown', key: `agent:${sel.agentId}` };
    return { kind: 'agent-activity', agentId: agent.id }; // boss included — no special case
  }
  if (sel.panelTarget) {
    if (sel.panelTarget === 'exit') return { kind: 'exit' };
    if (KNOWN_OBJECT_PANELS.has(sel.panelTarget)) {
      return { kind: 'object', panelTarget: sel.panelTarget as ObjectPanelTarget };
    }
    return { kind: 'unknown', key: `panel:${sel.panelTarget}` };
  }
  return { kind: 'none' };
}

/** The entity the scene should select/focus for a given panel (null = clear). */
export function selectedEntityId(
  kind: PanelKind,
  panelTargetToObjectId: Record<string, string>,
): string | null {
  switch (kind.kind) {
    case 'agent-activity':
      return kind.agentId;
    case 'object':
      return panelTargetToObjectId[kind.panelTarget] ?? null;
    case 'operator-chat': // global surface — selects no floor entity
      return null;
    default:
      return null;
  }
}

/** Panel kinds that occupy the right dock (exit/none never open the dock). */
export function opensDock(kind: PanelKind): boolean {
  return (
    kind.kind === 'operator-chat' ||
    kind.kind === 'agent-activity' ||
    kind.kind === 'object' ||
    kind.kind === 'unknown'
  );
}
```

- [ ] **Step 11: Replace `apps/web/src/floor/panelRegistry.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { resolvePanel, selectedEntityId, type FloorAgentInfo } from './panelRegistry';

const agents: FloorAgentInfo[] = [
  { id: 'boss', role: 'boss' },
  { id: 'researcher', role: 'researcher' },
];
const targetToObject = { 'backtest-summary': 'wall-monitor', 'infra-status': 'server-rack' };

describe('resolvePanel', () => {
  it('routes the boss to the activity panel like any other agent', () => {
    expect(resolvePanel({ agentId: 'boss' }, agents)).toEqual({ kind: 'agent-activity', agentId: 'boss' });
  });
  it('routes other agents to the activity panel', () => {
    expect(resolvePanel({ agentId: 'researcher' }, agents)).toEqual({ kind: 'agent-activity', agentId: 'researcher' });
  });
  it('opens the operator chat from the /operator shell route (not a floor entity)', () => {
    expect(resolvePanel({ operator: true }, agents)).toEqual({ kind: 'operator-chat' });
  });
  it('flags unknown agents', () => {
    expect(resolvePanel({ agentId: 'ghost' }, agents)).toEqual({ kind: 'unknown', key: 'agent:ghost' });
  });
  it('routes known object targets', () => {
    expect(resolvePanel({ panelTarget: 'backtest-summary' }, agents)).toEqual({ kind: 'object', panelTarget: 'backtest-summary' });
  });
  it('routes exit specially', () => {
    expect(resolvePanel({ panelTarget: 'exit' }, agents)).toEqual({ kind: 'exit' });
  });
  it('flags unknown object targets', () => {
    expect(resolvePanel({ panelTarget: 'nope' }, agents)).toEqual({ kind: 'unknown', key: 'panel:nope' });
  });
  it('returns none with no selection', () => {
    expect(resolvePanel({}, agents)).toEqual({ kind: 'none' });
  });
});

describe('selectedEntityId', () => {
  it('selects no floor entity for the operator chat', () => {
    expect(selectedEntityId({ kind: 'operator-chat' }, targetToObject)).toBeNull();
  });
  it('selects an agent', () => {
    expect(selectedEntityId({ kind: 'agent-activity', agentId: 'researcher' }, targetToObject)).toBe('researcher');
  });
  it('maps an object panel target to its entity id', () => {
    expect(selectedEntityId({ kind: 'object', panelTarget: 'infra-status' }, targetToObject)).toBe('server-rack');
  });
  it('selects nothing for exit / none / unknown', () => {
    expect(selectedEntityId({ kind: 'exit' }, targetToObject)).toBeNull();
    expect(selectedEntityId({ kind: 'none' }, targetToObject)).toBeNull();
    expect(selectedEntityId({ kind: 'unknown', key: 'x' }, targetToObject)).toBeNull();
  });
});
```

- [ ] **Step 12: Update `apps/web/src/floor/PanelDock.tsx`** — three edits:

Change the import `import { BossCommandPanel } from './panels/BossCommandPanel';` to `import { OperatorChatPanel } from './panels/OperatorChatPanel';`.

In `renderPanel`, change:
```tsx
    case 'boss-command':
      return <BossCommandPanel onClose={onClose} />;
```
to:
```tsx
    case 'operator-chat':
      return <OperatorChatPanel onClose={onClose} />;
```

In `panelContentKey`, change `case 'boss-command': return 'boss';` to `case 'operator-chat': return 'operator';`.

- [ ] **Step 13: Update `apps/web/src/floor/FloorScreen.tsx`** — four edits.

(a) Change the import `import { INITIAL_STATUSES } from '../runtime/fixtures';` to `import { INITIAL_STATUSES } from '@trading-office/office-fixtures';`.

(b) Add an `/operator` route match alongside the existing matches and include it in `sel` (replace the existing `const sel: RouteSelection = { agentId: ..., panelTarget: ... };`):
```ts
  const operatorMatch = useMatch(`${FLOOR_BASE_PATH}/operator`);
  const sel: RouteSelection = {
    agentId: agentMatch?.params.agentId,
    panelTarget: panelMatch?.params.panelTarget,
    operator: !!operatorMatch,
  };
```

(c) Change the status-event effect body from:
```ts
    if (!gateway.subscribeAgentStatuses) return;
    const off = gateway.subscribeAgentStatuses((statuses) => store.setStatuses(statuses));
    return off;
```
to:
```ts
    if (!gateway.subscribeOfficeEvents) return;
    const off = gateway.subscribeOfficeEvents((e) => store.reduce(e));
    return off;
```

(d) Add the global `Operator` shell control (a floating button) inside the returned `<div className="floor">`, just before `<PanelDock ... />`. **This button — not any floor agent — is what opens `OperatorChatPanel`:**
```tsx
      <button
        type="button"
        className="floor__operator-btn"
        aria-pressed={!!operatorMatch}
        onClick={() => navigate(operatorMatch ? FLOOR_BASE_PATH : `${FLOOR_BASE_PATH}/operator`)}
      >
        Operator
      </button>
```

- [ ] **Step 14: Typecheck + run the whole web suite**

Run: `npm run typecheck -w @trading-office/web && npm run test -w @trading-office/web`
Expected: no type errors; all web tests pass (existing + new). If `OfficeEvent` was imported from the package in Task D2, you may now simplify it to `./types` — optional.

- [ ] **Step 15: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): flip to office-gateway contract — operator chat panel + mode switch + event-driven floor"
```

### Task D6: Connection state + warning banner (honest connected mode)

`OfficeRuntimeStore` gains one shell-level field (the connection status);
`HttpOfficeGateway` signals connection changes; `FloorScreen` shows a banner when
degraded. This makes "no silent fallback" *visible*, not just logical.

**Files:**
- Modify: `apps/web/src/runtime/OfficeRuntimeStore.ts` (+ connection state)
- Modify: `apps/web/src/runtime/OfficeRuntimeStore.test.ts` (+ connection test)
- Modify: `apps/web/src/runtime/HttpOfficeGateway.ts` (+ subscribeConnection + transitions)
- Modify: `apps/web/src/runtime/HttpOfficeGateway.test.ts` (+ connection test)
- Modify: `apps/web/src/runtime/RuntimeContext.tsx` (wire connection; `useConnectionStatus`)
- Modify: `apps/web/src/floor/FloorScreen.tsx` (warning banner)

- [ ] **Step 1: Extend `OfficeRuntimeStore`.** Change the top of `OfficeRuntimeStore.ts`:
```ts
import type { AgentStatus, AgentStatusMap, OfficeEvent } from './types';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

export interface RuntimeState {
  statuses: AgentStatusMap;
  connection: ConnectionStatus;
}
```
Change the initial state to `private state: RuntimeState = { statuses: {}, connection: 'connected' };`. Update `setStatus` / `setStatuses` so they preserve `connection` (spread the whole state, e.g. `this.state = { ...this.state, statuses: { ...this.state.statuses, [agentId]: status } };` and `this.state = { ...this.state, statuses: { ...statuses } };`). Add the setter:
```ts
  setConnection(connection: ConnectionStatus): void {
    if (this.state.connection === connection) return;
    this.state = { ...this.state, connection };
    this.emit();
  }
```

- [ ] **Step 2: Add the store connection test** to `OfficeRuntimeStore.test.ts`:
```ts
  it('tracks shell connection state without touching statuses', () => {
    const store = new OfficeRuntimeStore();
    store.reduce({ type: 'agent_statuses_snapshot', ts: '1', statuses: { boss: 'thinking' } });
    expect(store.getSnapshot().connection).toBe('connected');
    store.setConnection('reconnecting');
    expect(store.getSnapshot().connection).toBe('reconnecting');
    expect(store.getSnapshot().statuses).toEqual({ boss: 'thinking' });
  });
```

- [ ] **Step 3: Add connection signaling to `HttpOfficeGateway`.** Add the import at the top:
```ts
import type { ConnectionStatus } from './OfficeRuntimeStore';
```
Add these members + methods to the class:
```ts
  private connectionStatus: ConnectionStatus = 'connected';
  private readonly connectionSubs = new Set<(s: ConnectionStatus) => void>();

  subscribeConnection(cb: (s: ConnectionStatus) => void): () => void {
    this.connectionSubs.add(cb);
    cb(this.connectionStatus);
    return () => { this.connectionSubs.delete(cb); };
  }

  private setConnection(s: ConnectionStatus): void {
    if (this.connectionStatus === s) return;
    this.connectionStatus = s;
    for (const cb of this.connectionSubs) cb(s);
  }
```
Wire transitions:
- in `connect()`, as the first line: `this.setConnection('connecting');`
- in the `open` listener body, add: `this.setConnection('connected');`
- in the `close` listener body, before `this.scheduleReconnect();`, add: `this.setConnection(this.attempts >= MAX_RECONNECT_ATTEMPTS ? 'disconnected' : 'reconnecting');`
- in `get()`, in the `!res.ok` branch before `throw`, add: `this.setConnection('error');`; on success (just before `return`), add: `if (!this.ws) this.setConnection('connected');`

- [ ] **Step 4: Extend the `FakeWs` test helper** in `HttpOfficeGateway.test.ts` with two methods, and add a connection test:
```ts
  // add inside class FakeWs:
  open() { (this.listeners['open'] ?? []).forEach((f) => f({})); }
  drop() { (this.listeners['close'] ?? []).forEach((f) => f({})); }
```
```ts
  it('signals connection state across the WS lifecycle', () => {
    const sockets: FakeWs[] = [];
    const gw = new HttpOfficeGateway({
      baseUrl: 'http://x',
      fetchImpl: async () => jsonResponse(null),
      wsFactory: (url) => { const s = new FakeWs(url); sockets.push(s); return s; },
    });
    const seen: string[] = [];
    gw.subscribeConnection((s) => seen.push(s));
    const off = gw.subscribeOfficeEvents!(() => {});
    expect(seen).toContain('connecting');
    sockets[0]!.open();
    expect(seen).toContain('connected');
    sockets[0]!.drop();
    expect(seen.some((s) => s === 'reconnecting' || s === 'disconnected')).toBe(true);
    off();
  });
```

- [ ] **Step 5: Wire connection into the store + expose a hook** in `RuntimeContext.tsx`. Add imports + a type guard above `RuntimeProvider`:
```ts
import { useEffect } from 'react';
import type { ConnectionStatus } from './OfficeRuntimeStore';

interface ConnectionSignaling {
  subscribeConnection(cb: (s: ConnectionStatus) => void): () => void;
}
function isConnectionSignaling(g: unknown): g is ConnectionSignaling {
  return typeof (g as { subscribeConnection?: unknown }).subscribeConnection === 'function';
}
```
Inside `RuntimeProvider`, after `value` is memoized, add:
```ts
  useEffect(() => {
    if (isConnectionSignaling(value.gateway)) {
      return value.gateway.subscribeConnection((s) => value.store.setConnection(s));
    }
    value.store.setConnection('connected'); // mock mode: always connected
  }, [value]);
```
Add the hook (next to the other hooks):
```ts
export function useConnectionStatus(): ConnectionStatus {
  const { store } = useRuntime();
  return useSyncExternalStore(store.subscribe, () => store.getSnapshot().connection);
}
```

- [ ] **Step 6: Show the warning banner in `FloorScreen.tsx`.** Add to the imports:
```ts
import { useConnectionStatus } from '../runtime/RuntimeContext';
```
Inside the component, derive a degraded flag:
```ts
  const connection = useConnectionStatus();
  const degraded = connection === 'reconnecting' || connection === 'disconnected' || connection === 'error';
```
In the returned JSX (e.g. just above `<PanelDock ... />`):
```tsx
      {degraded && (
        <div className="floor__conn-warning" role="alert">
          Connection {connection} — live data may be stale. (No fallback to mock.)
        </div>
      )}
```

- [ ] **Step 7: Typecheck + test**

Run: `npm run typecheck -w @trading-office/web && npm run test -w @trading-office/web`
Expected: PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): shell connection state + degraded-connection warning banner"
```

---

## Task Group E — integration, boundaries, env/scripts, verification

### Task E1: Conformance — `mock == connected` on deterministic snapshots

**Files:**
- Modify: `apps/server/src/app.ts` (add a fixture-wired convenience factory)
- Test: `apps/web/src/runtime/conformance.test.ts`

- [ ] **Step 1: Add `createFixtureOfficeApp` to `apps/server/src/app.ts`**

Add these runtime imports near the top (alongside the existing imports):
```ts
import { loadConfig } from './config';
import { FixtureOfficeReadConnector } from './connector/FixtureOfficeReadConnector';
import { OfficeEventBus } from './events/OfficeEventBus';
```

Append this exported factory at the end of the file:
```ts
/** Test/demo convenience: a fully fixture-wired app (config + bus + connector). */
export function createFixtureOfficeApp(env: Record<string, string | undefined> = {}) {
  const config = loadConfig(env);
  const bus = new OfficeEventBus();
  const connector = new FixtureOfficeReadConnector(config);
  const built = createOfficeApp({ connector, bus, config });
  return { ...built, bus, connector, config };
}
```

- [ ] **Step 2: Write the conformance test** (`apps/web/src/runtime/conformance.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import { createFixtureOfficeApp } from '@trading-office/server';
import { HttpOfficeGateway } from './HttpOfficeGateway';
import { MockOfficeGateway } from './MockOfficeGateway';

// Connected (real HTTP serialization, in-process Hono) must equal mock on every
// deterministic snapshot — proving the wire contract + serialization is lossless.
const { app } = createFixtureOfficeApp({ OFFICE_FIXTURE_LATENCY_MS: '0' });
const http = new HttpOfficeGateway({ baseUrl: 'http://conformance.local', fetchImpl: (url, init) => app.request(url, init) });
const mock = new MockOfficeGateway({ latencyMs: 0 });

describe('mock == connected (deterministic snapshots)', () => {
  it('agent statuses', async () => expect(await http.getAgentStatuses()).toEqual(await mock.getAgentStatuses()));
  it('agent activity', async () => expect(await http.getAgentActivity('researcher')).toEqual(await mock.getAgentActivity('researcher')));
  it('hypotheses', async () => expect(await http.getHypotheses()).toEqual(await mock.getHypotheses()));
  it('backtests', async () => expect(await http.getBacktests()).toEqual(await mock.getBacktests()));
  it('bot health', async () => expect(await http.getBotHealth()).toEqual(await mock.getBotHealth()));
  it('knowledge', async () => expect(await http.getKnowledge()).toEqual(await mock.getKnowledge()));
  it('infra', async () => expect(await http.getInfraStatus()).toEqual(await mock.getInfraStatus()));
});
```

- [ ] **Step 3: Run it**

Run: `npm run test -w @trading-office/web`
Expected: PASS (7 conformance cases). A failure means the wire path lost or reshaped data — fix the offending route/connector.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/app.ts apps/web/src/runtime/conformance.test.ts
git commit -m "test: mock == connected conformance over in-process Hono"
```

### Task E2: Import-boundary + package-purity tests (near-blocker)

**Files:**
- Test: `apps/web/src/runtime/importBoundary.test.ts`
- Test: `apps/server/src/importBoundary.test.ts`
- Test: `packages/office-gateway/src/purity.test.ts`
- Test: `packages/office-fixtures/src/purity.test.ts`

- [ ] **Step 1: `apps/web/src/runtime/importBoundary.test.ts`** (production code must not import the server, trading-lab, or trading-platform)

```ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..'); // apps/web/src

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) ? [p] : [];
  });
}
const prod = walk(SRC).filter((f) => !/\.test\.(ts|tsx)$/.test(f));

describe('apps/web production import boundary', () => {
  it.each(prod)('%s stays within the boundary', (file) => {
    const src = readFileSync(file, 'utf8');
    expect(src).not.toMatch(/from\s+['"]@trading-office\/server['"]/);
    expect(src).not.toMatch(/from\s+['"][^'"]*trading-lab(?!-floor)[^'"]*['"]/); // trading-lab-floor is allowed
    expect(src).not.toMatch(/from\s+['"][^'"]*trading-platform[^'"]*['"]/);
  });
});
```

- [ ] **Step 2: `apps/server/src/importBoundary.test.ts`** (server must not import the web app, trading-lab, or trading-platform)

```ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = dirname(fileURLToPath(import.meta.url)); // apps/server/src

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.ts$/.test(p) ? [p] : [];
  });
}
const all = walk(SRC).filter((f) => !/\.test\.ts$/.test(f));

describe('apps/server import boundary', () => {
  it.each(all)('%s stays within the boundary', (file) => {
    const src = readFileSync(file, 'utf8');
    expect(src).not.toMatch(/from\s+['"]@trading-office\/web['"]/);
    expect(src).not.toMatch(/from\s+['"][^'"]*trading-lab(?!-floor)[^'"]*['"]/);
    expect(src).not.toMatch(/from\s+['"][^'"]*trading-platform[^'"]*['"]/);
  });
});
```

- [ ] **Step 3: `packages/office-gateway/src/purity.test.ts`** (allowlist: only `zod` + the kit, plus relative imports)

```ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = dirname(fileURLToPath(import.meta.url));
const ALLOWED = new Set(['zod', '@trading-office/office-visual-kit']);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.ts$/.test(p) ? [p] : [];
  });
}
function specifiers(src: string): string[] {
  return [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);
}

describe('office-gateway is a pure contract', () => {
  it.each(walk(SRC).filter((f) => !/\.test\.ts$/.test(f)))('%s imports only zod / the kit', (file) => {
    for (const spec of specifiers(readFileSync(file, 'utf8'))) {
      if (spec.startsWith('.')) continue; // relative is fine
      expect(ALLOWED.has(spec), `forbidden import: ${spec}`).toBe(true);
    }
  });
});
```

- [ ] **Step 4: `packages/office-fixtures/src/purity.test.ts`** (allowlist: only the contract, plus relative)

```ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = dirname(fileURLToPath(import.meta.url));
const ALLOWED = new Set(['@trading-office/office-gateway']);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.ts$/.test(p) ? [p] : [];
  });
}
function specifiers(src: string): string[] {
  return [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);
}

describe('office-fixtures is pure data', () => {
  it.each(walk(SRC).filter((f) => !/\.test\.ts$/.test(f)))('%s imports only the contract', (file) => {
    for (const spec of specifiers(readFileSync(file, 'utf8'))) {
      if (spec.startsWith('.')) continue;
      expect(ALLOWED.has(spec), `forbidden import: ${spec}`).toBe(true);
    }
  });
});
```

- [ ] **Step 5: Run all four**

Run: `npm run test -w @trading-office/web -w @trading-office/server -w @trading-office/office-gateway -w @trading-office/office-fixtures`
Expected: PASS. A failure names the file + the forbidden import.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/runtime/importBoundary.test.ts apps/server/src/importBoundary.test.ts packages/office-gateway/src/purity.test.ts packages/office-fixtures/src/purity.test.ts
git commit -m "test: import-boundary + package-purity guards"
```

### Task E3: Env files + dev scripts (mock / connected)

**Files:**
- Create: `apps/server/.env.example`
- Create: `apps/web/.env.example`
- Create: `apps/web/.env.connected`
- Modify: `apps/web/package.json`
- Modify: `package.json` (root)

- [ ] **Step 1: Create `apps/server/.env.example`**

```bash
OFFICE_SERVER_PORT=8787
OFFICE_CORS_ORIGIN=http://localhost:5174
OFFICE_EVENT_TICK_MS=2600
OFFICE_HEARTBEAT_MS=15000
OFFICE_FIXTURE_LATENCY_MS=220
```

- [ ] **Step 2: Create `apps/web/.env.example`**

```bash
VITE_OFFICE_MODE=mock
VITE_OFFICE_GATEWAY_URL=http://localhost:8787
VITE_OFFICE_GATEWAY_WS_URL=ws://localhost:8787
```

- [ ] **Step 3: Create `apps/web/.env.connected`** (committed, non-secret — loaded by `vite --mode connected`)

```bash
VITE_OFFICE_MODE=connected
VITE_OFFICE_GATEWAY_URL=http://localhost:8787
VITE_OFFICE_GATEWAY_WS_URL=ws://localhost:8787
```

- [ ] **Step 4: Add the connected web scripts** to `apps/web/package.json` (`scripts` block)

```json
    "predev:web:connected": "node ../../tools/sync-floor-public.mjs apps/web/public",
    "dev:web:connected": "vite --mode connected",
```

- [ ] **Step 5: Update the root `package.json`** — add scripts + a devDependency.

In `"scripts"`, change `"test"` and add three dev scripts:
```json
    "test": "npm run test --workspaces --if-present",
    "dev:server": "npm run dev -w @trading-office/server",
    "dev:web:connected": "npm run dev:web:connected -w @trading-office/web",
    "dev:connected": "concurrently -k -n server,web \"npm:dev:server\" \"npm:dev:web:connected\"",
```
Add a `"devDependencies"` block to the root `package.json`:
```json
  "devDependencies": {
    "concurrently": "^9.1.0"
  },
```

- [ ] **Step 6: Install**

Run: `npm install`
Expected: `concurrently` is installed at the root.

- [ ] **Step 7: Commit**

```bash
git add apps/server/.env.example apps/web/.env.example apps/web/.env.connected apps/web/package.json package.json package-lock.json
git commit -m "chore: env examples + mock/connected dev scripts (concurrently)"
```

### Task E4: Full verification + smokes (the Phase 2 done-gate)

No new files — this task runs the mandatory verification subset end to end.

- [ ] **Step 1: Install clean + typecheck everything**

Run: `npm install && npm run typecheck`
Expected: every workspace typechecks (`--workspaces --if-present`), no errors.

- [ ] **Step 2: Build everything**

Run: `npm run build`
Expected: all workspaces build (web runs `tsc --noEmit && vite build`; packages/server run `tsc --noEmit`).

- [ ] **Step 3: Run the whole test suite**

Run: `npm test`
Expected: PASS across `office-gateway`, `office-fixtures`, `server`, and `web` — including: zod round-trip, fixtures-satisfy-schema, server routes, inert operator guard, WS integration, store reducer, transcript reducer, panelRegistry, HttpOfficeGateway (incl. no-silent-fallback), conformance (mock == connected), and the import-boundary/purity guards.

- [ ] **Step 4: Manual mock smoke (Phase 1 behavior unchanged)**

Run: `npm run dev` → open http://localhost:5174
Expected: sign in, enter the floor, open each panel (data loads), open the Boss desk → the **Operator chat** panel with the `no execution authority` badge; sending a message streams a canned reply. Toggle "simulate activity" → statuses animate. No console errors.

- [ ] **Step 5: Manual connected smoke (the real path)**

Run: `npm run dev:connected` → open http://localhost:5174
Expected: the server logs `office server listening on :8787`; the web app (connected mode) loads every panel via HTTP; the Operator chat streams its reply via WS; toggling "simulate activity" shows WS-driven status changes on the floor. Then **stop the server (Ctrl-C in its pane)** and interact: a visible error/connection failure surfaces — the app does **not** silently fall back to mock.

- [ ] **Step 6: Confirm no Phase 1 regression**

Run: `git status` (clean) and re-run `npm test`
Expected: still green. Phase 2 is done.

---

## Self-Review (against the spec)

**Spec coverage** — every spec section maps to at least one task:

| Spec § | Requirement | Task(s) |
| --- | --- | --- |
| §1 | workspace structure / dependency rules / WS adapter | A1, B1, C1, D1, E2 (boundary), E3 |
| §2 | contract (DTO, operator model, routes, OfficeEvent, error, zod) | A1–A3 |
| §3 | shared fixtures | B1–B2 |
| §4 | server: read-only port, fixture connector, inert operator path, bus, producer, guard, WS | C2–C7 |
| §5 | client: HttpOfficeGateway, evolved mock, narrow store reducer + connection state, OperatorChatPanel (shell surface), mode switch, no-silent-fallback + warning | D2–D6 |
| §6 | no-execution-authority (consolidated) | C5 (guard) + C6 (inert route test) + D4 (no-fallback) |
| §7 | env / dev scripts | E3 |
| §8 | tests #1–#12 | #1/#2/#3 A2–A3,B2,E4 · #4/#5 C6,C5 · #6 E1 · #7 D2 · #8 D3 · #9 D5 · #10 D4+D6 · #11 C7 · #12 E2 |
| §9 | out of scope | respected throughout (no real data/LLM/exec/platform/auth/Postgres/Redis) |
| §10 | Phase 3 hooks (documentation) | already in the committed **spec** (§10); the port's doc comment in C4 points to it — no code produced here by design |
| §11 | build order | Task Groups A→B→C→D→E mirror it |

**Placeholder scan:** none — every code/test step carries complete code and exact commands.

**Type consistency:** method names are identical across the contract, mock, HTTP client, connector port, and server routes (`getAgentStatuses` / `getAgentActivity` / `getHypotheses` / `getBacktests` / `getBotHealth` / `getKnowledge` / `getInfraStatus` / `sendOperatorMessage` / `subscribeOfficeEvents`); route constants come from one source (`OFFICE_API`); the `OfficeEvent` discriminated union and the zod `officeEventSchema` are kept in lockstep (events.ts infers from schemas.ts); the panel kind is `'operator-chat'` everywhere (registry, dock, tests).

**One sanctioned boundary nuance:** the conformance test (E1) imports `@trading-office/server` as a **devDependency** of `apps/web` to exercise the in-process Hono app — exactly as spec §8 #6 requires. The import-boundary guard (E2) therefore scopes the `apps/web ⇏ apps/server` rule to **production** files (it excludes `*.test.*`). Production code never crosses; the dev-only conformance test is the single allowed crossing.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-13-trading-office-phase-2-office-gateway-event-stream.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
