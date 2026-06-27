# Agent Phoenix Traces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an operator clicks an agent on the office floor, a new **Traces** tab in the left panel shows that agent's rich Phoenix LLM traces (span tree, latency, tokens), fetched read-only through trading-lab.

**Architecture:** trading-lab (the producer that owns Phoenix) gains a read endpoint `GET /v1/agents/:agentId/traces` backed by a `PhoenixTraceReader` that queries Phoenix's REST API, groups spans into traces, and identifies the agent by its root `agent_run` span. trading-office consumes that endpoint through the existing `TradingLabReadConnector` seam and renders it in `AgentActivityPanel`. Office stays a read-only consumer and never talks to Phoenix directly.

**Tech Stack:** TypeScript (strict), Hono (lab read-api + office server), React 18 + Vite (office web), Zod (office-gateway DTOs), Vitest (both repos), native `fetch` (DI-injected).

## Global Constraints

- Read-only: no write/execute methods anywhere in this feature.
- Gated: all Phoenix access is behind `PHOENIX_ENABLED` (lab). When off → typed empty, never an error.
- No secret leak: never echo Phoenix `PHOENIX_API_KEY`, tokens, raw upstream URLs, or raw error text to the operator.
- Typed reason codes are an operator-facing contract — keep the string literals stable and identical across repos: `'tracing-disabled' | 'phoenix-unreachable' | 'no-traces'` (plus `null` for "ok, here are traces").
- No new production dependencies — use native `fetch`, injected as `fetchImpl?: typeof fetch` for tests (mirror `TradingLabHttpClient`).
- Lab endpoint always returns HTTP 200 for the three reason-code states (they are body states, not HTTP errors). Only genuine internal bugs surface as 500 via `app.onError`.
- TDD: failing test → run (fail) → minimal impl → run (pass) → commit. One assertion-focused test per behavior.
- Spec: `docs/superpowers/specs/2026-06-27-agent-phoenix-traces-design.md`.

---

## Phase A — trading-lab (producer)

All of Phase A executes in the trading-lab **worktree** at `/home/alexxxnikolskiy/projects/trading-lab-phoenix-traces` (branch `feat/agent-phoenix-traces`, based on `main`). The repo-relative paths below (`src/...`) are relative to that worktree root — the original `/home/alexxxnikolskiy/projects/trading-lab` checkout (on an unrelated branch) is untouched.

### Task A1: Spike — confirm Phoenix REST shape & agent-span identity, capture a fixture

**Why:** The reader and all downstream DTOs depend on (a) the exact JSON shape Phoenix returns from `GET /v1/projects/{id}/spans`, and (b) how an `agent_run` span carries the agent's identity (span `name` vs `attributes['metadata.agentId']`). The exporter (`@mastra/arize`) maps `mastra.span.type=agent_run → openinference.span.kind=AGENT` but writes **no** dedicated agent-name attribute, so identity = the AGENT span's `name` (and/or `metadata.agentId`). This task locks that down and produces a real fixture for reader tests.

**Files:**
- Create: `src/read-api/phoenix/__fixtures__/phoenix-spans.fixture.json` (captured response)
- Create: `docs/superpowers/notes/2026-06-27-phoenix-span-shape.md` (findings)

- [ ] **Step 1: Bring up Phoenix locally**

```bash
docker run -d --name phoenix-spike -p 6006:6006 arizephoenix/phoenix:17.11.0
# wait for readiness
until curl -sf http://localhost:6006/v1/projects >/dev/null 2>&1; do sleep 1; done
curl -s http://localhost:6006/v1/projects | head -c 400
```
Expected: a JSON `{ "data": [...], "next_cursor": ... }` (likely an empty or `default`-only project list on a fresh instance).

- [ ] **Step 2: Generate at least one agent trace (best-effort)**

If LLM API keys are available, run a single real agent invocation with Phoenix on; otherwise emit one synthetic OTLP span set so the read shape can be captured:

```bash
# Preferred (real): run the lab with tracing on and trigger one agent turn.
#   PHOENIX_ENABLED=true PHOENIX_COLLECTOR_ENDPOINT=http://localhost:6006/v1/traces \
#   PHOENIX_PROJECT_NAME=trading-lab LAB_AGENTS_ADAPTER=mastra <run one turn-interpreter/analyst turn>
#
# Fallback (no keys): POST a minimal OTLP span marked as an agent_run to the collector,
# so the REST read shape (envelope + span object keys) can still be captured:
curl -s -X POST http://localhost:6006/v1/traces \
  -H 'content-type: application/json' \
  -d @docs/superpowers/notes/otlp-sample-agent-span.json
```
Expected: span(s) accepted (HTTP 200). (Authoring `otlp-sample-agent-span.json` is optional; the documented shape in Step 4 is enough to proceed if a live capture is impossible.)

- [ ] **Step 3: Capture the spans response into the fixture**

```bash
curl -s "http://localhost:6006/v1/projects/trading-lab/spans?limit=50" \
  -o src/read-api/phoenix/__fixtures__/phoenix-spans.fixture.json
cat src/read-api/phoenix/__fixtures__/phoenix-spans.fixture.json | head -c 1200
```
If the project name differs on this instance, first `curl http://localhost:6006/v1/projects` to find the identifier and substitute it. If no live span could be produced, hand-write the fixture from the documented shape in Step 4 instead.

- [ ] **Step 4: Record findings**

Write `docs/superpowers/notes/2026-06-27-phoenix-span-shape.md` capturing the OBSERVED (or documented-fallback) facts the reader relies on. Documented shape to confirm/replace:

```markdown
# Phoenix span REST shape (confirmed 2026-06-27)

GET /v1/projects/{project}/spans?limit=&cursor=  ->  { spans: [...], next_cursor }

Span object keys actually returned (fill in from fixture):
- context.trace_id, context.span_id
- parent_id            (null for root)
- name                 (the agent_run span name == agent identity)
- span_kind            ("AGENT" | "LLM" | "TOOL" | "CHAIN")  [or attributes["openinference.span.kind"]]
- start_time, end_time (ISO-8601)
- status_code          ("OK" | "ERROR" | "UNSET")
- attributes           (flat object; e.g. "metadata.agentId", "llm.model_name",
                        "llm.token_count.prompt", "llm.token_count.completion",
                        "llm.token_count.total")

AGENT-span identity observed: name = "<value>"  (record exact string)
metadata.agentId present? <yes/no, value>
```

- [ ] **Step 5: Tear down and commit**

```bash
docker rm -f phoenix-spike
git add src/read-api/phoenix/__fixtures__/phoenix-spans.fixture.json docs/superpowers/notes/2026-06-27-phoenix-span-shape.md
git commit -m "spike(read-api): confirm Phoenix span REST shape + agent identity, add fixture"
```

> **Outcome that feeds later tasks:** the exact field names (`span_kind` vs nested attribute; `status_code` values; `name` format such as bare `strategy-analyst` vs `agent.strategy-analyst`). The reader (Task A4) is built tolerant (match by `name` OR `attributes['metadata.agentId']`), so the plan proceeds even if only the documented shape is available — but update the fixture/types if the live capture differs.

---

### Task A2: Phoenix read-config in env

**Files:**
- Modify: `src/config/env.ts` (the `Env` interface and `loadEnv` return; near the existing `PHOENIX_*` block at the interface, and the `PHOENIX_ENABLED/COLLECTOR/PROJECT` lines in `loadEnv`)
- Test: `src/config/env.test.ts`

**Interfaces:**
- Produces: `Env.PHOENIX_READ_BASE_URL: string`, `Env.PHOENIX_API_KEY?: string`.

- [ ] **Step 1: Write the failing test**

Add to `src/config/env.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { loadEnv } from './env.ts';

describe('loadEnv — Phoenix read config', () => {
  it('derives PHOENIX_READ_BASE_URL from the collector endpoint by default', () => {
    const env = loadEnv({ PHOENIX_COLLECTOR_ENDPOINT: 'http://phoenix:6006/v1/traces' } as NodeJS.ProcessEnv);
    expect(env.PHOENIX_READ_BASE_URL).toBe('http://phoenix:6006');
  });

  it('honors an explicit PHOENIX_READ_BASE_URL and PHOENIX_API_KEY', () => {
    const env = loadEnv({ PHOENIX_READ_BASE_URL: 'http://px:6006/', PHOENIX_API_KEY: 'k' } as NodeJS.ProcessEnv);
    expect(env.PHOENIX_READ_BASE_URL).toBe('http://px:6006');
    expect(env.PHOENIX_API_KEY).toBe('k');
  });

  it('defaults the read base url to localhost when nothing is set', () => {
    expect(loadEnv({} as NodeJS.ProcessEnv).PHOENIX_READ_BASE_URL).toBe('http://localhost:6006');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/config/env.test.ts -t "Phoenix read config"`
Expected: FAIL (`PHOENIX_READ_BASE_URL` undefined).

- [ ] **Step 3: Implement**

In `src/config/env.ts`, add to the `Env` interface (next to the existing `PHOENIX_*` fields):

```typescript
  /** Phoenix REST read base URL (no trailing slash). Defaults to PHOENIX_COLLECTOR_ENDPOINT minus /v1/traces, else http://localhost:6006. */
  PHOENIX_READ_BASE_URL: string;
  /** Optional Bearer token for the Phoenix REST API (self-hosted default: none). */
  PHOENIX_API_KEY?: string;
```

Add a helper above `loadEnv`:

```typescript
function derivePhoenixReadBaseUrl(source: NodeJS.ProcessEnv): string {
  const explicit = source.PHOENIX_READ_BASE_URL;
  if (explicit && explicit.trim() !== '') return explicit.replace(/\/+$/, '');
  const collector = source.PHOENIX_COLLECTOR_ENDPOINT ?? 'http://localhost:6006/v1/traces';
  return collector.replace(/\/v1\/traces\/?$/, '').replace(/\/+$/, '') || 'http://localhost:6006';
}
```

In the `loadEnv` return object, beside the existing `PHOENIX_*` lines, add:

```typescript
    PHOENIX_READ_BASE_URL: derivePhoenixReadBaseUrl(source),
    PHOENIX_API_KEY: source.PHOENIX_API_KEY,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/config/env.test.ts -t "Phoenix read config"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config/env.ts src/config/env.test.ts
git commit -m "feat(read-api): add PHOENIX_READ_BASE_URL + PHOENIX_API_KEY env"
```

---

### Task A3: Phoenix trace DTOs + the raw-span → DTO mapper

**Files:**
- Create: `src/read-api/phoenix/trace-dto.ts`
- Test: `src/read-api/phoenix/trace-dto.test.ts`

**Interfaces:**
- Produces:
  - `type TraceReasonCode = 'tracing-disabled' | 'phoenix-unreachable' | 'no-traces';`
  - `interface SpanDto { spanId; parentSpanId: string | null; name; kind: 'AGENT'|'LLM'|'TOOL'|'CHAIN'; startTime; latencyMs; status: 'ok'|'error'; llm?: { model?: string; tokensIn?: number; tokensOut?: number } }`
  - `interface TraceDto { traceId; startTime; status: 'ok'|'error'; latencyMs; tokens?: { prompt?: number; completion?: number; total?: number }; costUsd?: number | null; rootName; spans: SpanDto[] }`
  - `interface AgentTracesDto { agentId: string; reasonCode: TraceReasonCode | null; traces: TraceDto[] }`
  - `interface RawPhoenixSpan { ... }` (matches the fixture from A1)
  - `function buildTracesFromSpans(rawSpans: RawPhoenixSpan[], matchAgent: (root: RawPhoenixSpan) => boolean): TraceDto[]`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { buildTracesFromSpans, type RawPhoenixSpan } from './trace-dto.ts';

const span = (o: Partial<RawPhoenixSpan> & { trace_id: string; span_id: string }): RawPhoenixSpan => ({
  name: 'x', span_kind: 'CHAIN', parent_id: null,
  start_time: '2026-06-27T10:00:00.000Z', end_time: '2026-06-27T10:00:01.000Z',
  status_code: 'OK', attributes: {},
  context: { trace_id: o.trace_id, span_id: o.span_id },
  ...o,
});

describe('buildTracesFromSpans', () => {
  it('groups spans by trace, keeps only traces whose root AGENT span matches, and nests spans', () => {
    const raw: RawPhoenixSpan[] = [
      span({ trace_id: 't1', span_id: 'a', name: 'strategy-analyst', span_kind: 'AGENT' }),
      span({ trace_id: 't1', span_id: 'b', parent_id: 'a', name: 'gpt', span_kind: 'LLM',
        attributes: { 'llm.model_name': 'claude', 'llm.token_count.prompt': 10, 'llm.token_count.completion': 5, 'llm.token_count.total': 15 } }),
      span({ trace_id: 't2', span_id: 'c', name: 'researcher', span_kind: 'AGENT' }), // different agent, filtered out
    ];
    const out = buildTracesFromSpans(raw, (root) => root.name === 'strategy-analyst');
    expect(out).toHaveLength(1);
    expect(out[0]!.traceId).toBe('t1');
    expect(out[0]!.rootName).toBe('strategy-analyst');
    expect(out[0]!.latencyMs).toBe(1000);
    expect(out[0]!.tokens).toEqual({ prompt: 10, completion: 5, total: 15 });
    expect(out[0]!.spans.map((s) => s.spanId)).toEqual(['a', 'b']);
    const llm = out[0]!.spans.find((s) => s.kind === 'LLM')!;
    expect(llm.llm).toEqual({ model: 'claude', tokensIn: 10, tokensOut: 5 });
  });

  it('marks a trace as error when any span has status_code ERROR', () => {
    const raw: RawPhoenixSpan[] = [
      span({ trace_id: 't1', span_id: 'a', name: 'builder', span_kind: 'AGENT' }),
      span({ trace_id: 't1', span_id: 'b', parent_id: 'a', name: 'tool', span_kind: 'TOOL', status_code: 'ERROR' }),
    ];
    expect(buildTracesFromSpans(raw, () => true)[0]!.status).toBe('error');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/read-api/phoenix/trace-dto.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/read-api/phoenix/trace-dto.ts`**

```typescript
export type TraceReasonCode = 'tracing-disabled' | 'phoenix-unreachable' | 'no-traces';
export type SpanKind = 'AGENT' | 'LLM' | 'TOOL' | 'CHAIN';

export interface RawPhoenixSpan {
  name: string;
  span_kind: string;
  parent_id: string | null;
  start_time: string;
  end_time: string;
  status_code: string;
  attributes: Record<string, unknown>;
  context: { trace_id: string; span_id: string };
}

export interface SpanDto {
  spanId: string;
  parentSpanId: string | null;
  name: string;
  kind: SpanKind;
  startTime: string;
  latencyMs: number;
  status: 'ok' | 'error';
  llm?: { model?: string; tokensIn?: number; tokensOut?: number };
}

export interface TraceDto {
  traceId: string;
  startTime: string;
  status: 'ok' | 'error';
  latencyMs: number;
  tokens?: { prompt?: number; completion?: number; total?: number };
  costUsd?: number | null;
  rootName: string;
  spans: SpanDto[];
}

export interface AgentTracesDto {
  agentId: string;
  reasonCode: TraceReasonCode | null;
  traces: TraceDto[];
}

const KINDS: SpanKind[] = ['AGENT', 'LLM', 'TOOL', 'CHAIN'];
const toKind = (s: RawPhoenixSpan): SpanKind => {
  const raw = String(s.span_kind ?? s.attributes['openinference.span.kind'] ?? 'CHAIN').toUpperCase();
  return (KINDS as string[]).includes(raw) ? (raw as SpanKind) : 'CHAIN';
};
const ms = (start: string, end: string): number => Math.max(0, Date.parse(end) - Date.parse(start));
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const isError = (s: RawPhoenixSpan): boolean => String(s.status_code).toUpperCase() === 'ERROR';

function toSpanDto(s: RawPhoenixSpan): SpanDto {
  const kind = toKind(s);
  const tokensIn = num(s.attributes['llm.token_count.prompt']);
  const tokensOut = num(s.attributes['llm.token_count.completion']);
  const model = s.attributes['llm.model_name'];
  const llm =
    kind === 'LLM' ? { model: typeof model === 'string' ? model : undefined, tokensIn, tokensOut } : undefined;
  return {
    spanId: s.context.span_id,
    parentSpanId: s.parent_id ?? null,
    name: s.name,
    kind,
    startTime: s.start_time,
    latencyMs: ms(s.start_time, s.end_time),
    status: isError(s) ? 'error' : 'ok',
    ...(llm ? { llm } : {}),
  };
}

export function buildTracesFromSpans(
  rawSpans: RawPhoenixSpan[],
  matchAgent: (root: RawPhoenixSpan) => boolean,
): TraceDto[] {
  const byTrace = new Map<string, RawPhoenixSpan[]>();
  for (const s of rawSpans) {
    const id = s.context.trace_id;
    (byTrace.get(id) ?? byTrace.set(id, []).get(id)!).push(s);
  }
  const traces: TraceDto[] = [];
  for (const [traceId, spans] of byTrace) {
    const root = spans.find((s) => s.parent_id == null && toKind(s) === 'AGENT')
      ?? spans.find((s) => toKind(s) === 'AGENT');
    if (!root || !matchAgent(root)) continue;
    const ordered = [...spans].sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time));
    const totalPrompt = ordered.reduce((n, s) => n + (num(s.attributes['llm.token_count.prompt']) ?? 0), 0);
    const totalCompletion = ordered.reduce((n, s) => n + (num(s.attributes['llm.token_count.completion']) ?? 0), 0);
    traces.push({
      traceId,
      startTime: root.start_time,
      status: ordered.some(isError) ? 'error' : 'ok',
      latencyMs: ms(root.start_time, root.end_time),
      tokens: { prompt: totalPrompt, completion: totalCompletion, total: totalPrompt + totalCompletion },
      costUsd: null,
      rootName: root.name,
      spans: ordered.map(toSpanDto),
    });
  }
  return traces.sort((a, b) => Date.parse(b.startTime) - Date.parse(a.startTime));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/read-api/phoenix/trace-dto.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/read-api/phoenix/trace-dto.ts src/read-api/phoenix/trace-dto.test.ts
git commit -m "feat(read-api): Phoenix trace DTOs + span-grouping mapper"
```

---

### Task A4: PhoenixTraceReader (client + gating + agent matching)

**Files:**
- Create: `src/read-api/phoenix/phoenix-trace-reader.ts`
- Test: `src/read-api/phoenix/phoenix-trace-reader.test.ts`

**Interfaces:**
- Consumes: `AgentTracesDto`, `RawPhoenixSpan`, `buildTracesFromSpans` (Task A3).
- Produces:
  - `interface PhoenixTraceReaderDeps { enabled: boolean; baseUrl: string; projectName: string; apiKey?: string; limit?: number; fetchImpl?: typeof fetch; requestTimeoutMs?: number; }`
  - `class PhoenixTraceReader { constructor(deps); getAgentTraces(labAgentId: string): Promise<AgentTracesDto>; }`
  - The lab-agent-id → mastra-span-name candidate map (`LAB_AGENT_SPAN_CANDIDATES`).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { PhoenixTraceReader } from './phoenix-trace-reader.ts';

const spansResponse = (spans: unknown[]) =>
  new Response(JSON.stringify({ spans, next_cursor: null }), { status: 200, headers: { 'content-type': 'application/json' } });

const agentSpan = (trace: string, name: string) => ({
  name, span_kind: 'AGENT', parent_id: null,
  start_time: '2026-06-27T10:00:00.000Z', end_time: '2026-06-27T10:00:02.000Z',
  status_code: 'OK', attributes: {}, context: { trace_id: trace, span_id: trace + '-root' },
});

const base = { baseUrl: 'http://px:6006', projectName: 'trading-lab' };

describe('PhoenixTraceReader', () => {
  it('returns tracing-disabled (no fetch) when disabled', async () => {
    const fetchImpl = vi.fn();
    const r = new PhoenixTraceReader({ ...base, enabled: false, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await r.getAgentTraces('analyst')).toEqual({ agentId: 'analyst', reasonCode: 'tracing-disabled', traces: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('queries the project spans endpoint with the api key and maps matching traces', async () => {
    const fetchImpl = vi.fn(async () => spansResponse([agentSpan('t1', 'strategy-analyst')]));
    const r = new PhoenixTraceReader({ ...base, enabled: true, apiKey: 'k', fetchImpl: fetchImpl as unknown as typeof fetch });
    const out = await r.getAgentTraces('analyst');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toContain('/v1/projects/trading-lab/spans');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k');
    expect(out.reasonCode).toBeNull();
    expect(out.traces.map((t) => t.traceId)).toEqual(['t1']);
  });

  it('matches by metadata.agentId when the span name differs', async () => {
    const s = { ...agentSpan('t9', 'agent.run'), attributes: { 'metadata.agentId': 'researcher' } };
    const r = new PhoenixTraceReader({ ...base, enabled: true, fetchImpl: (async () => spansResponse([s])) as unknown as typeof fetch });
    expect((await r.getAgentTraces('researcher')).traces).toHaveLength(1);
  });

  it('returns no-traces when nothing matches the agent', async () => {
    const r = new PhoenixTraceReader({ ...base, enabled: true, fetchImpl: (async () => spansResponse([agentSpan('t1', 'builder')])) as unknown as typeof fetch });
    expect(await r.getAgentTraces('analyst')).toEqual({ agentId: 'analyst', reasonCode: 'no-traces', traces: [] });
  });

  it('returns phoenix-unreachable (no throw, no leak) when the fetch fails', async () => {
    const r = new PhoenixTraceReader({ ...base, enabled: true, fetchImpl: (async () => { throw new Error('ECONNREFUSED secret://px'); }) as unknown as typeof fetch });
    const out = await r.getAgentTraces('analyst');
    expect(out).toEqual({ agentId: 'analyst', reasonCode: 'phoenix-unreachable', traces: [] });
  });

  it('returns phoenix-unreachable on a non-2xx Phoenix response', async () => {
    const r = new PhoenixTraceReader({ ...base, enabled: true, fetchImpl: (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch });
    expect((await r.getAgentTraces('analyst')).reasonCode).toBe('phoenix-unreachable');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/read-api/phoenix/phoenix-trace-reader.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/read-api/phoenix/phoenix-trace-reader.ts`**

```typescript
import { buildTracesFromSpans, type AgentTracesDto, type RawPhoenixSpan } from './trace-dto.ts';

export interface PhoenixTraceReaderDeps {
  enabled: boolean;
  baseUrl: string;
  projectName: string;
  apiKey?: string;
  limit?: number;
  requestTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Lab read-api agent id -> candidate mastra agent span names. Identity is the
 * AGENT (agent_run) span name OR attributes['metadata.agentId']. Confirm/refine
 * the exact strings against the Task A1 fixture. 'system' (office "boss") is the
 * orchestrator and has no mastra agent_run span -> no candidates -> no-traces.
 */
export const LAB_AGENT_SPAN_CANDIDATES: Record<string, string[]> = {
  analyst: ['strategy-analyst'],
  researcher: ['researcher'],
  critic: ['critic', 'strategy-critic-combined'],
  builder: ['builder'],
  system: [],
};

export class PhoenixTraceReader {
  private readonly fetchImpl: typeof fetch;
  constructor(private readonly deps: PhoenixTraceReaderDeps) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
  }

  async getAgentTraces(labAgentId: string): Promise<AgentTracesDto> {
    if (!this.deps.enabled) return { agentId: labAgentId, reasonCode: 'tracing-disabled', traces: [] };

    const candidates = LAB_AGENT_SPAN_CANDIDATES[labAgentId] ?? [labAgentId];
    let raw: RawPhoenixSpan[];
    try {
      raw = await this.fetchSpans();
    } catch {
      // Never surface the raw error/url/key — typed state only.
      return { agentId: labAgentId, reasonCode: 'phoenix-unreachable', traces: [] };
    }

    const matchAgent = (root: RawPhoenixSpan): boolean => {
      const metaId = root.attributes['metadata.agentId'];
      return candidates.some((c) => root.name === c || root.name === `agent.${c}` || metaId === c);
    };
    const traces = candidates.length === 0 ? [] : buildTracesFromSpans(raw, matchAgent);
    if (traces.length === 0) return { agentId: labAgentId, reasonCode: 'no-traces', traces: [] };
    return { agentId: labAgentId, reasonCode: null, traces };
  }

  private async fetchSpans(): Promise<RawPhoenixSpan[]> {
    const limit = this.deps.limit ?? 200;
    const url = `${this.deps.baseUrl}/v1/projects/${encodeURIComponent(this.deps.projectName)}/spans?limit=${limit}`;
    const headers: Record<string, string> = { accept: 'application/json' };
    if (this.deps.apiKey) headers.Authorization = `Bearer ${this.deps.apiKey}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.deps.requestTimeoutMs ?? 4000);
    try {
      const res = await this.fetchImpl(url, { headers, signal: ctrl.signal });
      if (!res.ok) throw new Error(`phoenix ${res.status}`);
      const body = (await res.json()) as { spans?: RawPhoenixSpan[] };
      return body.spans ?? [];
    } finally {
      clearTimeout(timer);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/read-api/phoenix/phoenix-trace-reader.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/read-api/phoenix/phoenix-trace-reader.ts src/read-api/phoenix/phoenix-trace-reader.test.ts
git commit -m "feat(read-api): PhoenixTraceReader with gating, agent matching, typed reason codes"
```

---

### Task A5: Lab route `GET /agents/:agentId/traces` + deps wiring + composition

**Files:**
- Modify: `src/read-api/deps.ts` (add `phoenixTraces` to `ReadApiDeps`)
- Create: `src/read-api/routes/agent-traces.ts`
- Modify: `src/read-api/read-app.ts` (register the new route on `v1`)
- Modify: `src/composition.ts:299-315` (construct the reader, add to `read`)
- Test: `src/read-api/routes/agent-traces.test.ts`

**Interfaces:**
- Consumes: `PhoenixTraceReader` (A4), `AgentTracesDto`.
- Produces: `registerAgentTraceRoutes(app: Hono, deps: { phoenixTraces: Pick<PhoenixTraceReader, 'getAgentTraces'> }): void`; `ReadApiDeps.phoenixTraces: Pick<PhoenixTraceReader, 'getAgentTraces'>`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { registerAgentTraceRoutes } from './agent-traces.ts';
import type { AgentTracesDto } from '../phoenix/trace-dto.ts';

const reader = (out: AgentTracesDto) => ({ getAgentTraces: async () => out });

describe('GET /agents/:agentId/traces', () => {
  it('200 with the reader DTO', async () => {
    const app = new Hono();
    registerAgentTraceRoutes(app, { phoenixTraces: reader({ agentId: 'analyst', reasonCode: null, traces: [] }) });
    const res = await app.request('/agents/analyst/traces');
    expect(res.status).toBe(200);
    expect((await res.json() as AgentTracesDto).agentId).toBe('analyst');
  });

  it('200 + tracing-disabled passes the reason code through (not an error)', async () => {
    const app = new Hono();
    registerAgentTraceRoutes(app, { phoenixTraces: reader({ agentId: 'analyst', reasonCode: 'tracing-disabled', traces: [] }) });
    const res = await app.request('/agents/analyst/traces');
    expect(res.status).toBe(200);
    expect((await res.json() as AgentTracesDto).reasonCode).toBe('tracing-disabled');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/read-api/routes/agent-traces.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/read-api/routes/agent-traces.ts`:

```typescript
import type { Hono } from 'hono';
import type { PhoenixTraceReader } from '../phoenix/phoenix-trace-reader.ts';

export interface AgentTraceRouteDeps {
  phoenixTraces: Pick<PhoenixTraceReader, 'getAgentTraces'>;
}

export function registerAgentTraceRoutes(app: Hono, deps: AgentTraceRouteDeps): void {
  app.get('/agents/:agentId/traces', async (c) =>
    c.json(await deps.phoenixTraces.getAgentTraces(c.req.param('agentId'))),
  );
}
```

In `src/read-api/deps.ts`, add the import and field:

```typescript
import type { PhoenixTraceReader } from './phoenix/phoenix-trace-reader.ts';
// ...inside ReadApiDeps:
  phoenixTraces: Pick<PhoenixTraceReader, 'getAgentTraces'>;
```

In `src/read-api/read-app.ts`, import and register beside the other `register*Routes(v1, deps)` calls:

```typescript
import { registerAgentTraceRoutes } from './routes/agent-traces.ts';
// ...after registerAgentRoutes(v1, deps);
  registerAgentTraceRoutes(v1, deps);
```

In `src/composition.ts`, add the import near the other read-api imports (around line 74):

```typescript
import { PhoenixTraceReader } from './read-api/phoenix/phoenix-trace-reader.ts';
```

and in the `read: ReadApiDeps = { ... }` literal (around line 299), add:

```typescript
    phoenixTraces: new PhoenixTraceReader({
      enabled: env.PHOENIX_ENABLED,
      baseUrl: env.PHOENIX_READ_BASE_URL,
      projectName: env.PHOENIX_PROJECT_NAME,
      apiKey: env.PHOENIX_API_KEY,
    }),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/read-api/routes/agent-traces.test.ts && npx tsc --noEmit`
Expected: route test PASS; typecheck clean (composition + deps wired).

- [ ] **Step 5: Commit**

```bash
git add src/read-api/routes/agent-traces.ts src/read-api/routes/agent-traces.test.ts src/read-api/deps.ts src/read-api/read-app.ts src/composition.ts
git commit -m "feat(read-api): GET /agents/:agentId/traces backed by PhoenixTraceReader"
```

---

### Task A6: Document the new env in `.env.example`s

**Files:**
- Modify: `.env.example` (and `.env.local.example`, `.env.demo.example`, `.env.vps.example` if present — match the existing `PHOENIX_*` block placement)

- [ ] **Step 1: Add the variables** (under the existing Phoenix section in each example file)

```bash
# Phoenix REST read API (office surfaces agent traces through trading-lab).
# Defaults to PHOENIX_COLLECTOR_ENDPOINT minus /v1/traces.
PHOENIX_READ_BASE_URL=http://localhost:6006
# Optional Bearer token if the Phoenix instance has auth enabled.
PHOENIX_API_KEY=
```
(For docker overlays use `http://phoenix:6006`.)

- [ ] **Step 2: Commit**

```bash
git add .env.example .env.local.example .env.demo.example .env.vps.example
git commit -m "docs(read-api): document PHOENIX_READ_BASE_URL / PHOENIX_API_KEY"
```

> **End of Phase A.** Run the full lab suite before moving on: `npx vitest run` → all green.

---

## Phase B — trading-office (consumer)

All paths in Phase B are under `/home/alexxxnikolskiy/projects/trading-office`.

### Task B1: Shared `agentTraces` schema + API path (office-gateway)

**Files:**
- Modify: `packages/office-gateway/src/schemas.ts` (add the schema + inferred types; export beside `agentActivitySchema`)
- Modify: `packages/office-gateway/src/http.ts` (add `agentTracesPattern` + `agentTraces(id)`)
- Test: `packages/office-gateway/src/schemas.test.ts` (create if absent, else append)

**Interfaces:**
- Produces: `agentTracesSchema`, types `AgentTraces`, `Trace`, `TraceSpan`, `TraceReasonCode`; `OFFICE_API.agentTracesPattern`, `OFFICE_API.agentTraces(agentId)`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { agentTracesSchema, OFFICE_API } from './index';

describe('agentTracesSchema', () => {
  it('parses an ok payload with a nested span tree', () => {
    const parsed = agentTracesSchema.parse({
      agentId: 'analyst', reasonCode: null,
      traces: [{ traceId: 't1', startTime: '2026-06-27T10:00:00.000Z', status: 'ok', latencyMs: 1000,
        tokens: { prompt: 10, completion: 5, total: 15 }, costUsd: null, rootName: 'strategy-analyst',
        spans: [{ spanId: 'a', parentSpanId: null, name: 'strategy-analyst', kind: 'AGENT',
          startTime: '2026-06-27T10:00:00.000Z', latencyMs: 1000, status: 'ok' }] }],
    });
    expect(parsed.traces[0]!.spans[0]!.kind).toBe('AGENT');
  });

  it('accepts the typed reason codes and rejects unknown ones', () => {
    expect(agentTracesSchema.parse({ agentId: 'x', reasonCode: 'no-traces', traces: [] }).reasonCode).toBe('no-traces');
    expect(() => agentTracesSchema.parse({ agentId: 'x', reasonCode: 'bogus', traces: [] })).toThrow();
  });

  it('builds the traces path', () => {
    expect(OFFICE_API.agentTraces('a b')).toBe('/api/office/agents/a%20b/traces');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/office-gateway/src/schemas.test.ts -t agentTracesSchema`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `packages/office-gateway/src/schemas.ts` (after `agentActivitySchema`):

```typescript
export const traceReasonCodeSchema = z.enum(['tracing-disabled', 'phoenix-unreachable', 'no-traces']);

export const traceSpanSchema = z.object({
  spanId: z.string(),
  parentSpanId: z.string().nullable(),
  name: z.string(),
  kind: z.enum(['AGENT', 'LLM', 'TOOL', 'CHAIN']),
  startTime: z.string(),
  latencyMs: z.number(),
  status: z.enum(['ok', 'error']),
  llm: z.object({ model: z.string().optional(), tokensIn: z.number().optional(), tokensOut: z.number().optional() }).optional(),
});

export const traceSchema = z.object({
  traceId: z.string(),
  startTime: z.string(),
  status: z.enum(['ok', 'error']),
  latencyMs: z.number(),
  tokens: z.object({ prompt: z.number().optional(), completion: z.number().optional(), total: z.number().optional() }).optional(),
  costUsd: z.number().nullable().optional(),
  rootName: z.string(),
  spans: z.array(traceSpanSchema),
});

export const agentTracesSchema = z.object({
  agentId: z.string(),
  reasonCode: traceReasonCodeSchema.nullable(),
  traces: z.array(traceSchema),
});

export type TraceReasonCode = z.infer<typeof traceReasonCodeSchema>;
export type TraceSpan = z.infer<typeof traceSpanSchema>;
export type Trace = z.infer<typeof traceSchema>;
export type AgentTraces = z.infer<typeof agentTracesSchema>;
```

In `packages/office-gateway/src/http.ts`, add inside the `OFFICE_API` object (after the `agentActivity` entries):

```typescript
  agentTracesPattern: '/api/office/agents/:agentId/traces',
  agentTraces: (agentId: string) => `/api/office/agents/${encodeURIComponent(agentId)}/traces`,
```

Confirm the new schema/types are re-exported from the package barrel (`packages/office-gateway/src/index.ts`) the same way `agentActivitySchema` is; add the exports if the barrel lists names explicitly.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/office-gateway/src/schemas.test.ts -t agentTracesSchema`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/office-gateway/src
git commit -m "feat(office-gateway): agentTraces schema + API path"
```

---

### Task B2: `TradingLabHttpClient.getAgentTraces`

**Files:**
- Modify: `apps/server/src/connector/tradinglab/TradingLabHttpClient.ts`
- Test: `apps/server/src/connector/tradinglab/TradingLabHttpClient.test.ts`

**Interfaces:**
- Consumes: `AgentTraces` (Task B1), existing private `getJson<T>(path, auth)`.
- Produces: `TradingLabHttpClient.getAgentTraces(labAgentId: string): Promise<AgentTraces>`.

- [ ] **Step 1: Write the failing test** (append)

```typescript
  it('getAgentTraces calls /v1/agents/:id/traces with the bearer token', async () => {
    const fetchImpl = vi.fn(async () => ok({ agentId: 'analyst', reasonCode: null, traces: [] }));
    const client = new TradingLabHttpClient({ ...cfg, fetchImpl });
    await client.getAgentTraces('analyst');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe('http://lab:3100/v1/agents/analyst/traces');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/server/src/connector/tradinglab/TradingLabHttpClient.test.ts -t getAgentTraces`
Expected: FAIL (method missing).

- [ ] **Step 3: Implement** (beside `getAgent`)

```typescript
  getAgentTraces(agentId: string): Promise<AgentTraces> {
    return this.getJson(`/v1/agents/${encodeURIComponent(agentId)}/traces`, true);
  }
```
Add `AgentTraces` to the existing `@trading-office/office-gateway` import at the top of the file.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/server/src/connector/tradinglab/TradingLabHttpClient.test.ts -t getAgentTraces`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/connector/tradinglab/TradingLabHttpClient.ts apps/server/src/connector/tradinglab/TradingLabHttpClient.test.ts
git commit -m "feat(office/connector): TradingLabHttpClient.getAgentTraces"
```

---

### Task B3: `TradingLabReadConnector.getAgentTraces` + interface method

**Files:**
- Modify: `apps/server/src/connector/OfficeReadConnector.ts` (add to interface)
- Modify: `apps/server/src/connector/tradinglab/TradingLabReadConnector.ts`
- Test: `apps/server/src/connector/tradinglab/TradingLabReadConnector.test.ts`

**Interfaces:**
- Consumes: `AgentTraces`, `mapOfficeAgentIdToLab` (existing), `TradingLabHttpClient.getAgentTraces` (B2).
- Produces: `OfficeReadConnector.getAgentTraces(agentId): Promise<AgentTraces>`; same on `TradingLabReadConnector`.
- Behavior: office agent with no lab source → `{ agentId, reasonCode: 'no-traces', traces: [] }` (no lab call). Otherwise STRICT proxy: map id, call client, return the body (lab-level errors propagate to `app.onError`, mirroring `getAgentActivity`).

- [ ] **Step 1: Write the failing test** (append)

```typescript
  it('getAgentTraces("boss") proxies to /v1/agents/system/traces and returns the dto', async () => {
    const fetchImpl = vi.fn(async () => json({ agentId: 'system', reasonCode: null, traces: [] }));
    const c = conn(fetchImpl as unknown as typeof fetch);
    const out = await c.getAgentTraces('boss');
    expect(String((fetchImpl.mock.calls[0] as unknown as [string])[0])).toBe('http://lab:3100/v1/agents/system/traces');
    expect(out.reasonCode).toBeNull();
  });

  it('getAgentTraces for a no-source agent returns no-traces WITHOUT calling lab', async () => {
    const fetchImpl = vi.fn(async () => json({}));
    const c = conn(fetchImpl as unknown as typeof fetch);
    expect(await c.getAgentTraces('evaluator')).toEqual({ agentId: 'evaluator', reasonCode: 'no-traces', traces: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/server/src/connector/tradinglab/TradingLabReadConnector.test.ts -t getAgentTraces`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `OfficeReadConnector.ts` add `AgentTraces` to the gateway import and the method to the interface:

```typescript
  getAgentTraces(agentId: string): Promise<AgentTraces>;
```

In `TradingLabReadConnector.ts` add `AgentTraces` to the import and the method (after `getAgentActivity`):

```typescript
  async getAgentTraces(agentId: string): Promise<AgentTraces> {
    const labId = mapOfficeAgentIdToLab(agentId);
    if (!labId) return { agentId, reasonCode: 'no-traces', traces: [] };
    // Strict proxy: lab-level upstream errors propagate to app.onError (401/502).
    return this.client.getAgentTraces(labId);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/server/src/connector/tradinglab/TradingLabReadConnector.test.ts -t getAgentTraces`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/connector/OfficeReadConnector.ts apps/server/src/connector/tradinglab/TradingLabReadConnector.ts apps/server/src/connector/tradinglab/TradingLabReadConnector.test.ts
git commit -m "feat(office/connector): TradingLabReadConnector.getAgentTraces (no-source -> no-traces)"
```

---

### Task B4: `CompositeOfficeReadConnector.getAgentTraces`

**Files:**
- Modify: `apps/server/src/connector/CompositeOfficeReadConnector.ts`
- Test: `apps/server/src/connector/CompositeOfficeReadConnector.test.ts`

**Interfaces:**
- Consumes: `TradingLabReadConnector.getAgentTraces` (B3).
- Produces: `CompositeOfficeReadConnector.getAgentTraces`; `CompositeDeps.read` Pick gains `'getAgentTraces'`.

- [ ] **Step 1: Write the failing test** (append; mirror the existing delegation tests)

```typescript
  it('delegates getAgentTraces to the lab read connector', async () => {
    const read = { getAgentTraces: vi.fn(async () => ({ agentId: 'analyst', reasonCode: null, traces: [] })) };
    const c = new CompositeOfficeReadConnector({ read: read as never, infra: { getInfraStatus: async () => ({}) } as never, startBridge: () => () => {} });
    await c.getAgentTraces('analyst');
    expect(read.getAgentTraces).toHaveBeenCalledWith('analyst');
  });
```
(Match the existing test file's construction style for `CompositeDeps`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/server/src/connector/CompositeOfficeReadConnector.test.ts -t getAgentTraces`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add `'getAgentTraces'` to the `read:` Pick in `CompositeDeps`:

```typescript
  read: Pick<TradingLabReadConnector, 'getAgentStatuses' | 'getAgentActivity' | 'getAgentTraces' | 'getHypotheses' | 'getBacktests'>;
```

Add the delegating method (beside `getAgentActivity`):

```typescript
  getAgentTraces(agentId: string): Promise<AgentTraces> { return this.deps.read.getAgentTraces(agentId); }
```
Add `AgentTraces` to the gateway import.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/server/src/connector/CompositeOfficeReadConnector.test.ts -t getAgentTraces`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/connector/CompositeOfficeReadConnector.ts apps/server/src/connector/CompositeOfficeReadConnector.test.ts
git commit -m "feat(office/connector): Composite delegates getAgentTraces"
```

---

### Task B5: Server route `GET /api/office/agents/:agentId/traces`

**Files:**
- Modify: `apps/server/src/app.ts` (register beside `agentActivityPattern`)
- Test: `apps/server/src/app.test.ts` (append; mirror an existing route test)

**Interfaces:**
- Consumes: `OFFICE_API.agentTracesPattern` (B1), `deps.connector.getAgentTraces` (B4).

- [ ] **Step 1: Write the failing test** (mirror the existing `app.test.ts` setup that builds the app with a stub connector)

```typescript
  it('GET /api/office/agents/:id/traces returns the connector dto', async () => {
    const connector = stubConnector({ getAgentTraces: async (id: string) => ({ agentId: id, reasonCode: null, traces: [] }) });
    const app = createOfficeApp({ ...baseDeps, connector });
    const res = await app.request(OFFICE_API.agentTraces('analyst'), { headers: AUTH });
    expect(res.status).toBe(200);
    expect((await res.json()).agentId).toBe('analyst');
  });
```
(Use the file's existing `stubConnector`/`baseDeps`/`AUTH` helpers; add `getAgentTraces` to the stub.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/server/src/app.test.ts -t traces`
Expected: FAIL (404 / route missing).

- [ ] **Step 3: Implement** (after the `agentActivityPattern` route, ~line 67)

```typescript
  app.get(OFFICE_API.agentTracesPattern, async (c) =>
    c.json(await deps.connector.getAgentTraces(c.req.param('agentId'))),
  );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/server/src/app.test.ts -t traces`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/app.ts apps/server/src/app.test.ts
git commit -m "feat(office/server): GET /api/office/agents/:id/traces route"
```

---

### Task B6: Gateway `getAgentTraces` (web client)

**Files:**
- Modify: `packages/office-gateway/src/gateway.ts` (add to `OfficeGateway` interface)
- Modify: `apps/web/src/runtime/HttpOfficeGateway.ts`
- Test: `apps/web/src/runtime/HttpOfficeGateway.test.ts`

**Interfaces:**
- Consumes: `OFFICE_API.agentTraces` (B1), private `get<T>` (existing).
- Produces: `OfficeGateway.getAgentTraces(agentId): Promise<AgentTraces>`.

- [ ] **Step 1: Write the failing test** (append)

```typescript
  it('reads agent traces over HTTP', async () => {
    const dto = { agentId: 'analyst', reasonCode: null, traces: [] };
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith(OFFICE_API.agentTraces('analyst')) ? jsonResponse(dto) : jsonResponse(null, false, 404),
    );
    const gw = new HttpOfficeGateway({ baseUrl: 'http://x', fetchImpl });
    expect(await gw.getAgentTraces('analyst')).toEqual(dto);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/runtime/HttpOfficeGateway.test.ts -t "agent traces"`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `packages/office-gateway/src/gateway.ts` add to `OfficeGateway` (after `getAgentActivity`):

```typescript
  getAgentTraces(agentId: string): Promise<AgentTraces>;
```
(add `AgentTraces` to its imports).

In `apps/web/src/runtime/HttpOfficeGateway.ts` (after `getAgentActivity`):

```typescript
  getAgentTraces(agentId: string) { return this.get<AgentTraces>(OFFICE_API.agentTraces(agentId)); }
```
(add `AgentTraces` to the gateway import).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/web/src/runtime/HttpOfficeGateway.test.ts -t "agent traces"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/office-gateway/src/gateway.ts apps/web/src/runtime/HttpOfficeGateway.ts apps/web/src/runtime/HttpOfficeGateway.test.ts
git commit -m "feat(office/web): gateway.getAgentTraces"
```

---

### Task B6a: Web component-test infrastructure (RTL + jsdom)

**Why:** The web app currently has no React component / DOM test setup — no `@testing-library/react`, no DOM environment, and `apps/web/vite.config.ts` runs Vitest with `environment: 'node'` and `include: ['src/**/*.test.ts']` (so `.test.tsx` files are not even picked up). Task B7 (and future dashboard work: trading results, paper, strategy ranking) needs component tests. This task adds that infrastructure once.

**Files:**
- Modify: `apps/web/package.json` (devDependencies)
- Modify: `apps/web/vite.config.ts` (Vitest `test` block)
- Create: `apps/web/src/test/setup.ts` (jest-dom matchers)
- Create: `apps/web/src/test/smoke.test.tsx` (proves the harness renders a component)

**Interfaces:**
- Produces: a working `jsdom` + `@testing-library/react` harness where `*.test.tsx` under `apps/web/src` run and `render`/`screen`/`fireEvent` + `@testing-library/jest-dom` matchers (`toBeInTheDocument`, etc.) work.

- [ ] **Step 1: Add dev dependencies**

```bash
cd /home/alexxxnikolskiy/projects/trading-office
npm install -D -w apps/web @testing-library/react @testing-library/dom @testing-library/jest-dom @testing-library/user-event jsdom
```
(These are DEV dependencies — the Global Constraint forbids new *production* deps only.)

- [ ] **Step 2: Configure Vitest for jsdom + tsx**

In `apps/web/vite.config.ts`, update the `test` block to:

```typescript
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
```

Create `apps/web/src/test/setup.ts`:

```typescript
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 3: Write a smoke test**

Create `apps/web/src/test/smoke.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('component-test harness', () => {
  it('renders a component into jsdom', () => {
    render(<button>hello</button>);
    expect(screen.getByRole('button', { name: 'hello' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run the smoke test**

Run: `npx vitest run apps/web/src/test/smoke.test.tsx`
Expected: PASS (proves jsdom env, tsx inclusion, and jest-dom matchers all work).

- [ ] **Step 5: Confirm existing `.test.ts` still pass under the new env**

Run: `npx vitest run -w apps/web` (or the repo's web test script)
Expected: the existing web suite stays green under `environment: 'jsdom'`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json apps/web/vite.config.ts apps/web/src/test/setup.ts apps/web/src/test/smoke.test.tsx package-lock.json
git commit -m "test(office/web): add RTL + jsdom component-test harness"
```

> Note: depending on the repo's lockfile/workspace layout the changed lockfile may be `package-lock.json` at the root; stage whichever lockfile the install touched.

---

### Task B7: `AgentActivityPanel` — Logs | Traces tabs + trace tree

> **Depends on Task B6a** — the RTL + jsdom harness (`environment: 'jsdom'`, `.test.tsx` included, `@testing-library/jest-dom` matchers) is in place. The tests below use `render`/`screen`/`fireEvent` and may use `toBeInTheDocument()`.

**Files:**
- Create: `apps/web/src/floor/panels/AgentTracesView.tsx` (the Traces-tab body — list + expandable span tree + reason-code states)
- Modify: `apps/web/src/floor/panels/AgentActivityPanel.tsx` (add the tab switch; keep existing Logs body unchanged)
- Test: `apps/web/src/floor/panels/AgentTracesView.test.tsx`
- Test: `apps/web/src/floor/panels/AgentActivityPanel.test.tsx` (create if absent — tab switching)

**Interfaces:**
- Consumes: `useGateway` (`getAgentTraces`), `useResource`, `AgentTraces`/`Trace`/`TraceSpan` types, `PanelState`.
- Produces: `AgentTracesView({ agentId }: { agentId: string })`.

- [ ] **Step 1: Write the failing test** for `AgentTracesView`

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentTracesView } from './AgentTracesView';
import * as RuntimeContext from '../../runtime/RuntimeContext';

const withGateway = (getAgentTraces: () => Promise<unknown>) =>
  vi.spyOn(RuntimeContext, 'useGateway').mockReturnValue({ getAgentTraces } as never);

describe('AgentTracesView', () => {
  it('renders a "tracing disabled" state from the reason code', async () => {
    withGateway(async () => ({ agentId: 'analyst', reasonCode: 'tracing-disabled', traces: [] }));
    render(<AgentTracesView agentId="analyst" />);
    expect(await screen.findByText(/tracing.*disabled/i)).toBeTruthy();
  });

  it('renders a "no traces" state', async () => {
    withGateway(async () => ({ agentId: 'analyst', reasonCode: 'no-traces', traces: [] }));
    render(<AgentTracesView agentId="analyst" />);
    expect(await screen.findByText(/no traces/i)).toBeTruthy();
  });

  it('lists traces and expands the span tree on click', async () => {
    withGateway(async () => ({
      agentId: 'analyst', reasonCode: null,
      traces: [{ traceId: 't1', startTime: '2026-06-27T10:00:00.000Z', status: 'ok', latencyMs: 1200,
        tokens: { total: 15 }, costUsd: null, rootName: 'strategy-analyst',
        spans: [
          { spanId: 'a', parentSpanId: null, name: 'strategy-analyst', kind: 'AGENT', startTime: 'x', latencyMs: 1200, status: 'ok' },
          { spanId: 'b', parentSpanId: 'a', name: 'llm-call', kind: 'LLM', startTime: 'x', latencyMs: 800, status: 'ok' },
        ] }],
    }));
    render(<AgentTracesView agentId="analyst" />);
    const row = await screen.findByText(/strategy-analyst/);
    expect(screen.queryByText('llm-call')).toBeNull();   // collapsed initially
    fireEvent.click(row);
    expect(await screen.findByText('llm-call')).toBeTruthy(); // expanded
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/floor/panels/AgentTracesView.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `AgentTracesView.tsx`**

```tsx
import { useState } from 'react';
import { useGateway } from '../../runtime/RuntimeContext';
import { useResource } from './useResource';
import { PanelState } from './PanelChrome';
import type { Trace, TraceSpan } from '@trading-office/office-gateway';

const REASON_TEXT: Record<string, string> = {
  'tracing-disabled': 'Tracing is disabled for this environment.',
  'phoenix-unreachable': 'Phoenix is currently unreachable.',
  'no-traces': 'No traces for this agent yet.',
};

function SpanTree({ spans }: { spans: TraceSpan[] }) {
  const childrenOf = (id: string | null) => spans.filter((s) => s.parentSpanId === id);
  const render = (parentId: string | null, depth: number): JSX.Element[] =>
    childrenOf(parentId).flatMap((s) => [
      <div key={s.spanId} className="trace__span" style={{ paddingLeft: depth * 12 }}>
        <span className={`trace__kind trace__kind--${s.kind.toLowerCase()}`}>{s.kind}</span> {s.name}
        <span className="trace__lat">{s.latencyMs}ms</span>
        {s.status === 'error' && <span className="trace__err">!</span>}
      </div>,
      ...render(s.spanId, depth + 1),
    ]);
  return <div className="trace__tree">{render(null, 0)}</div>;
}

function TraceRow({ trace }: { trace: Trace }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="trace__item">
      <button className="trace__row" onClick={() => setOpen((v) => !v)}>
        <span>{open ? '▾' : '▸'} {trace.rootName}</span>
        <span className={`status-pill status-pill--${trace.status}`}>{trace.status}</span>
        <span>{trace.latencyMs}ms</span>
        {trace.tokens?.total != null && <span>{trace.tokens.total} tok</span>}
        {trace.costUsd != null && <span>${trace.costUsd.toFixed(4)}</span>}
      </button>
      {open && <SpanTree spans={trace.spans} />}
    </div>
  );
}

export function AgentTracesView({ agentId }: { agentId: string }) {
  const gateway = useGateway();
  const res = useResource(() => gateway.getAgentTraces(agentId), [agentId]);
  return (
    <div className="trace">
      <PanelState resource={res} />
      {res.data && res.data.reasonCode && (
        <p className="panel__state">{REASON_TEXT[res.data.reasonCode] ?? 'No traces.'}</p>
      )}
      {res.data && !res.data.reasonCode && res.data.traces.map((t) => <TraceRow key={t.traceId} trace={t} />)}
    </div>
  );
}
```

- [ ] **Step 4: Run `AgentTracesView` test to verify it passes**

Run: `npx vitest run apps/web/src/floor/panels/AgentTracesView.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the failing tab-switch test for `AgentActivityPanel`**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentActivityPanel } from './AgentActivityPanel';
import * as RuntimeContext from '../../runtime/RuntimeContext';

describe('AgentActivityPanel tabs', () => {
  it('shows Logs by default and switches to Traces', async () => {
    vi.spyOn(RuntimeContext, 'useAgentStatuses').mockReturnValue({} as never);
    vi.spyOn(RuntimeContext, 'useGateway').mockReturnValue({
      getAgentActivity: async () => ({ agentId: 'analyst', status: 'idle', currentTask: null, logs: [] }),
      getAgentTraces: async () => ({ agentId: 'analyst', reasonCode: 'no-traces', traces: [] }),
      subscribeOfficeEvents: () => () => {},
    } as never);
    render(<AgentActivityPanel agentId="analyst" onClose={() => {}} />);
    fireEvent.click(await screen.findByRole('tab', { name: /traces/i }));
    expect(await screen.findByText(/no traces/i)).toBeTruthy();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run apps/web/src/floor/panels/AgentActivityPanel.test.tsx`
Expected: FAIL (no Traces tab).

- [ ] **Step 7: Add the tab switch to `AgentActivityPanel.tsx`**

Keep the existing logs body; wrap the two views in a tab switcher. Replace the `<h3>Logs / traces</h3> ...` block with a tab header + conditional body:

```tsx
  const [tab, setTab] = useState<'logs' | 'traces'>('logs');
  // ...inside PanelChrome, after the Status row:
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'logs'} onClick={() => setTab('logs')}>Logs</button>
        <button role="tab" aria-selected={tab === 'traces'} onClick={() => setTab('traces')}>Traces</button>
      </div>
      {tab === 'logs' ? (
        <>
          <PanelState resource={res} />
          {res.data && (
            <>
              <p className="row"><span>Task</span><span>{res.data.currentTask ?? '—'}</span></p>
              <div className="trace">
                {res.data.logs.map((l, i) => (<div key={i}>{l.ts} [{l.level}] {l.text}</div>))}
                {liveTraces.map((l, i) => (<div key={`live-${i}`}>{l.ts} [{l.level}] {l.text}</div>))}
              </div>
            </>
          )}
        </>
      ) : (
        <AgentTracesView agentId={agentId} />
      )}
```
Add `import { useState } from 'react'` (already imported) and `import { AgentTracesView } from './AgentTracesView'`.

- [ ] **Step 8: Run both panel tests to verify they pass**

Run: `npx vitest run apps/web/src/floor/panels/AgentActivityPanel.test.tsx apps/web/src/floor/panels/AgentTracesView.test.tsx`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/floor/panels/AgentTracesView.tsx apps/web/src/floor/panels/AgentTracesView.test.tsx apps/web/src/floor/panels/AgentActivityPanel.tsx apps/web/src/floor/panels/AgentActivityPanel.test.tsx
git commit -m "feat(office/web): Logs|Traces tabs in AgentActivityPanel with Phoenix span tree"
```

---

### Task B8: Minimal styles for the trace tree (optional but recommended)

**Files:**
- Modify: the floor/panel stylesheet (find the file defining `.panel`, `.trace`, `.status-pill` — likely `apps/web/src/floor/*.css` or a global `index.css`)

- [ ] **Step 1:** Add compact styles for `.tabs button[aria-selected="true"]`, `.trace__row`, `.trace__span`, `.trace__kind--llm/.--tool/.--agent`, `.trace__lat`. Keep it consistent with existing panel CSS (reuse variables/classes already present). No test.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/floor
git commit -m "style(office/web): trace tab + span-tree styling"
```

---

## Phase C — verification

### Task C1: Full suites + typecheck (both repos)

- [ ] **trading-lab:** `cd /home/alexxxnikolskiy/projects/trading-lab && npx vitest run && npx tsc --noEmit` → all green.
- [ ] **trading-office:** `cd /home/alexxxnikolskiy/projects/trading-office && npm test && npx tsc --noEmit` (use the repo's actual aggregate test/typecheck scripts) → all green.

### Task C2: End-to-end smoke (manual, documented)

- [ ] Bring up Phoenix + lab read-api with `PHOENIX_ENABLED=true`, `LAB_AGENTS_ADAPTER=mastra`, valid LLM keys, `TRADING_LAB_READ_TOKEN` set; office in trading-lab mode pointed at the lab read-api.
- [ ] Trigger one agent turn so a trace is exported to Phoenix.
- [ ] In the office UI, click that agent → open the **Traces** tab → confirm a trace appears with an expandable span tree (AGENT → LLM/TOOL).
- [ ] Negative checks: `PHOENIX_ENABLED=false` → tab shows "tracing disabled"; stop Phoenix while lab stays up → tab shows "phoenix unreachable"; click an agent with no traces → "no traces".
- [ ] Record results in a short note under `docs/superpowers/notes/` and update the memory file `trading-office-phoenix-traces.md`.

---

## Self-review notes (coverage map)

- Spec decision 1 (via trading-lab) → Tasks A1–A6 (lab owns reader+endpoint), B2–B5 (office consumes via existing seam).
- Spec decision 2 (Traces tab) → Task B7 (component-test infra added in B6a).
- Spec decision 3 (list + expandable span tree) → Tasks A3 (DTO/grouping), B7 (`SpanTree`/`TraceRow`).
- Spec decision 4 (on-demand REST) → `useResource` fetch on tab open (B7); no streaming added.
- Spec decision 5 (empty ≠ gap, typed reason codes) → A4 (reader), A5 (200 pass-through), B1 (schema enum), B3 (no-source → no-traces), B7 (reason-code rendering).
- Spec decision 6 (gated) → A2/A4 (`PHOENIX_ENABLED`); office shows typed disabled state rather than erroring.
- Spike residual (span-name format) → Task A1 confirms; A4 reader tolerant (name | `agent.<name>` | `metadata.agentId`).
- costUsd optional/null → A3 (`costUsd: null`), B1 (`.nullable().optional()`), B7 (rendered only when present).
