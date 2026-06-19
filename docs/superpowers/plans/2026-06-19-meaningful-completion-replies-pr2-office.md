# Meaningful Completion Replies — PR2 (trading-office) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic operator `Done.` reply with a rendered domain summary fetched from trading-lab's `GET /v1/tasks/:taskId/completion-summary`, for the task the operator turn already follows (`strategy.onboard` / `research.run_cycle`).

**Architecture:** Add a `getCompletionSummary(taskId)` method to the lab HTTP client (returns the parsed summary or `null` on 404/upstream error), a pure `renderCompletionSummary()` markdown renderer, a `completionSummaryEnabled` config flag (default **on**), and wire `ConversationFollower` so that on a success-terminal it fetches + renders the summary into `reply.text` — falling back to today's accumulated-deltas / `Done.` behaviour when the flag is off, the fetch fails, or the summary is null. The downstream `backtest.completed` surfacing is **out of scope** (PR2b).

**Tech Stack:** TypeScript ESM, Node, Vitest, Hono-based office server. trading-office mirrors lab DTOs by hand in `connector/tradinglab/labDtos.ts` (it must NOT import the trading-lab package).

**Lab contract (already shipped, PR1):** `GET /v1/tasks/:taskId/completion-summary` (bearer-gated) → `200` `CompletionSummary` for a completed `strategy.onboard` / `research.run_cycle` / `backtest.completed` task, `404` otherwise. Shape (lab spec §4): discriminated by `kind`; `profile{id,coreIdea,direction}|null`; `links{taskId,profileId?,hypothesisId?,backtestRunId?}`; `warnings: string[]` (privacy-safe codes). run_cycle: `counts{proposed,validated,rejected,deduped,criticReviews,backtestsEnqueued}` + `topHypotheses[{id,thesis,confidence,status}]` + `nextStep?`. backtest.completed: `hypothesis{...}|null` + `decision` (PASS|FAIL|MODIFY|INCONCLUSIVE|PAPER_CANDIDATE) + `metrics{netPnlUsd,netPnlPct,winRate,profitFactor,maxDrawdownPct,sharpe,totalTrades}` (all nullable) + `reasons[]` + `willRetry`. onboard: `profile` + `nextStep?`.

---

## Verified office facts (gortex-mapped)

- `apps/server/src/connector/tradinglab/labDtos.ts` — hand-mirrored lab DTOs (header literally says *DO NOT import the trading-lab package*). Already has `LabBacktestMetrics` (9 fields), `LabHypothesisListItem`, `LabPageEnvelope`, etc. The office `CompletionSummary` type goes HERE.
- `apps/server/src/connector/tradinglab/TradingLabHttpClient.ts` — `class TradingLabHttpClient`; methods call `this.getJson<T>(path, auth)` (private). E.g. `getAgentEvents(query) { return this.getJson('/v1/agent-events?...', true); }`. `getJson` throws an `OfficeUpstreamError` (`.office.code` ∈ `upstream_unavailable|upstream_unauthorized|upstream_bad_request`) on non-2xx. Construction: `new TradingLabHttpClient({ readUrl, readToken, requestTimeoutMs, fetchImpl? })`.
- `apps/server/src/operator/ConversationFollower.ts` — `class ConversationFollower`. Constructor takes `ConversationFollowerDeps { ids, taskId, taskType?, nextTaskType?, emit, client: Pick<TradingLabHttpClient,'getAgentEvents'>, bridge, guards: FollowerGuards, now?, sleep?, schedule? }`. `run()` → `bootstrap()` → `follow(correlationId)`. In `follow()`, the success-terminal branch calls `finish(() => this.finishCompleted())`. `finishCompleted(extra?)` builds `text = [body, extra].filter(Boolean).join(...) || 'Done.'` and emits `operator_message_completed` with `reply.text`. `LabAgentEvent` carries `taskId` (so the terminal event's `e.taskId` is the completed task's id — important for the chained run_cycle).
- `apps/server/src/operator/TradingLabOperatorResponder.ts` — `makeTradingLabOperatorResponder(deps)`; default `startFollow` does `new ConversationFollower({ ids, taskId, taskType, nextTaskType, emit, client: deps.client, bridge: deps.bridge, guards: deps.guards }).run()`.
- `apps/server/src/connector/createTradingLabWiring.ts` — builds the client + connector + responder from `OfficeServerConfig`.
- `apps/server/src/config.ts` — `loadConfig(env)`; helpers `num(env,key,def)` / `str(env,key,def)`; `ChatFollowConfig { maxMs, idleMs, maxDeltas, bootstrapRetries, bootstrapIntervalMs }`. Default-on bool idiom: `env.KEY !== 'false'` (mirror of the existing `=== 'true'` for default-off).
- `@trading-office/office-gateway` — `OperatorReply { replyMessageId, operatorMessageId, conversationId, text, ts }` (text is a plain string → markdown OK).

## File Structure

- **Modify** `apps/server/src/connector/tradinglab/labDtos.ts` — add `LabCompletionSummary` (+ `LabProfileRef`, `LabHypothesisRef`, `LabCompletionMetrics`, `LabSummaryLinks`).
- **Modify** `apps/server/src/connector/tradinglab/TradingLabHttpClient.ts` — add `getCompletionSummary(taskId): Promise<LabCompletionSummary | null>`.
- **Create** `apps/server/src/operator/completionSummaryRender.ts` — `renderCompletionSummary(summary): string`.
- **Modify** `apps/server/src/config.ts` — add `completionSummaryEnabled: boolean` to `ChatFollowConfig` + read it (default on).
- **Modify** `apps/server/src/operator/ConversationFollower.ts` — async completion that fetches + renders; flag + extended client Pick.
- **Modify** `apps/server/src/operator/TradingLabOperatorResponder.ts` — thread the flag into the follower.
- **Modify** `apps/server/src/connector/createTradingLabWiring.ts` — pass `config.chatFollow.completionSummaryEnabled`.
- **Create** tests alongside each.

---

### Task 1: `LabCompletionSummary` DTO

**Files:** Modify `apps/server/src/connector/tradinglab/labDtos.ts`

- [ ] **Step 1: Add the types** (append near the other Lab* DTOs)

```ts
// Completion summary — hand-mirrored from trading-lab CompletionSummary contract (lab spec §4).
// Returned by GET /v1/tasks/:taskId/completion-summary. Only fields the office renders are declared.
export interface LabProfileRef { id: string; coreIdea: string; direction: string }
export interface LabHypothesisRef { id: string; thesis: string; confidence: number | null; status: string | null }
export interface LabCompletionMetrics {
  netPnlUsd: number | null; netPnlPct: number | null; winRate: number | null;
  profitFactor: number | null; maxDrawdownPct: number | null; sharpe: number | null; totalTrades: number | null;
}
export interface LabSummaryLinks { taskId: string; profileId?: string; hypothesisId?: string; backtestRunId?: string }
export type LabCompletionDecision = 'PASS' | 'FAIL' | 'MODIFY' | 'INCONCLUSIVE' | 'PAPER_CANDIDATE';

export type LabCompletionSummary =
  | { kind: 'strategy.onboard'; taskId: string; status: string;
      profile: LabProfileRef | null; nextStep?: { taskType: string }; links: LabSummaryLinks; warnings: string[] }
  | { kind: 'research.run_cycle'; taskId: string; status: string; profile: LabProfileRef | null;
      counts: { proposed: number; validated: number; rejected: number; deduped: number; criticReviews: number; backtestsEnqueued: number };
      topHypotheses: LabHypothesisRef[]; nextStep?: { taskType: string }; links: LabSummaryLinks; warnings: string[] }
  | { kind: 'backtest.completed'; taskId: string; status: string; profile: LabProfileRef | null;
      hypothesis: LabHypothesisRef | null; decision: LabCompletionDecision;
      metrics: LabCompletionMetrics; reasons: string[]; willRetry: boolean; links: LabSummaryLinks; warnings: string[] };
```

- [ ] **Step 2: Typecheck** — Run: `pnpm -C apps/server typecheck` (or the repo's typecheck script — check `package.json`). Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/connector/tradinglab/labDtos.ts
git commit -m "feat(office): LabCompletionSummary DTO (mirror of lab completion-summary contract)"
```

---

### Task 2: `getCompletionSummary` on the lab HTTP client

**Files:** Modify `apps/server/src/connector/tradinglab/TradingLabHttpClient.ts`; Test `apps/server/src/connector/tradinglab/TradingLabHttpClient.test.ts` (create if absent, else append)

- [ ] **Step 1: Write the failing test**

First READ `TradingLabHttpClient.ts` (esp. the private `getJson` body) to see how `OfficeUpstreamError` is shaped and how `fetchImpl` is injected, then mirror the existing client tests' fetch-stub style. Test the two paths:

```ts
import { describe, it, expect } from 'vitest';
import { TradingLabHttpClient } from './TradingLabHttpClient';

const client = (fetchImpl: typeof fetch) =>
  new TradingLabHttpClient({ readUrl: 'http://lab', readToken: 't', requestTimeoutMs: 1000, fetchImpl });

describe('TradingLabHttpClient.getCompletionSummary', () => {
  it('returns the parsed summary on 200', async () => {
    const body = { kind: 'backtest.completed', taskId: 'x', status: 'completed', profile: null, hypothesis: null, decision: 'PASS', metrics: { netPnlUsd: 1, netPnlPct: null, winRate: null, profitFactor: null, maxDrawdownPct: null, sharpe: null, totalTrades: null }, reasons: [], willRetry: false, links: { taskId: 'x' }, warnings: [] };
    const c = client((async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch);
    const s = await c.getCompletionSummary('x');
    expect(s?.kind).toBe('backtest.completed');
  });

  it('returns null on a 404 (summary not available)', async () => {
    const c = client((async () => new Response(JSON.stringify({ error: { code: 'not_found' } }), { status: 404, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch);
    expect(await c.getCompletionSummary('missing')).toBeNull();
  });
});
```

- [ ] **Step 2: Run → fail** — `pnpm -C apps/server test TradingLabHttpClient` → FAIL (method missing).

- [ ] **Step 3: Implement** — add the method to `TradingLabHttpClient` (mirror `getAgentEvents`; the 404/upstream → null is the key difference):

```ts
import type { /* …existing… */ LabCompletionSummary } from './labDtos';

  /** Domain completion summary for a completed task. Returns null when the lab has no summary for it
   *  (404) or the read is otherwise unavailable — the caller falls back to its prior reply. */
  async getCompletionSummary(taskId: string): Promise<LabCompletionSummary | null> {
    try {
      return await this.getJson<LabCompletionSummary>(`/v1/tasks/${encodeURIComponent(taskId)}/completion-summary`, true);
    } catch {
      return null; // OfficeUpstreamError (404/bad_request/unavailable) → degrade to the prior reply
    }
  }
```

- [ ] **Step 4: Run → pass** — `pnpm -C apps/server test TradingLabHttpClient` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/connector/tradinglab/TradingLabHttpClient.ts apps/server/src/connector/tradinglab/TradingLabHttpClient.test.ts
git commit -m "feat(office): TradingLabHttpClient.getCompletionSummary (null on 404/upstream)"
```

---

### Task 3: `renderCompletionSummary` (markdown, per kind)

**Files:** Create `apps/server/src/operator/completionSummaryRender.ts`; Test `apps/server/src/operator/completionSummaryRender.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { renderCompletionSummary } from './completionSummaryRender';
import type { LabCompletionSummary } from '../connector/tradinglab/labDtos';

describe('renderCompletionSummary', () => {
  it('onboard → profile + next step', () => {
    const s: LabCompletionSummary = { kind: 'strategy.onboard', taskId: 't', status: 'completed', profile: { id: 'p1', coreIdea: 'fade pumps', direction: 'short' }, nextStep: { taskType: 'research.run_cycle' }, links: { taskId: 't', profileId: 'p1' }, warnings: [] };
    const text = renderCompletionSummary(s);
    expect(text).toContain('fade pumps');
    expect(text).toContain('research.run_cycle');
  });

  it('run_cycle → counts + top hypotheses', () => {
    const s: LabCompletionSummary = { kind: 'research.run_cycle', taskId: 't', status: 'completed', profile: { id: 'p1', coreIdea: 'fade pumps', direction: 'short' }, counts: { proposed: 5, validated: 2, rejected: 3, deduped: 0, criticReviews: 2, backtestsEnqueued: 2 }, topHypotheses: [{ id: 'hB', thesis: 'short the pump', confidence: 0.9, status: 'validated' }], links: { taskId: 't', profileId: 'p1' }, warnings: [] };
    const text = renderCompletionSummary(s);
    expect(text).toContain('2'); // validated
    expect(text).toContain('short the pump');
  });

  it('backtest.completed → decision + key metrics + retry note', () => {
    const s: LabCompletionSummary = { kind: 'backtest.completed', taskId: 't', status: 'completed', profile: null, hypothesis: { id: 'h1', thesis: 'short the pump', confidence: 0.6, status: 'validated' }, decision: 'PASS', metrics: { netPnlUsd: 420, netPnlPct: 12, winRate: 0.58, profitFactor: 1.8, maxDrawdownPct: 9, sharpe: 1.1, totalTrades: 30 }, reasons: ['profit factor above threshold'], willRetry: false, links: { taskId: 't', backtestRunId: 'b1' }, warnings: [] };
    const text = renderCompletionSummary(s);
    expect(text).toContain('PASS');
    expect(text).toContain('1.8'); // profit factor
    expect(text).toContain('58'); // win rate %
  });

  it('appends a degraded-data note when warnings are present', () => {
    const s: LabCompletionSummary = { kind: 'strategy.onboard', taskId: 't', status: 'completed', profile: null, links: { taskId: 't' }, warnings: ['profile_read_failed'] };
    expect(renderCompletionSummary(s)).toContain('⚠'); // partial-data marker
  });
});
```

- [ ] **Step 2: Run → fail** — `pnpm -C apps/server test completionSummaryRender` → FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
// apps/server/src/operator/completionSummaryRender.ts
import type { LabCompletionSummary, LabCompletionMetrics } from '../connector/tradinglab/labDtos';

const pct = (x: number | null): string | null => (x === null ? null : `${Math.round(x * 100)}%`);
const n2 = (x: number | null): string | null => (x === null ? null : `${Math.round(x * 100) / 100}`);

function metricsLine(m: LabCompletionMetrics): string {
  const parts: string[] = [];
  if (m.netPnlUsd !== null) parts.push(`PnL ${m.netPnlUsd}${m.netPnlPct !== null ? ` (${m.netPnlPct}%)` : ''}`);
  if (m.winRate !== null) parts.push(`win ${pct(m.winRate)}`);
  if (m.profitFactor !== null) parts.push(`PF ${n2(m.profitFactor)}`);
  if (m.maxDrawdownPct !== null) parts.push(`maxDD ${m.maxDrawdownPct}%`);
  if (m.sharpe !== null) parts.push(`sharpe ${n2(m.sharpe)}`);
  if (m.totalTrades !== null) parts.push(`trades ${m.totalTrades}`);
  return parts.join(', ');
}

function degraded(warnings: readonly string[]): string {
  return warnings.length ? `\n\n⚠️ часть данных недоступна (${warnings.join(', ')})` : '';
}

export function renderCompletionSummary(s: LabCompletionSummary): string {
  switch (s.kind) {
    case 'strategy.onboard': {
      const head = s.profile
        ? `Профиль создан: «${s.profile.coreIdea}» (${s.profile.direction}).`
        : 'Профиль создан.';
      const next = s.nextStep ? ` Дальше: ${s.nextStep.taskType}.` : '';
      return `${head}${next}${degraded(s.warnings)}`;
    }
    case 'research.run_cycle': {
      const c = s.counts;
      const dedup = c.deduped > 0 ? `, ${c.deduped} дубл.` : '';
      const head = `Гипотезы: ${c.proposed} предложено, ${c.validated} валидно, ${c.rejected} отклонено${dedup} · ${c.backtestsEnqueued} бэктест(ов) в очереди.`;
      const top = s.topHypotheses.length
        ? `\n${s.topHypotheses.map((h) => `• ${h.thesis}${h.confidence !== null ? ` (conf ${n2(h.confidence)})` : ''}`).join('\n')}`
        : '';
      return `${head}${top}${degraded(s.warnings)}`;
    }
    case 'backtest.completed': {
      const subj = s.hypothesis ? `«${s.hypothesis.thesis}»` : 'гипотеза';
      const metrics = metricsLine(s.metrics);
      const head = `${s.decision}: ${subj}${metrics ? ` · ${metrics}` : ''}.`;
      const reasons = s.reasons.length ? `\n${s.reasons.map((r) => `— ${r}`).join('\n')}` : '';
      const retry = s.willRetry ? '\nПовтор цикла запланирован.' : '';
      return `${head}${reasons}${retry}${degraded(s.warnings)}`;
    }
  }
}
```

- [ ] **Step 4: Run → pass** — `pnpm -C apps/server test completionSummaryRender` → PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/operator/completionSummaryRender.ts apps/server/src/operator/completionSummaryRender.test.ts
git commit -m "feat(office): renderCompletionSummary — markdown per kind"
```

---

### Task 4: `completionSummaryEnabled` config flag (default on)

**Files:** Modify `apps/server/src/config.ts`; Test `apps/server/src/config.test.ts` (append if it exists)

- [ ] **Step 1: Add the field + read it**

In `ChatFollowConfig` add `completionSummaryEnabled: boolean;`. In `loadConfig`, inside the `chatFollow` object, add:

```ts
      completionSummaryEnabled: env.OPERATOR_COMPLETION_SUMMARY !== 'false', // default ON
```

- [ ] **Step 2: Test** (if `config.test.ts` exists, append; else create a minimal one)

```ts
import { loadConfig } from './config';
// default on:
expect(loadConfig({} as NodeJS.ProcessEnv).chatFollow.completionSummaryEnabled).toBe(true);
// explicit off:
expect(loadConfig({ OPERATOR_COMPLETION_SUMMARY: 'false' } as unknown as NodeJS.ProcessEnv).chatFollow.completionSummaryEnabled).toBe(false);
```

- [ ] **Step 3: Run + typecheck** — `pnpm -C apps/server test config` (and `typecheck`). Expected: pass/clean. (Note: any other place constructing `ChatFollowConfig`/`FollowerGuards` literally may now need the field — fix those; Task 5 + 6 handle the follower/responder.)

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/config.ts apps/server/src/config.test.ts
git commit -m "feat(office): OPERATOR_COMPLETION_SUMMARY config flag (default on)"
```

---

### Task 5: `ConversationFollower` — async completion that fetches + renders

**Files:** Modify `apps/server/src/operator/ConversationFollower.ts`; Test `apps/server/src/operator/ConversationFollower.test.ts` (append)

This is the integration core. The success-terminal must fetch the summary (async) and render it BEFORE emitting `operator_message_completed`, while staying idempotent and falling back cleanly.

- [ ] **Step 1: Write the failing tests** (append)

Mirror the existing ConversationFollower test setup (fake `client`, fake `bridge.subscribeAppended`, `emit` capture, `guards`, fast `schedule`/`sleep`). Add:

```ts
// (a) success terminal → fetch + render replaces 'Done.'
it('renders the fetched completion summary into the completed reply', async () => {
  const summary = { kind: 'research.run_cycle', taskId: 'rc1', status: 'completed', profile: { id: 'p1', coreIdea: 'fade pumps', direction: 'short' }, counts: { proposed: 3, validated: 2, rejected: 1, deduped: 0, criticReviews: 2, backtestsEnqueued: 2 }, topHypotheses: [], links: { taskId: 'rc1' }, warnings: [] };
  // build a follower whose client.getCompletionSummary returns `summary`, taskType 'research.run_cycle',
  // bridge that, on subscribeAppended, immediately emits a success-terminal event { type: <a success type
  // for research.run_cycle from terminalTaxonomy>, correlationId, taskId: 'rc1', summary: 'done' }.
  // After run(), find the emitted 'operator_message_completed' event and assert reply.text contains
  // 'Гипотезы' and does NOT equal 'Done.'.
});

// (b) fetch returns null → falls back to prior behaviour (accumulated/'Done.')
it('falls back to the prior reply when the summary fetch returns null', async () => { /* getCompletionSummary: async () => null → reply.text === 'Done.' (no deltas) */ });

// (c) flag disabled → no fetch, prior behaviour
it('does not fetch when completionSummaryEnabled is false', async () => { /* spy getCompletionSummary; assert not called; reply.text === 'Done.' */ });
```

Use the real success type from `../connector/tradinglab/terminalTaxonomy` (`successTypesFor('research.run_cycle')[0]`).

- [ ] **Step 2: Run → fail** — `pnpm -C apps/server test ConversationFollower` → FAIL.

- [ ] **Step 3: Implement**

1. Extend deps:
```ts
  client: Pick<TradingLabHttpClient, 'getAgentEvents' | 'getCompletionSummary'>;
  completionSummaryEnabled?: boolean; // default true
```
Add the import: `import { renderCompletionSummary } from './completionSummaryRender';`

2. Capture the completed task's id and make the completion path async. Change the `finish` helper so it awaits an async finisher before resolving, and stays idempotent:
```ts
      const finish = (run: () => void | Promise<void>): void => {
        if (this.done) return;
        this.done = true;          // set synchronously → no re-entry during the await
        cancelMax();
        cancelIdle();
        unsub();
        void Promise.resolve(run()).then(resolve, resolve);
      };
```
(Remove the `this.done = true` lines from `finishCompleted` / `finishFailed` since `finish` now owns it. NOTE: the `run()` path in `run()` that calls `this.finishCompleted('Live task progress is unavailable.')` directly does NOT go through `finish` — guard it: `if (!this.done) { this.done = true; await this.finishCompleted('Live task progress is unavailable.'); }`, and make `run()` await it.)

3. Pass the completed task's id into the success-terminal completion:
```ts
        if (expectedType && successTypesFor(expectedType).includes(e.type)) {
          if (this.deps.nextTaskType && !this.chainAdvanced) {
            this.chainAdvanced = true;
            this.emitDelta(e.summary);
            return;
          }
          finish(() => this.finishCompleted(undefined, e.taskId)); // e.taskId = the task that just completed
          return;
        }
```
(The idle/max timeout `finish(() => this.finishCompleted('live progress stream ended'))` calls stay — they pass no taskId, so they fall back to text.)

4. Make `finishCompleted` async, fetch when enabled + a taskId is known, render, else fall back:
```ts
  private async finishCompleted(extra?: string, completedTaskId?: string): Promise<void> {
    let rendered: string | undefined;
    if ((this.deps.completionSummaryEnabled ?? true) && completedTaskId) {
      const summary = await this.deps.client.getCompletionSummary(completedTaskId); // null on 404/error
      if (summary) rendered = renderCompletionSummary(summary);
    }
    const body = this.accumulated.join('\n');
    const fallback = [body, extra].filter(Boolean).join(body && extra ? ' · ' : '') || 'Done.';
    const text = rendered ?? fallback;
    const reply: OperatorReply = {
      replyMessageId: this.deps.ids.replyMessageId,
      operatorMessageId: this.deps.ids.operatorMessageId,
      conversationId: this.deps.ids.conversationId,
      text,
      ts: this.now(),
    };
    this.deps.emit({ type: 'operator_message_completed', ts: this.now(), operatorMessageId: this.deps.ids.operatorMessageId, conversationId: this.deps.ids.conversationId, replyMessageId: this.deps.ids.replyMessageId, reply });
  }
```

- [ ] **Step 4: Run → pass** — `pnpm -C apps/server test ConversationFollower` → PASS (existing + 3 new). Existing tests that assert `'Done.'` should still pass: they don't set `completionSummaryEnabled`/`getCompletionSummary`, so either the flag default fetches and the fake client lacks the method (give those tests a `getCompletionSummary: async () => null` stub, or rely on the existing fake — adjust the shared test factory once). **If existing follower tests construct the deps without `getCompletionSummary`, update that shared factory to include `getCompletionSummary: async () => null`** so the type holds and behaviour is unchanged.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/operator/ConversationFollower.ts apps/server/src/operator/ConversationFollower.test.ts
git commit -m "feat(office): render fetched completion summary in ConversationFollower (flag + fallback)"
```

---

### Task 6: Wire the flag through the responder + wiring

**Files:** Modify `apps/server/src/operator/TradingLabOperatorResponder.ts`, `apps/server/src/connector/createTradingLabWiring.ts`

- [ ] **Step 1: Thread `completionSummaryEnabled`**

Read both files first. In `TradingLabOperatorResponderDeps` add `completionSummaryEnabled?: boolean;` and pass it into the `ConversationFollower` construction inside the default `startFollow`:
```ts
    void new ConversationFollower({
      ids: args.ids, taskId: args.taskId, taskType: args.taskType, nextTaskType: args.nextTaskType, emit: args.emit,
      client: deps.client, bridge: deps.bridge, guards: deps.guards,
      completionSummaryEnabled: deps.completionSummaryEnabled,
    }).run();
```
In `createTradingLabWiring.ts`, where the responder deps are built, pass `completionSummaryEnabled: config.chatFollow.completionSummaryEnabled`.

- [ ] **Step 2: Typecheck + the operator tests** — `pnpm -C apps/server typecheck` clean; `pnpm -C apps/server test TradingLabOperatorResponder` pass.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/operator/TradingLabOperatorResponder.ts apps/server/src/connector/createTradingLabWiring.ts
git commit -m "feat(office): wire completionSummaryEnabled into the operator follower"
```

---

### Task 7: Full gate

- [ ] **Step 1** — Run the repo's full check (inspect `package.json` for the script; likely `pnpm check` or `pnpm -r test` + `pnpm typecheck`). Expected: clean typecheck + all tests pass.
- [ ] **Step 2** — If the office has an env example / README documenting flags, add `OPERATOR_COMPLETION_SUMMARY` (default on). Commit any doc/fixup.

```bash
git add -A && git commit -m "chore(office): completion-summary PR2 green (typecheck + suite)"
```

---

## Out of scope (PR2b)

- Surfacing downstream `backtest.completed` task summaries as separate operator messages (requires a conversation-correlation background follower beyond the one-turn `ConversationFollower` lifecycle). The lab endpoint already serves `backtest.completed`, so PR2b is office-only.

## Notes for the implementer

- trading-office must NOT import the trading-lab package — `LabCompletionSummary` is a hand-mirror in `labDtos.ts`.
- `reply.text` is plain text rendered as the operator message; markdown/newlines are fine.
- Keep the fallback paths intact: flag off, fetch null/error, or no `completedTaskId` (timeout/idle/unavailable) → today's accumulated-deltas / `Done.` behaviour. The summary fetch must never throw out of `finishCompleted` (the client already swallows to null; do not add new throws).
- `finishCompleted` becoming async: ensure idempotency stays correct — `finish()` sets `this.done = true` synchronously before the await, so concurrent terminal events can't double-emit.
