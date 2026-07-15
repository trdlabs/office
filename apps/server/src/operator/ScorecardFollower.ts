import type { LabAgentEvent } from '../connector/tradinglab/labDtos';
import type { ScorecardFetchResult } from '../connector/tradinglab/TradingLabHttpClient';
import type { OfficeEvent } from '@trading-office/office-gateway';
import { buildScorecardPath, type ValidatedScorecardPath } from './scorecardPath';

const UNAVAILABLE_TEXT = 'Scorecard за цикл недоступен.';
const DONE_CAP = 500; // bounded dedup memory

export interface ScorecardFollowGuards {
  bootstrapRetries: number;
  bootstrapIntervalMs: number;
  ttlMs: number;
  fetchRetries: number;
  fetchIntervalMs: number;
}

export interface ScorecardFollowerDeps {
  bridge: { subscribeAppended(cb: (e: LabAgentEvent) => void): () => void };
  client: {
    getAgentEvents(q: { taskId: string }): Promise<LabAgentEvent[]>;
    getScorecardMarkdown(path: ValidatedScorecardPath): Promise<ScorecardFetchResult>;
  };
  bus: { publish(e: OfficeEvent): void };
  newIds: () => { operatorMessageId: string; replyMessageId: string };
  guards: ScorecardFollowGuards;
  now?: () => string;
  sleep?: (ms: number) => Promise<void>;
}

export interface ScorecardFollower {
  register(anchorTaskId: string, conversationId: string): void;
  stop(): void;
}

interface Reg {
  anchorTaskId: string;
  conversationId: string;
  correlationId: string;
  state: 'idle' | 'fetching' | 'done';
  resolveRequested: boolean;
  expired: boolean;
  ttlTimer?: ReturnType<typeof setTimeout>;
}

// Bounded FIFO membership set for process-local dedup.
function boundedSet(cap: number) {
  const q: string[] = [];
  const s = new Set<string>();
  return {
    has: (k: string) => s.has(k),
    add: (k: string) => { if (s.has(k)) return; s.add(k); q.push(k); if (q.length > cap) { const old = q.shift()!; s.delete(old); } },
  };
}

export function createScorecardFollower(deps: ScorecardFollowerDeps): ScorecardFollower {
  const { guards } = deps;
  const now = deps.now ?? (() => new Date().toISOString());
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  const pendingByTask = new Set<string>();   // bootstrap in flight (keyed by anchor)
  const activeByTask = new Set<string>();     // live reg exists for this anchor (post-bootstrap, pre-terminal)
  const byCorrelation = new Map<string, Reg>();
  const doneByTask = boundedSet(DONE_CAP);
  const doneByCorrelation = boundedSet(DONE_CAP);
  let stopped = false;

  const unsub = deps.bridge.subscribeAppended(onEvent);

  function publish(conversationId: string, text: string): void {
    const { operatorMessageId, replyMessageId } = deps.newIds();
    const ts = now();
    deps.bus.publish({
      type: 'operator_assistant_message',
      ts,
      operatorMessageId,
      conversationId,
      reply: { replyMessageId, operatorMessageId, conversationId, text, ts },
    });
  }

  // Single terminal helper. Records the terminal state FIRST (atomically, before any publish can
  // throw), so a synchronous subscriber exception in bus.publish cannot strand the reg as 'fetching'
  // or leak it in the maps. Publish is best-effort after the state is already terminal.
  function complete(reg: Reg, text: string): void {
    if (reg.ttlTimer) clearTimeout(reg.ttlTimer);
    reg.state = 'done';
    byCorrelation.delete(reg.correlationId);
    activeByTask.delete(reg.anchorTaskId);
    doneByCorrelation.add(reg.correlationId);
    doneByTask.add(reg.anchorTaskId);
    if (stopped) return;
    try { publish(reg.conversationId, text); } catch { /* subscriber threw — terminal already recorded */ }
  }

  function register(anchorTaskId: string, conversationId: string): void {
    if (stopped) return;
    if (pendingByTask.has(anchorTaskId) || activeByTask.has(anchorTaskId) || doneByTask.has(anchorTaskId)) return;
    pendingByTask.add(anchorTaskId);
    void bootstrap(anchorTaskId, conversationId);
  }

  async function bootstrap(anchorTaskId: string, conversationId: string): Promise<void> {
    let correlationId: string | undefined;
    for (let i = 0; i <= guards.bootstrapRetries && !stopped; i++) {
      const events = await deps.client.getAgentEvents({ taskId: anchorTaskId }).catch(() => []);
      if (stopped) return;
      correlationId = events.find((e) => e.correlationId)?.correlationId;
      if (correlationId) break;
      if (i < guards.bootstrapRetries) await sleep(guards.bootstrapIntervalMs);
    }
    if (stopped) return;
    pendingByTask.delete(anchorTaskId);
    if (!correlationId) {
      // Exhaustion: no correlationId ever seen -> honest terminal. Tombstone the anchor FIRST so a
      // later re-register does not re-bootstrap even if publish throws, then best-effort publish.
      doneByTask.add(anchorTaskId);
      if (stopped) return;
      try { publish(conversationId, UNAVAILABLE_TEXT); } catch { /* subscriber threw — terminal already recorded */ }
      return;
    }
    if (byCorrelation.has(correlationId) || doneByCorrelation.has(correlationId)) {
      doneByTask.add(anchorTaskId); // this anchor is handled (another anchor owns the cycle)
      return;
    }
    const reg: Reg = { anchorTaskId, conversationId, correlationId, state: 'idle', resolveRequested: false, expired: false };
    reg.ttlTimer = setTimeout(() => onTtl(reg), guards.ttlMs);
    byCorrelation.set(correlationId, reg);
    activeByTask.add(anchorTaskId);
    await resolve(reg); // recovery probe — covers an event that fired before/during bootstrap
  }

  function onEvent(e: LabAgentEvent): void {
    if (stopped || e.type !== 'cycle.scorecard.built' || !e.correlationId) return;
    const reg = byCorrelation.get(e.correlationId);
    if (!reg) return; // unknown or already completed
    if (reg.state === 'idle') void resolve(reg);
    else if (reg.state === 'fetching') reg.resolveRequested = true; // coalesce — no parallel fetch
  }

  async function resolve(reg: Reg): Promise<void> {
    if (stopped || reg.state !== 'idle') return;
    reg.state = 'fetching';
    reg.resolveRequested = false;
    const path = buildScorecardPath(reg.correlationId);
    let result: ScorecardFetchResult = { kind: 'transient' };
    for (let i = 0; i <= guards.fetchRetries && !stopped; i++) {
      result = await deps.client.getScorecardMarkdown(path);
      if (stopped) return;
      if (result.kind !== 'transient') break;
      if (i < guards.fetchRetries) await sleep(guards.fetchIntervalMs);
    }
    if (stopped) return;

    if (result.kind === 'ok') { complete(reg, result.markdown); return; }
    if (result.kind === 'permanent') { complete(reg, UNAVAILABLE_TEXT); return; }
    // not_found or transient-exhausted -> unresolved; never publish unavailable here.
    if (reg.expired) { complete(reg, UNAVAILABLE_TEXT); return; }
    reg.state = 'idle';
    if (reg.resolveRequested) { reg.resolveRequested = false; await resolve(reg); }
    // else: wait for the next event or TTL.
  }

  function onTtl(reg: Reg): void {
    if (stopped || reg.state === 'done') return;
    if (reg.state === 'fetching') { reg.expired = true; return; } // fetch-completion finalizes
    complete(reg, UNAVAILABLE_TEXT); // idle
  }

  function stop(): void {
    stopped = true;
    for (const reg of byCorrelation.values()) if (reg.ttlTimer) clearTimeout(reg.ttlTimer);
    unsub();
  }

  return { register, stop };
}
