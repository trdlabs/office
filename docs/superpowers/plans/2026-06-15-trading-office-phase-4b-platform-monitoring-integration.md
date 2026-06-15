# Phase 4b — Trading Office Platform Monitoring Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only `PlatformMonitoringConnector` so the office server consumes the merged `trading-platform 035` Ops Read API and closes `BotHealthPanel` (rows ← `/ops/runs`) + the platform part of `InfraStatusPanel` (5 `platform-*` infra domains ← `/ops/health/*` + `/ops/coverage` + `/ops/discover`).

**Architecture:** A new `connector/platform/` slice (HTTP client + DTO mirror + mappers + connector + wiring) mirrors the existing `connector/tradinglab/` layout. The platform connector is composed inside `createTradingLabWiring` (auto-built when `config.platform.enabled`, injectable in tests); `CompositeOfficeReadConnector.getBotHealth` routes to it and `InfraAggregator` appends its services+sources (closing the hardcoded `bot-health` gap). GET-only `/ops/*`, browser never sees platform URL/token, honest degradation, empty ≠ gap.

**Tech Stack:** TypeScript (NodeNext ESM), Vitest 3 (co-located `*.test.ts`, run via `vitest run`), Hono server, zod (`@trading-office/office-gateway`). Web is React (Vitest, no jsdom/testing-library — panels are not unit-tested).

---

## Conventions (read before starting)

- **Repo:** all paths relative to `/home/alexxxnikolskiy/projects/trading-office`. Work on branch `phase-4b-platform-monitoring-integration` (already created).
- **Spec (SSOT):** `docs/superpowers/specs/2026-06-15-trading-office-phase-4b-platform-monitoring-integration-design.md`.
- **Test runner = Vitest 3.** Co-located `*.test.ts`. Commands:
  - single server test: `cd apps/server && npx vitest run src/<path>.test.ts` (or `npx vitest run -t "<name>"`).
  - whole server suite: `npm run test -w @trading-office/server`.
  - server typecheck: `npm run typecheck -w @trading-office/server` (= `tsc --noEmit`; this is also `build`).
  - web suite (conformance): `npm run test -w @trading-office/web` (= `vitest run`).
  - office-gateway suite: `npm run test -w @trading-office/office-gateway`.
- **Test idiom (mirror `apps/server/src/connector/createTradingLabWiring.test.ts`):** `import { describe, it, expect } from 'vitest';`; fake fetch = `(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch`; helper `const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });`; config via `loadConfig({ ...envOverrides })`; inject `now`/`nowMs`/`fetchImpl` as deps (no global mocks).
- **Errors:** the office error is `OfficeUpstreamError` (`Error` + `office: { code: 'upstream_unavailable'|'upstream_unauthorized'|'upstream_bad_request'; message }`), **thrown**. The platform client mirrors `tradinglab/TradingLabHttpClient.ts` and defines its own copy inline (matches the existing per-client pattern; no shared module, no edit to trading-lab).
- **No `index.ts` barrel** in `connector/tradinglab/` — mirror that (deep imports) for `connector/platform/`.
- **Import boundary already covers `trading-platform`** — `apps/server/src/importBoundary.test.ts` + `apps/web/src/runtime/importBoundary.test.ts` already forbid `*trading-platform*` imports from web. No new boundary test needed; the platform connector lives under `apps/server` (server may import it; web may not).
- **Honesty invariants:** GET-only; `getBotHealth()` returns `[]` (never throws) on platform error; **empty ≠ gap**; a platform failure is `gap`/`error`, never rendered as empty; never fabricate `live`/healthy.
- **Fixture trap:** in `office-fixtures`, `INFRA.sources` has `bot-health: 'fixture'` (not `gap`/`live`). The `BotHealthPanel` rendering rule must treat `'fixture'` as a **rows-showing** state (alongside `'live'`), or fixture mode regresses.

---

## File Structure

**New files:**
- `apps/server/src/connector/platform/platformDtos.ts` — hand-mirrored ACTUAL `035` + `/ops/runs` input types.
- `apps/server/src/connector/platform/PlatformHttpClient.ts` — fetch + bearer + timeout + `OfficeUpstreamError` mapping; typed getters.
- `apps/server/src/connector/platform/mappers.ts` — `mapRun` (+ duration/heartbeat formatting, `mapRunState`) [M1]; `mapInfraState`/`worstState`/`mapRuntimeCollection`/`mapMarket`/`mapExecution`/`mapCoverage` [M2].
- `apps/server/src/connector/platform/PlatformMonitoringConnector.ts` — `getBotHealth` + `getPlatformInfra`.
- `apps/server/src/connector/platform/createPlatformWiring.ts` — build client + connector.
- co-located `*.test.ts` per unit.
- `apps/web/src/runtime/secretExposure.test.ts` — guard: no platform URL/token names in `apps/web/src`.

**Modified files:**
- `apps/server/src/config.ts` — `PlatformConfig` + `OFFICE_PLATFORM_ENABLED` + fail-fast.
- `apps/server/src/connector/createTradingLabWiring.ts` — optional `platform` dep; auto-build; thread into InfraAggregator + composite.
- `apps/server/src/connector/CompositeOfficeReadConnector.ts` — optional `platform` dep; `getBotHealth` routes to it.
- `apps/server/src/connector/InfraAggregator.ts` — optional `platformInfra` provider; drop hardcoded `bot-health` gap when present.
- `packages/office-gateway/src/schemas.ts` — add 5 `platform-*` members to `infraSourceDomainSchema` [M2].
- `apps/web/src/floor/panels/BotHealthPanel.tsx` — rows-AND-source-state rendering rule.
- `apps/web/src/floor/infraSources.ts` — add `isLive`/`isDegraded`/`isError` helpers (or inline) for the panel.

---

# Milestone M1 — bot-health (closes `BotHealthPanel`)

## Task 1: Config — `PlatformConfig` + `OFFICE_PLATFORM_ENABLED` + fail-fast

**Files:**
- Modify: `apps/server/src/config.ts`
- Test: `apps/server/src/config.platform.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/server/src/config.platform.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { loadConfig } from './config';

describe('platform config', () => {
  it('defaults: platform disabled', () => {
    const c = loadConfig({ OFFICE_CONNECTOR_MODE: 'trading-lab', TRADING_LAB_READ_URL: 'http://lab', TRADING_LAB_READ_TOKEN: 't' });
    expect(c.platform.enabled).toBe(false);
  });
  it('enabled in trading-lab mode reads url/token', () => {
    const c = loadConfig({ OFFICE_CONNECTOR_MODE: 'trading-lab', TRADING_LAB_READ_URL: 'http://lab', TRADING_LAB_READ_TOKEN: 't',
      OFFICE_PLATFORM_ENABLED: 'true', TRADING_PLATFORM_READ_URL: 'http://plat:8839', TRADING_PLATFORM_READ_TOKEN: 'p' });
    expect(c.platform).toMatchObject({ enabled: true, readUrl: 'http://plat:8839', readToken: 'p', requestTimeoutMs: 10000 });
  });
  it('fail-fast: enabled in trading-lab mode without url/token throws', () => {
    expect(() => loadConfig({ OFFICE_CONNECTOR_MODE: 'trading-lab', TRADING_LAB_READ_URL: 'http://lab', TRADING_LAB_READ_TOKEN: 't', OFFICE_PLATFORM_ENABLED: 'true' }))
      .toThrow(/OFFICE_PLATFORM_ENABLED/);
  });
  it('flag ignored in fixture mode (platform disabled, no throw)', () => {
    const c = loadConfig({ OFFICE_CONNECTOR_MODE: 'fixture', OFFICE_PLATFORM_ENABLED: 'true' });
    expect(c.platform.enabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `cd apps/server && npx vitest run src/config.platform.test.ts`
Expected: FAIL (`c.platform` undefined).

- [ ] **Step 3: Implement** — add to `apps/server/src/config.ts`

Add the interface + field to `OfficeServerConfig`:
```ts
export interface PlatformConfig {
  enabled: boolean;
  readUrl: string;
  readToken: string;
  requestTimeoutMs: number;
}
// inside OfficeServerConfig: add `platform: PlatformConfig;`
```
In `loadConfig(env)`, after `connectorMode` is computed and the `tradingLab` block is built, add:
```ts
const platformEnabled = env.OFFICE_PLATFORM_ENABLED === 'true' && connectorMode === 'trading-lab';
const platform: PlatformConfig = {
  enabled: platformEnabled,
  readUrl: str(env, 'TRADING_PLATFORM_READ_URL', 'http://localhost:8839'),
  readToken: str(env, 'TRADING_PLATFORM_READ_TOKEN', ''),
  requestTimeoutMs: num(env, 'TRADING_PLATFORM_REQUEST_TIMEOUT_MS', 10000),
};
if (platformEnabled && (!env.TRADING_PLATFORM_READ_URL || !env.TRADING_PLATFORM_READ_TOKEN)) {
  throw new Error('OFFICE_PLATFORM_ENABLED=true (trading-lab mode) requires TRADING_PLATFORM_READ_URL and TRADING_PLATFORM_READ_TOKEN');
}
```
Include `platform` in the returned config object. (`str`/`num` are the existing helpers; `env.OFFICE_PLATFORM_ENABLED === 'true'` is the bool read. Note `platformEnabled` is already false in fixture mode, so the flag is ignored there.)

- [ ] **Step 4: Run, expect PASS** — `cd apps/server && npx vitest run src/config.platform.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/config.ts apps/server/src/config.platform.test.ts
git commit -m "feat(server): platform config + OFFICE_PLATFORM_ENABLED + fail-fast (4b M1)"
```

## Task 2: `platformDtos.ts` + `PlatformHttpClient`

**Files:**
- Create: `apps/server/src/connector/platform/platformDtos.ts`, `apps/server/src/connector/platform/PlatformHttpClient.ts`
- Test: `apps/server/src/connector/platform/PlatformHttpClient.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/server/src/connector/platform/PlatformHttpClient.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { PlatformHttpClient } from './PlatformHttpClient';

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });

describe('PlatformHttpClient', () => {
  it('sends bearer + ?mode and parses the runs PageEnvelope', async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string> });
      return json({ items: [{ runId: 'r1', mode: 'live', status: 'running', strategy: { name: 's', version: '1' }, startedAtMs: 1, finishedAtMs: null, lastSeenMs: 2, symbols: [] }], nextCursor: null, asOf: 9, window: {}, freshness: {} });
    }) as unknown as typeof fetch;
    const client = new PlatformHttpClient({ readUrl: 'http://plat', readToken: 'tok', requestTimeoutMs: 1000, fetchImpl });
    const env = await client.getRuns('live');
    expect(calls[0].url).toBe('http://plat/ops/runs?mode=live');
    expect(calls[0].headers.authorization).toBe('Bearer tok');
    expect(env.items[0].runId).toBe('r1');
    expect(env.nextCursor).toBeNull();
  });
  it('maps 401 → upstream_unauthorized (thrown)', async () => {
    const fetchImpl = (async () => json({}, 401)) as unknown as typeof fetch;
    const client = new PlatformHttpClient({ readUrl: 'http://plat', readToken: 't', requestTimeoutMs: 1000, fetchImpl });
    await expect(client.getDiscover()).rejects.toMatchObject({ office: { code: 'upstream_unauthorized' } });
  });
  it('maps 500 → upstream_unavailable; network → upstream_unavailable; 400 → upstream_bad_request', async () => {
    const mk = (impl: typeof fetch) => new PlatformHttpClient({ readUrl: 'http://p', readToken: 't', requestTimeoutMs: 1000, fetchImpl: impl });
    await expect(mk((async () => json({}, 500)) as unknown as typeof fetch).getMarketHealth()).rejects.toMatchObject({ office: { code: 'upstream_unavailable' } });
    await expect(mk((async () => { throw new Error('net'); }) as unknown as typeof fetch).getMarketHealth()).rejects.toMatchObject({ office: { code: 'upstream_unavailable' } });
    await expect(mk((async () => json({}, 400)) as unknown as typeof fetch).getCoverage()).rejects.toMatchObject({ office: { code: 'upstream_bad_request' } });
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `cd apps/server && npx vitest run src/connector/platform/PlatformHttpClient.test.ts`

- [ ] **Step 3: Create `platformDtos.ts`** (mirror the ACTUAL merged `035` shapes; office consumes only these fields)

`apps/server/src/connector/platform/platformDtos.ts`:
```ts
// Hand-mirrored from trading-platform/src/operations/dto.ts (035, merged). NO cross-repo import.
export type PlatformAvailability = 'available' | 'degraded' | 'unavailable';
export type PlatformHealthStatus = 'ok' | 'degraded' | 'down';
export type PlatformCoverageState = 'present' | 'missing' | 'stale' | 'unsupported';

export interface PageEnvelope<T> {
  items: T[];
  nextCursor: string | null;
  asOf: number;
  window?: unknown;     // mirror exact shape at need; office does not consume it in v1
  freshness?: unknown;  // mirror exact shape at need
}
export interface BotRunRecord {
  runId: string;
  mode: 'live' | 'paper' | 'backtest';
  status: 'running' | 'finished' | 'crashed' | 'aborted';
  strategy: { name: string; version: string };
  startedAtMs: number;
  finishedAtMs: number | null;
  lastSeenMs: number;
  symbols: string[];
}
export interface RuntimeHealthIndicators { ready: boolean; freshnessOk: boolean; pipelineOk: boolean; serviceOk: boolean; botOk: boolean; }
export interface RuntimeHealthEntry { source: string; status: PlatformHealthStatus; indicators: RuntimeHealthIndicators; availability: PlatformAvailability; capturedAtMs: number; }
export interface RuntimeHealthCollection { entries: RuntimeHealthEntry[]; asOf: number; }
export interface MarketServiceHealthSnapshot { status: PlatformHealthStatus; diagnostics: Record<string, unknown>; streamAgeMs: number | null; availability: PlatformAvailability; asOf: number; }
export interface SourceCoverageEntry { source: string; kind: string; state: PlatformCoverageState; freshnessAgeMs: number | null; }
export interface SourceCoverageSnapshot { entries: SourceCoverageEntry[]; availability: PlatformAvailability; asOf: number; }
export interface ExecutionHealthSnapshot { status: PlatformHealthStatus; recentCounts: Record<string, number>; lastEventMs: number | null; availability: PlatformAvailability; asOf: number; }
export interface OpsCapabilityDescriptor {
  opsContractVersion: string;
  capabilities: { readOnly: boolean; execution: boolean; credentials: boolean; ingestion: boolean; mutation: boolean };
  resources: { name: string; supportedFilters: string[]; pagination: unknown; fields: string[]; availability?: PlatformAvailability | 'unsupported' }[];
}
```

- [ ] **Step 4: Create `PlatformHttpClient.ts`** (mirror `tradinglab/TradingLabHttpClient.ts`)

`apps/server/src/connector/platform/PlatformHttpClient.ts`:
```ts
import type {
  PageEnvelope, BotRunRecord, RuntimeHealthCollection, MarketServiceHealthSnapshot,
  SourceCoverageSnapshot, ExecutionHealthSnapshot, OpsCapabilityDescriptor,
} from './platformDtos';

export interface OfficeUpstreamError extends Error {
  office: { code: 'upstream_unavailable' | 'upstream_unauthorized' | 'upstream_bad_request'; message: string };
}
function upstream(code: OfficeUpstreamError['office']['code'], message: string): OfficeUpstreamError {
  return Object.assign(new Error(message), { office: { code, message } }) as OfficeUpstreamError;
}

export interface PlatformHttpClientDeps {
  readUrl: string;
  readToken: string;
  requestTimeoutMs: number;
  fetchImpl?: typeof fetch;
}

export class PlatformHttpClient {
  private readonly fetchImpl: typeof fetch;
  constructor(private readonly deps: PlatformHttpClientDeps) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
  }
  private async getJson<T>(path: string): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.deps.requestTimeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.deps.readUrl}${path}`, {
        headers: { accept: 'application/json', authorization: `Bearer ${this.deps.readToken}` },
        signal: ctrl.signal,
      });
    } catch (err) {
      throw upstream('upstream_unavailable', `platform read failed: ${String(err)}`);
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401 || res.status === 403) throw upstream('upstream_unauthorized', `platform read ${path}: ${res.status}`);
    if (res.status >= 500) throw upstream('upstream_unavailable', `platform read ${path}: ${res.status}`);
    if (res.status >= 400) throw upstream('upstream_bad_request', `platform read ${path}: ${res.status}`);
    return (await res.json()) as T;
  }
  getRuns(mode: 'live' | 'paper'): Promise<PageEnvelope<BotRunRecord>> { return this.getJson(`/ops/runs?mode=${mode}`); }
  getRuntimeHealth(): Promise<RuntimeHealthCollection> { return this.getJson('/ops/health/runtime'); }
  getMarketHealth(): Promise<MarketServiceHealthSnapshot> { return this.getJson('/ops/health/market'); }
  getExecutionHealth(): Promise<ExecutionHealthSnapshot> { return this.getJson('/ops/health/execution'); }
  getCoverage(): Promise<SourceCoverageSnapshot> { return this.getJson('/ops/coverage'); }
  getDiscover(): Promise<OpsCapabilityDescriptor> { return this.getJson('/ops/discover'); }
}
```

- [ ] **Step 5: Run, expect PASS** — `cd apps/server && npx vitest run src/connector/platform/PlatformHttpClient.test.ts`

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/connector/platform/platformDtos.ts apps/server/src/connector/platform/PlatformHttpClient.ts apps/server/src/connector/platform/PlatformHttpClient.test.ts
git commit -m "feat(server): PlatformHttpClient + 035 DTO mirror (4b M1)"
```

## Task 3: Bot-run → `BotHealth` mapper

**Files:**
- Create: `apps/server/src/connector/platform/mappers.ts`
- Test: `apps/server/src/connector/platform/mappers.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/server/src/connector/platform/mappers.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { mapRun, mapRunState, formatDuration, formatAgo } from './mappers';
import type { BotRunRecord } from './platformDtos';

const base: BotRunRecord = { runId: 'r1', mode: 'live', status: 'running', strategy: { name: 'mr-funding', version: '1' }, startedAtMs: 0, finishedAtMs: null, lastSeenMs: 0, symbols: [] };

describe('bot-run mappers', () => {
  it('maps status → office state', () => {
    expect(mapRunState('running')).toBe('running');
    expect(mapRunState('crashed')).toBe('error');
    expect(mapRunState('aborted')).toBe('error');
    expect(mapRunState('finished')).toBe('paused');
  });
  it('formats duration + ago', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(90_000)).toBe('1m');
    expect(formatDuration(3_600_000 + 4 * 3_600_000)).toBe('5h 0m'); // 5h
    expect(formatDuration(27 * 3_600_000)).toBe('1d 3h');
    expect(formatAgo(2_000)).toBe('2s ago');
  });
  it('maps a running run to BotHealth (uptime from now-startedAt, heartbeat from lastSeen)', () => {
    const now = 3_600_000; // 1h
    const r = mapRun({ ...base, startedAtMs: 0, lastSeenMs: now - 2_000 }, now);
    expect(r).toEqual({ id: 'r1', name: 'mr-funding', state: 'running', uptime: '1h 0m', lastHeartbeat: '2s ago' });
  });
  it('finished run uptime uses finishedAt-startedAt; state paused', () => {
    const r = mapRun({ ...base, status: 'finished', startedAtMs: 0, finishedAtMs: 60_000, lastSeenMs: 0 }, 10_000_000);
    expect(r.state).toBe('paused');
    expect(r.uptime).toBe('1m');
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `cd apps/server && npx vitest run src/connector/platform/mappers.test.ts`

- [ ] **Step 3: Implement** — `apps/server/src/connector/platform/mappers.ts`

```ts
import type { BotHealth } from '@trading-office/office-gateway';
import type { BotRunRecord } from './platformDtos';

export function formatDuration(ms: number): string {
  const t = ms < 0 ? 0 : ms;
  const s = Math.floor(t / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}
export function formatAgo(ms: number): string { return `${formatDuration(ms)} ago`; }

export function mapRunState(status: BotRunRecord['status']): BotHealth['state'] {
  if (status === 'running') return 'running';
  if (status === 'finished') return 'paused';
  return 'error'; // crashed | aborted
}

export function mapRun(r: BotRunRecord, nowMs: number): BotHealth {
  const end = r.status === 'finished' && r.finishedAtMs != null ? r.finishedAtMs : nowMs;
  return {
    id: r.runId,
    name: r.strategy.name,
    state: mapRunState(r.status),
    uptime: formatDuration(end - r.startedAtMs),
    lastHeartbeat: formatAgo(nowMs - r.lastSeenMs),
  };
}
```

- [ ] **Step 4: Run, expect PASS** — `cd apps/server && npx vitest run src/connector/platform/mappers.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/connector/platform/mappers.ts apps/server/src/connector/platform/mappers.test.ts
git commit -m "feat(server): bot-run → BotHealth mapper (4b M1)"
```

## Task 4: `PlatformMonitoringConnector` (`getBotHealth` + `getPlatformInfra` bot-health)

**Files:**
- Create: `apps/server/src/connector/platform/PlatformMonitoringConnector.ts`
- Test: `apps/server/src/connector/platform/PlatformMonitoringConnector.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/server/src/connector/platform/PlatformMonitoringConnector.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { PlatformMonitoringConnector } from './PlatformMonitoringConnector';
import type { PlatformHttpClient } from './PlatformHttpClient';
import type { BotRunRecord, PageEnvelope } from './platformDtos';

const run = (over: Partial<BotRunRecord>): BotRunRecord => ({ runId: 'r', mode: 'live', status: 'running', strategy: { name: 's', version: '1' }, startedAtMs: 0, finishedAtMs: null, lastSeenMs: 0, symbols: [], ...over });
const env = (items: BotRunRecord[]): PageEnvelope<BotRunRecord> => ({ items, nextCursor: null, asOf: 0 });

function fakeClient(runsByMode: Record<string, PageEnvelope<BotRunRecord> | Error>): PlatformHttpClient {
  return { getRuns: async (m: 'live' | 'paper') => { const v = runsByMode[m]; if (v instanceof Error) throw v; return v; } } as unknown as PlatformHttpClient;
}

describe('PlatformMonitoringConnector.getBotHealth', () => {
  it('merges live + paper, maps, filters backtest (defense-in-depth)', async () => {
    const c = new PlatformMonitoringConnector(fakeClient({
      live: env([run({ runId: 'L', mode: 'live' }), run({ runId: 'B', mode: 'backtest' })]),
      paper: env([run({ runId: 'P', mode: 'paper' })]),
    }), () => 1000);
    const rows = await c.getBotHealth();
    expect(rows.map((r) => r.id).sort()).toEqual(['L', 'P']);
  });
  it('either query failing → [] (never throws)', async () => {
    const c = new PlatformMonitoringConnector(fakeClient({ live: env([run({})]), paper: new Error('boom') }), () => 0);
    await expect(c.getBotHealth()).resolves.toEqual([]);
  });
  it('both 200 empty → [] (valid no-active state)', async () => {
    const c = new PlatformMonitoringConnector(fakeClient({ live: env([]), paper: env([]) }), () => 0);
    await expect(c.getBotHealth()).resolves.toEqual([]);
  });
});

describe('getPlatformInfra bot-health source-state', () => {
  it('runs reachable → bot-health live', async () => {
    const c = new PlatformMonitoringConnector(fakeClient({ live: env([]), paper: env([]) }), () => 0);
    const infra = await c.getPlatformInfra();
    expect(infra.sources.find((s) => s.domain === 'bot-health')).toMatchObject({ state: 'live' });
  });
  it('runs unreachable → bot-health error', async () => {
    const c = new PlatformMonitoringConnector(fakeClient({ live: new Error('down'), paper: env([]) }), () => 0);
    const infra = await c.getPlatformInfra();
    expect(infra.sources.find((s) => s.domain === 'bot-health')).toMatchObject({ state: 'error' });
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `cd apps/server && npx vitest run src/connector/platform/PlatformMonitoringConnector.test.ts`

- [ ] **Step 3: Implement** — `apps/server/src/connector/platform/PlatformMonitoringConnector.ts`

```ts
import type { BotHealth, InfraService, InfraSource } from '@trading-office/office-gateway';
import type { PlatformHttpClient } from './PlatformHttpClient';
import { mapRun } from './mappers';

export interface PlatformInfra { services: InfraService[]; sources: InfraSource[]; }

export class PlatformMonitoringConnector {
  constructor(
    private readonly client: PlatformHttpClient,
    private readonly nowMs: () => number = () => Date.now(),
  ) {}

  async getBotHealth(): Promise<BotHealth[]> {
    let live, paper;
    try {
      live = await this.client.getRuns('live');
      paper = await this.client.getRuns('paper');
    } catch {
      return []; // either mode failing → [] (bot-health source-state conveys why)
    }
    const now = this.nowMs();
    return [...live.items, ...paper.items]
      .filter((r) => r.mode !== 'backtest') // defense-in-depth; ?mode= is the primary filter
      .map((r) => mapRun(r, now));
  }

  async getPlatformInfra(): Promise<PlatformInfra> {
    const sources: InfraSource[] = [];
    try {
      await this.client.getRuns('live'); // reachability probe
      sources.push({ domain: 'bot-health', state: 'live', detail: 'platform ops read' });
    } catch (err) {
      sources.push({ domain: 'bot-health', state: 'error', detail: officeMessage(err) });
    }
    return { services: [], sources };
  }
}

export function officeMessage(err: unknown): string {
  const o = (err as { office?: { message?: string } })?.office;
  return o?.message ?? (err instanceof Error ? err.message : String(err));
}
```

- [ ] **Step 4: Run, expect PASS** — `cd apps/server && npx vitest run src/connector/platform/PlatformMonitoringConnector.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/connector/platform/PlatformMonitoringConnector.ts apps/server/src/connector/platform/PlatformMonitoringConnector.test.ts
git commit -m "feat(server): PlatformMonitoringConnector getBotHealth + bot-health source (4b M1)"
```

## Task 5: Compose platform into `InfraAggregator` + `CompositeOfficeReadConnector` + `createTradingLabWiring` + `createPlatformWiring`

**Files:**
- Create: `apps/server/src/connector/platform/createPlatformWiring.ts`
- Modify: `apps/server/src/connector/InfraAggregator.ts`, `CompositeOfficeReadConnector.ts`, `createTradingLabWiring.ts`
- Test: `apps/server/src/connector/platform/compose.test.ts`

- [ ] **Step 1: Write the failing test** (drives all four edits at the wiring seam)

`apps/server/src/connector/platform/compose.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createTradingLabWiring } from '../createTradingLabWiring';
import { loadConfig } from '../../config';
import type { PlatformMonitoringConnector } from './PlatformMonitoringConnector';

const cfg = () => loadConfig({ OFFICE_CONNECTOR_MODE: 'trading-lab', TRADING_LAB_READ_URL: 'http://lab', TRADING_LAB_READ_TOKEN: 't' });
const labFetch = (async () => new Response(JSON.stringify({ status: 'ok' }), { status: 200 })) as unknown as typeof fetch;

const fakePlatform = (over: Partial<PlatformMonitoringConnector> = {}): PlatformMonitoringConnector => ({
  getBotHealth: async () => [{ id: 'b1', name: 's', state: 'running', uptime: '1m', lastHeartbeat: '2s ago' }],
  getPlatformInfra: async () => ({ services: [], sources: [{ domain: 'bot-health', state: 'live', detail: 'ok' }] }),
  ...over,
} as unknown as PlatformMonitoringConnector);

describe('platform composition', () => {
  it('with platform injected: getBotHealth routes to platform; infra bot-health is live (not gap)', async () => {
    const wiring = createTradingLabWiring(cfg(), { fetchImpl: labFetch, platform: fakePlatform() });
    expect(await wiring.connector.getBotHealth()).toHaveLength(1);
    const infra = await wiring.connector.getInfraStatus();
    expect(infra.sources?.find((s) => s.domain === 'bot-health')).toMatchObject({ state: 'live' });
  });
  it('without platform: getBotHealth [] and bot-health stays gap (Phase 3 behavior)', async () => {
    const wiring = createTradingLabWiring(cfg(), { fetchImpl: labFetch });
    expect(await wiring.connector.getBotHealth()).toEqual([]);
    const infra = await wiring.connector.getInfraStatus();
    expect(infra.sources?.find((s) => s.domain === 'bot-health')).toMatchObject({ state: 'gap' });
    expect(infra.sources?.find((s) => s.domain === 'knowledge')).toMatchObject({ state: 'gap' });
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `cd apps/server && npx vitest run src/connector/platform/compose.test.ts`

- [ ] **Step 3: Edit `InfraAggregator.ts`** — optional `platformInfra` provider

Add the constructor param + branch:
```ts
import type { PlatformInfra } from './platform/PlatformMonitoringConnector';
// constructor: add 4th param
//   private readonly platformInfra?: () => Promise<PlatformInfra>,
// in getInfraStatus(), replace the two hardcoded `knowledge`+`bot-health` gap pushes with:
sources.push({ domain: 'knowledge', state: 'gap', detail: 'Knowledge source is not connected yet' });
if (this.platformInfra) {
  const p = await this.platformInfra().catch((): PlatformInfra => ({ services: [], sources: [{ domain: 'bot-health', state: 'error', detail: 'platform infra unavailable' }] }));
  services.push(...p.services);
  sources.push(...p.sources);
} else {
  sources.push({ domain: 'bot-health', state: 'gap', detail: 'Bot runtime monitoring is not connected yet' });
}
```

- [ ] **Step 4: Edit `CompositeOfficeReadConnector.ts`** — optional `platform` dep

```ts
import type { PlatformMonitoringConnector } from './platform/PlatformMonitoringConnector';
// CompositeDeps: add `platform?: Pick<PlatformMonitoringConnector, 'getBotHealth'>;`
// replace getBotHealth():
async getBotHealth(): Promise<BotHealth[]> {
  return this.deps.platform ? this.deps.platform.getBotHealth() : [];
}
```

- [ ] **Step 5: Create `createPlatformWiring.ts`**

`apps/server/src/connector/platform/createPlatformWiring.ts`:
```ts
import type { OfficeServerConfig } from '../../config';
import { PlatformHttpClient } from './PlatformHttpClient';
import { PlatformMonitoringConnector } from './PlatformMonitoringConnector';

export interface PlatformWiringDeps { fetchImpl?: typeof fetch; nowMs?: () => number; }
export interface PlatformWiring { connector: PlatformMonitoringConnector; client: PlatformHttpClient; }

export function createPlatformWiring(config: OfficeServerConfig, deps: PlatformWiringDeps = {}): PlatformWiring {
  const client = new PlatformHttpClient({
    readUrl: config.platform.readUrl,
    readToken: config.platform.readToken,
    requestTimeoutMs: config.platform.requestTimeoutMs,
    fetchImpl: deps.fetchImpl,
  });
  const connector = new PlatformMonitoringConnector(client, deps.nowMs);
  return { connector, client };
}
```

- [ ] **Step 6: Edit `createTradingLabWiring.ts`** — optional `platform` dep + auto-build

```ts
import type { PlatformMonitoringConnector } from './platform/PlatformMonitoringConnector';
import { createPlatformWiring } from './platform/createPlatformWiring';
// TradingLabWiringDeps: add `platform?: PlatformMonitoringConnector;`
// inside the function, before building InfraAggregator + composite:
const platform = deps.platform ?? (config.platform.enabled ? createPlatformWiring(config, { fetchImpl: deps.fetchImpl }).connector : undefined);
const infra = new InfraAggregator(client, () => bridge.state(), deps.now, platform ? () => platform.getPlatformInfra() : undefined);
const connector = new CompositeOfficeReadConnector({ read, infra, startBridge: (emit) => bridge.start(emit), platform });
```

- [ ] **Step 7: Run, expect PASS** + typecheck — `cd apps/server && npx vitest run src/connector/platform/compose.test.ts && npm run typecheck -w @trading-office/server`

- [ ] **Step 8: Run the full server suite to confirm no regression** — `npm run test -w @trading-office/server` (Phase 2/3 connector + wiring tests stay green).

- [ ] **Step 9: Commit**

```bash
git add apps/server/src/connector/platform/createPlatformWiring.ts apps/server/src/connector/InfraAggregator.ts apps/server/src/connector/CompositeOfficeReadConnector.ts apps/server/src/connector/createTradingLabWiring.ts apps/server/src/connector/platform/compose.test.ts
git commit -m "feat(server): compose PlatformMonitoringConnector into wiring (4b M1)"
```

## Task 6: `BotHealthPanel` rendering states (rows AND `bot-health` source-state)

**Files:**
- Modify: `apps/web/src/floor/infraSources.ts`, `apps/web/src/floor/panels/BotHealthPanel.tsx`

> Web panels have no unit tests; gate via typecheck + the conformance test (`mock == connected`) staying green + a manual UI check. The behavior is covered by the server-side `bot-health` source-state tests (Task 4/5).

- [ ] **Step 1: Add panel-state helpers** to `apps/web/src/floor/infraSources.ts`

```ts
export const isLive = (state: InfraSourceState | undefined): boolean => state === 'live' || state === 'fixture';
export const isDegraded = (state: InfraSourceState | undefined): boolean => state === 'degraded';
export const isError = (state: InfraSourceState | undefined): boolean => state === 'error';
```
(`'fixture'` counts as a rows-showing state so fixture mode keeps rendering `BOTS`.)

- [ ] **Step 2: Rewrite `BotHealthPanel.tsx`** to the full decision rule

`apps/web/src/floor/panels/BotHealthPanel.tsx`:
```tsx
import { useGateway } from '../../runtime/RuntimeContext';
import { isError, isGap, isLive, sourceState } from '../infraSources';
import { PanelChrome, PanelState } from './PanelChrome';
import { useResource } from './useResource';

export function BotHealthPanel({ onClose }: { onClose: () => void }) {
  const gateway = useGateway();
  const res = useResource(() => gateway.getBotHealth(), []);
  const infra = useResource(() => gateway.getInfraStatus(), []);
  const state = sourceState(infra.data, 'bot-health');
  const rows = res.data ?? [];

  if (isGap(state)) {
    return <PanelChrome title="Bot status" onClose={onClose}><p className="panel__empty">Bot runtime monitoring is not connected yet</p></PanelChrome>;
  }
  if (isError(state)) {
    return <PanelChrome title="Bot status" onClose={onClose}><p className="panel__empty">Bot runtime monitoring unavailable — platform unreachable</p></PanelChrome>;
  }
  // empty state ONLY when the source genuinely succeeded (live/fixture) — never on failure
  if (rows.length === 0 && isLive(state)) {
    return <PanelChrome title="Bot status" onClose={onClose}><p className="panel__empty">No active bot runs</p></PanelChrome>;
  }
  if (rows.length === 0 && state === 'degraded') {
    return <PanelChrome title="Bot status" onClose={onClose}><p className="panel__empty">Bot runtime data is stale</p></PanelChrome>;
  }
  return (
    <PanelChrome title="Bot status" onClose={onClose}>
      <PanelState resource={res} />
      {state === 'degraded' && <p className="panel__empty">data may be stale</p>}
      {rows.map((bot) => (
        <div key={bot.id} className="row">
          <span>{bot.name}</span>
          <span className="tag">{bot.state} · up {bot.uptime} · {bot.lastHeartbeat}</span>
        </div>
      ))}
    </PanelChrome>
  );
}
```

- [ ] **Step 3: Typecheck + conformance** — `npm run typecheck -w @trading-office/web && npm run test -w @trading-office/web`
Expected: typecheck clean; conformance green (fixture `bot-health: 'fixture'` → `isLive` true → renders the 3 `BOTS`, unchanged).

- [ ] **Step 4: Manual UI check** — run office in `connected + trading-lab + platform` against a live `/ops/*` (or with a stub) and confirm: gap/error/empty/degraded/rows all render correctly; a platform-down state shows the error message, NOT "No active bot runs".

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/floor/infraSources.ts apps/web/src/floor/panels/BotHealthPanel.tsx
git commit -m "feat(web): BotHealthPanel derives state from rows + bot-health source (4b M1)"
```

---

# Milestone M2 — platform infra (closes the platform part of `InfraStatusPanel`)

## Task 7: Infra mappers (`availability`×`status` + worst-of + per-aspect)

**Files:**
- Modify: `apps/server/src/connector/platform/mappers.ts`
- Test: `apps/server/src/connector/platform/infraMappers.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/server/src/connector/platform/infraMappers.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { mapInfraState, worstState, mapRuntimeCollection, mapMarket, mapExecution, mapCoverage } from './mappers';

describe('infra mappers', () => {
  it('availability × status → office state', () => {
    expect(mapInfraState('available', 'ok')).toBe('live');
    expect(mapInfraState('available', 'degraded')).toBe('degraded');
    expect(mapInfraState('available', 'down')).toBe('error');
    expect(mapInfraState('degraded', 'ok')).toBe('degraded');
    expect(mapInfraState('unavailable', 'down')).toBe('gap');
  });
  it('worst-of: error > gap > degraded > live', () => {
    expect(worstState(['live', 'degraded', 'gap'])).toBe('gap');
    expect(worstState(['live', 'error', 'gap'])).toBe('error');
    expect(worstState(['live', 'live'])).toBe('live');
    expect(worstState([])).toBe('gap');
  });
  it('runtime collection: worst-of entries; empty → gap', () => {
    expect(mapRuntimeCollection({ entries: [{ source: 'long_oi', status: 'ok', indicators: {} as any, availability: 'available', capturedAtMs: 0 }, { source: 'short_oi', status: 'down', indicators: {} as any, availability: 'available', capturedAtMs: 0 }], asOf: 0 })).toBe('error');
    expect(mapRuntimeCollection({ entries: [], asOf: 0 })).toBe('gap');
  });
  it('market unavailable → gap (default until persistence)', () => {
    expect(mapMarket({ status: 'down', diagnostics: {}, streamAgeMs: null, availability: 'unavailable', asOf: 0 })).toBe('gap');
    expect(mapMarket({ status: 'ok', diagnostics: {}, streamAgeMs: 10, availability: 'available', asOf: 0 })).toBe('live');
  });
  it('execution idle (unavailable) → gap; active ok → live', () => {
    expect(mapExecution({ status: 'down', recentCounts: {}, lastEventMs: null, availability: 'unavailable', asOf: 0 })).toBe('gap');
    expect(mapExecution({ status: 'ok', recentCounts: { execution_filled: 3 }, lastEventMs: 1, availability: 'available', asOf: 0 })).toBe('live');
  });
  it('coverage: unavailable→gap; missing/stale→degraded; present→live', () => {
    expect(mapCoverage({ entries: [], availability: 'unavailable', asOf: 0 })).toBe('gap');
    expect(mapCoverage({ entries: [{ source: 'b', kind: 'taker', state: 'stale', freshnessAgeMs: 9 }], availability: 'available', asOf: 0 })).toBe('degraded');
    expect(mapCoverage({ entries: [{ source: 'b', kind: 'taker', state: 'present', freshnessAgeMs: 1 }], availability: 'available', asOf: 0 })).toBe('live');
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `cd apps/server && npx vitest run src/connector/platform/infraMappers.test.ts`

- [ ] **Step 3: Append to `mappers.ts`**

```ts
import type { InfraSourceState } from '@trading-office/office-gateway';
import type { PlatformAvailability, PlatformHealthStatus, RuntimeHealthCollection, MarketServiceHealthSnapshot, ExecutionHealthSnapshot, SourceCoverageSnapshot } from './platformDtos';

export function mapInfraState(availability: PlatformAvailability, status: PlatformHealthStatus): InfraSourceState {
  if (availability === 'unavailable') return 'gap';
  if (availability === 'degraded') return 'degraded';
  // availability === 'available'
  if (status === 'down') return 'error';
  if (status === 'degraded') return 'degraded';
  return 'live';
}

const RANK: Record<InfraSourceState, number> = { error: 4, gap: 3, degraded: 2, live: 1, fixture: 0 };
export function worstState(states: InfraSourceState[]): InfraSourceState {
  if (states.length === 0) return 'gap';
  return states.reduce((w, s) => (RANK[s] > RANK[w] ? s : w), 'live' as InfraSourceState);
}

export function mapRuntimeCollection(c: RuntimeHealthCollection): InfraSourceState {
  if (c.entries.length === 0) return 'gap';
  return worstState(c.entries.map((e) => mapInfraState(e.availability, e.status)));
}
export function mapMarket(m: MarketServiceHealthSnapshot): InfraSourceState { return mapInfraState(m.availability, m.status); }
export function mapExecution(e: ExecutionHealthSnapshot): InfraSourceState { return mapInfraState(e.availability, e.status); }
export function mapCoverage(c: SourceCoverageSnapshot): InfraSourceState {
  if (c.availability === 'unavailable') return 'gap';
  if (c.availability === 'degraded') return 'degraded';
  if (c.entries.length === 0 || c.entries.every((e) => e.state === 'unsupported')) return 'gap';
  if (c.entries.some((e) => e.state === 'missing' || e.state === 'stale')) return 'degraded';
  return 'live';
}
```

- [ ] **Step 4: Run, expect PASS** — `cd apps/server && npx vitest run src/connector/platform/infraMappers.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/connector/platform/mappers.ts apps/server/src/connector/platform/infraMappers.test.ts
git commit -m "feat(server): platform infra mappers (availability×status, worst-of) (4b M2)"
```

## Task 8: Expand `getPlatformInfra` (5 `platform-*` domains, best-effort per-endpoint)

**Files:**
- Modify: `apps/server/src/connector/platform/PlatformMonitoringConnector.ts`
- Test: extend `apps/server/src/connector/platform/PlatformMonitoringConnector.test.ts`

- [ ] **Step 1: Add failing tests** (append to the existing test file)

```ts
import type { OpsCapabilityDescriptor, RuntimeHealthCollection, MarketServiceHealthSnapshot, ExecutionHealthSnapshot, SourceCoverageSnapshot } from './platformDtos';

function fullClient(over: Partial<Record<'runs'|'runtime'|'market'|'execution'|'coverage'|'discover', unknown | Error>>): PlatformHttpClient {
  const ok = {
    runs: { items: [], nextCursor: null, asOf: 0 },
    runtime: { entries: [{ source: 'long_oi', status: 'ok', indicators: {}, availability: 'available', capturedAtMs: 0 }], asOf: 0 } as RuntimeHealthCollection,
    market: { status: 'ok', diagnostics: {}, streamAgeMs: 1, availability: 'available', asOf: 0 } as MarketServiceHealthSnapshot,
    execution: { status: 'ok', recentCounts: {}, lastEventMs: 1, availability: 'available', asOf: 0 } as ExecutionHealthSnapshot,
    coverage: { entries: [], availability: 'available', asOf: 0 } as SourceCoverageSnapshot,
    discover: { opsContractVersion: '1', capabilities: { readOnly: true, execution: false, credentials: false, ingestion: false, mutation: false }, resources: [] } as OpsCapabilityDescriptor,
  };
  const pick = (k: keyof typeof ok) => { const v = over[k as keyof typeof over]; if (v instanceof Error) return () => Promise.reject(v); return () => Promise.resolve(v ?? ok[k]); };
  return { getRuns: pick('runs'), getRuntimeHealth: pick('runtime'), getMarketHealth: pick('market'), getExecutionHealth: pick('execution'), getCoverage: pick('coverage'), getDiscover: pick('discover') } as unknown as PlatformHttpClient;
}

describe('getPlatformInfra platform-* domains', () => {
  const stateOf = (infra: { sources: { domain: string; state: string }[] }, d: string) => infra.sources.find((s) => s.domain === d)?.state;
  it('all reachable → all live; ops-api live', async () => {
    const infra = await new PlatformMonitoringConnector(fullClient({}), () => 0).getPlatformInfra();
    for (const d of ['platform-ops-api', 'platform-runtime', 'platform-market', 'platform-execution', 'platform-coverage', 'bot-health']) expect(stateOf(infra, d)).toBe('live');
  });
  it('only /ops/discover down, others ok → ops-api degraded; others live (no suppression)', async () => {
    const infra = await new PlatformMonitoringConnector(fullClient({ discover: new Error('x') }), () => 0).getPlatformInfra();
    expect(stateOf(infra, 'platform-ops-api')).toBe('degraded');
    expect(stateOf(infra, 'platform-runtime')).toBe('live');
    expect(stateOf(infra, 'platform-market')).toBe('live');
  });
  it('whole client down → ops-api error; dependents error', async () => {
    const e = new Error('down');
    const infra = await new PlatformMonitoringConnector(fullClient({ runs: e, runtime: e, market: e, execution: e, coverage: e, discover: e }), () => 0).getPlatformInfra();
    expect(stateOf(infra, 'platform-ops-api')).toBe('error');
    expect(stateOf(infra, 'platform-runtime')).toBe('error');
  });
  it('market unavailable → platform-market gap; others unaffected', async () => {
    const infra = await new PlatformMonitoringConnector(fullClient({ market: { status: 'down', diagnostics: {}, streamAgeMs: null, availability: 'unavailable', asOf: 0 } }), () => 0).getPlatformInfra();
    expect(stateOf(infra, 'platform-market')).toBe('gap');
    expect(stateOf(infra, 'platform-runtime')).toBe('live');
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `cd apps/server && npx vitest run src/connector/platform/PlatformMonitoringConnector.test.ts`

- [ ] **Step 3: Replace `getPlatformInfra`** in `PlatformMonitoringConnector.ts`

```ts
import { mapRuntimeCollection, mapMarket, mapExecution, mapCoverage } from './mappers';
import type { InfraSourceState } from '@trading-office/office-gateway';

type Attempt<T> = { ok: true; value: T } | { ok: false; error: unknown };
async function attempt<T>(fn: () => Promise<T>): Promise<Attempt<T>> {
  try { return { ok: true, value: await fn() }; } catch (error) { return { ok: false, error }; }
}
const aspectState = <T>(a: Attempt<T>, map: (v: T) => InfraSourceState): InfraSourceState => (a.ok ? map(a.value) : 'error');

async getPlatformInfra(): Promise<PlatformInfra> {
  const [runs, runtime, market, execution, coverage, discover] = await Promise.all([
    attempt(() => this.client.getRuns('live')),
    attempt(() => this.client.getRuntimeHealth()),
    attempt(() => this.client.getMarketHealth()),
    attempt(() => this.client.getExecutionHealth()),
    attempt(() => this.client.getCoverage()),
    attempt(() => this.client.getDiscover()),
  ]);
  const anyOtherOk = [runs, runtime, market, execution, coverage].some((a) => a.ok);
  const opsApiState: InfraSourceState = discover.ok ? 'live' : anyOtherOk ? 'degraded' : 'error';

  const services = [{ name: 'platform-ops-api', up: discover.ok, detail: discover.ok ? 'reachable' : officeMessage((discover as { error: unknown }).error) }];
  const sources = [
    { domain: 'platform-ops-api' as const,   state: opsApiState, detail: `ops read ${opsApiState}` },
    { domain: 'platform-runtime' as const,   state: aspectState(runtime, mapRuntimeCollection), detail: 'runtime health' },
    { domain: 'platform-market' as const,    state: aspectState(market, mapMarket),             detail: 'market health' },
    { domain: 'platform-execution' as const, state: aspectState(execution, mapExecution),       detail: 'execution activity' },
    { domain: 'platform-coverage' as const,  state: aspectState(coverage, mapCoverage),         detail: 'feed coverage' },
    { domain: 'bot-health' as const,         state: (runs.ok ? 'live' : 'error') as InfraSourceState, detail: runs.ok ? 'platform ops read' : officeMessage((runs as { error: unknown }).error) },
  ];
  return { services, sources };
}
```
(Remove the old M1 `getPlatformInfra` body; keep `getBotHealth` and `officeMessage` unchanged.)

- [ ] **Step 4: Run, expect FAIL on the new infra-domain assertions** — `cd apps/server && npx vitest run src/connector/platform/PlatformMonitoringConnector.test.ts`
Expected: FAIL with a zod / type error because `infraSourceDomainSchema` does not yet allow `platform-*` (the office-gateway types reject the new `domain` strings). That gates Task 9. (If the `InfraSource` type is structural and compiles, the assertions pass and Task 9 is purely the schema widening + conformance.)

- [ ] **Step 5: Commit** (the connector code; schema widening lands in Task 9)

```bash
git add apps/server/src/connector/platform/PlatformMonitoringConnector.ts apps/server/src/connector/platform/PlatformMonitoringConnector.test.ts
git commit -m "feat(server): getPlatformInfra emits 5 platform-* domains, best-effort (4b M2)"
```

## Task 9: Widen `infraSourceDomainSchema` (5 `platform-*` members)

**Files:**
- Modify: `packages/office-gateway/src/schemas.ts`

- [ ] **Step 1: Add the members** to `infraSourceDomainSchema`

```ts
export const infraSourceDomainSchema = z.enum([
  'office-server',
  'trading-lab-read-api',
  'trading-lab-stream',
  'knowledge',
  'bot-health',
  'platform-ops-api',
  'platform-runtime',
  'platform-market',
  'platform-execution',
  'platform-coverage',
]);
```

- [ ] **Step 2: Build office-gateway + run its suite** — `npm run build -w @trading-office/office-gateway && npm run test -w @trading-office/office-gateway`
Expected: green (the additive enum widening passes `purity.test.ts`; `dto.ts` inferred `InfraSourceDomain` type updates automatically).

- [ ] **Step 3: Re-run the connector infra test (now green) + server typecheck** — `cd apps/server && npx vitest run src/connector/platform/PlatformMonitoringConnector.test.ts && npm run typecheck -w @trading-office/server`

- [ ] **Step 4: Run the web conformance suite (fixtures unchanged, mock == connected)** — `npm run test -w @trading-office/web`
Expected: green — `INFRA`/`BOTS` fixtures are untouched; the enum is a superset so existing fixture `domain`s still validate; new domains need not appear in `INFRA.sources`.

- [ ] **Step 5: Commit**

```bash
git add packages/office-gateway/src/schemas.ts
git commit -m "feat(office-gateway): add 5 platform-* infra source domains (4b M2)"
```

---

# Milestone M3 — guards & verification

## Task 10: Secret-exposure guard test (platform URL/token never in the web layer)

**Files:**
- Create: `apps/web/src/runtime/secretExposure.test.ts`

> The import boundary already forbids `apps/web` from importing `*trading-platform*`. This new guard additionally asserts the web source never references the platform env vars (so URL/token cannot reach the bundle, a config endpoint, serialized state, or logs). Source-scan pattern mirrors `apps/web/src/runtime/importBoundary.test.ts` / `packages/office-gateway/src/purity.test.ts`.

- [ ] **Step 1: Write the test** (it should pass immediately — the web layer must not reference these names)

`apps/web/src/runtime/secretExposure.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB_SRC = join(dirname(fileURLToPath(import.meta.url)), '..'); // apps/web/src

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : [];
  });
}
const files = walk(WEB_SRC).filter((f) => !/\.test\.tsx?$/.test(f));
const FORBIDDEN = /TRADING_PLATFORM_READ_URL|TRADING_PLATFORM_READ_TOKEN|TRADING_PLATFORM_REQUEST_TIMEOUT_MS|OFFICE_PLATFORM_ENABLED/;

describe('web layer never references platform secrets/config', () => {
  it.each(files)('%s has no platform env references', (file) => {
    expect(readFileSync(file, 'utf8')).not.toMatch(FORBIDDEN);
  });
});
```

- [ ] **Step 2: Run, expect PASS** — `npm run test -w @trading-office/web -- secretExposure` (or `cd apps/web && npx vitest run src/runtime/secretExposure.test.ts`)
Expected: PASS (no web source references the platform env vars). If it fails, a platform secret leaked into the web layer — fix the leak, do not weaken the guard.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/runtime/secretExposure.test.ts
git commit -m "test(web): guard — platform URL/token never referenced in the web layer (4b M3)"
```

## Task 11: Green-mode matrix + local smoke (verification)

**Files:** none (verification only).

- [ ] **Step 1: Full workspace suites green** — from repo root: `npm run test` (runs server + web + office-gateway). Expected: all green (existing Phase 2/3 suites + the new 4b tests + conformance).

- [ ] **Step 2: Full typecheck** — `npm run typecheck`. Expected: clean across workspaces.

- [ ] **Step 3: Local smoke — `connected + trading-lab + platform`** — start a `trading-platform` Ops Read server (`OPS_READ_PORT=8839`, `OPS_READ_TOKENS=<sha256hex of the office token>`; run `run_long_oi`/`run_short_oi` for runtime+runs data; execution-health needs recent `execution_*` events; market/coverage stay `gap` unless `MARKET_HEALTH_PERSIST=true`). Start the office server with `OFFICE_CONNECTOR_MODE=trading-lab OFFICE_PLATFORM_ENABLED=true TRADING_PLATFORM_READ_URL=http://localhost:8839 TRADING_PLATFORM_READ_TOKEN=<raw token>`. Open the floor; confirm:
  - `BotHealthPanel` shows real rows (or "No active bot runs" when reachable+empty; gap/error when disabled/unreachable — never a false empty).
  - `InfraStatusPanel` shows `platform-ops-api`/`platform-runtime`/`platform-execution` live, `platform-market`/`platform-coverage` `gap` (until persistence enabled).
- [ ] **Step 4: Smoke — disabled path** — restart office with `OFFICE_PLATFORM_ENABLED=false`; confirm `bot-health` is `gap` and no `platform-*` rows (Phase 3 behavior). And `fixture` mode (`OFFICE_CONNECTOR_MODE=fixture`) still renders the fixture bots.

- [ ] **Step 5: Commit** (if any smoke-driven fixups were needed; otherwise nothing to commit).

---

## Self-Review notes (already reconciled)

- **Spec coverage:** PlatformHttpClient+DTO mirror (T2); run→bot mapper + filter + finished→paused (T3); getBotHealth dual-mode/merge/empty≠gap (T4); composite+aggregator+wiring, bot-health gap closed distinctly (T5); BotHealthPanel rows-AND-source-state, false-empty guard, `fixture` rows-showing (T6); infra mappers availability×status/worst-of (T7); getPlatformInfra 5 domains, discover-not-a-gate, market unavailable→gap (T8); 5 enum members (T9); secret-exposure guard (T10); green matrix + honest-degradation smoke + market/coverage auto-light-up note (T11). Config independent flag + trading-lab-only + fail-fast (T1). Read-only/GET-only (no write method anywhere); import-boundary already covers platform.
- **Type consistency:** `BotHealth`/`InfraSource`/`InfraService`/`InfraSourceState` from `@trading-office/office-gateway`; `PlatformInfra`, `PlatformMonitoringConnector`, `PlatformWiringDeps`, `OfficeUpstreamError`, `mapRun`/`mapInfraState`/`worstState`/`mapRuntimeCollection`/`mapMarket`/`mapExecution`/`mapCoverage`, `officeMessage` consistent across tasks; `config.platform` shape consistent (T1↔T5↔createPlatformWiring).
- **Calibration carry-overs (confirm at impl):** exact `window`/`freshness` envelope shapes (and whether `freshness` should drive `bot-health → degraded`); whether `paper` bots are wanted; recency-filter of old `finished` runs; whether `InfraSource` type is structural enough that Task 8 compiles before Task 9 (adjust the T8/T9 boundary if so). Confirm no root `vitest.config.ts` changes the run command.
