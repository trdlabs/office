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

  it('chain: first (original) terminal advances as a delta, not a completion; guard finishes honestly', async () => {
    const bridge = fakeBridge();
    const timers: Array<{ ms: number; cb: () => void }> = [];
    const schedule = (ms: number, cb: () => void) => { const t = { ms, cb }; timers.push(t); return () => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); }; };
    const out: OfficeEvent[] = [];
    const f = new ConversationFollower({
      ids, taskId: 't1', taskType: 'strategy.onboard', nextTaskType: 'research.run_cycle', emit: (e) => out.push(e),
      client: clientWith([ev({ type: 'strategy_analyst.started', correlationId: 'corr1' })]) as never,
      bridge: bridge as never, guards: { ...guards, idleMs: 10 }, now: NOW, sleep: async () => {}, schedule,
    });
    const p = f.run();
    await tick();
    bridge.push(ev({ type: 'strategy_analyst.completed', correlationId: 'corr1', summary: 'Strategy Analyst Completed' }));
    expect(out.some((e) => e.type === 'operator_message_completed')).toBe(false);
    expect(out.filter((e) => e.type === 'operator_message_delta')).toHaveLength(1);
    timers.find((t) => t.ms === 10)!.cb();
    await p;
    const completed = out.find((e) => e.type === 'operator_message_completed') as Extract<OfficeEvent, { type: 'operator_message_completed' }>;
    expect(completed.reply.text).toMatch(/live progress stream ended/);
  });

  it('chain: completes on the correlated next-task success terminal', async () => {
    const bridge = fakeBridge();
    const out: OfficeEvent[] = [];
    const f = new ConversationFollower({
      ids, taskId: 't1', taskType: 'strategy.onboard', nextTaskType: 'research.run_cycle', emit: (e) => out.push(e),
      client: clientWith([ev({ type: 'strategy_analyst.started', correlationId: 'corr1' })]) as never,
      bridge: bridge as never, guards, now: NOW, sleep: async () => {}, schedule: noSchedule,
    });
    const p = f.run();
    await tick();
    bridge.push(ev({ type: 'strategy_analyst.completed', correlationId: 'corr1', summary: 'orig done' }));
    expect(out.some((e) => e.type === 'operator_message_completed')).toBe(false);
    bridge.push(ev({ type: 'research.run_cycle.completed', correlationId: 'corr1', summary: 'chain done' }));
    await p;
    expect(out.some((e) => e.type === 'operator_message_completed')).toBe(true);
    expect(out.some((e) => e.type === 'operator_message_failed')).toBe(false);
  });

  it('chain: chat.plan.advance_failed fails the turn even though its prefix is noise', async () => {
    const bridge = fakeBridge();
    const out: OfficeEvent[] = [];
    const f = new ConversationFollower({
      ids, taskId: 't1', taskType: 'strategy.onboard', nextTaskType: 'research.run_cycle', emit: (e) => out.push(e),
      client: clientWith([ev({ type: 'strategy_analyst.started', correlationId: 'corr1' })]) as never,
      bridge: bridge as never, guards, now: NOW, sleep: async () => {}, schedule: noSchedule,
    });
    const p = f.run();
    await tick();
    bridge.push(ev({ type: 'chat.plan.advance_failed', correlationId: 'corr1', summary: 'Chat Plan Advance Failed' }));
    await p;
    expect(out.some((e) => e.type === 'operator_message_failed')).toBe(true);
    expect(out.some((e) => e.type === 'operator_message_completed')).toBe(false);
  });

  it('chain: unknown next-task type never guesses success — guard finishes honestly', async () => {
    const bridge = fakeBridge();
    const timers: Array<{ ms: number; cb: () => void }> = [];
    const schedule = (ms: number, cb: () => void) => { const t = { ms, cb }; timers.push(t); return () => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); }; };
    const out: OfficeEvent[] = [];
    const f = new ConversationFollower({
      ids, taskId: 't1', taskType: 'strategy.onboard', nextTaskType: 'totally.unknown', emit: (e) => out.push(e),
      client: clientWith([ev({ type: 'strategy_analyst.started', correlationId: 'corr1' })]) as never,
      bridge: bridge as never, guards: { ...guards, idleMs: 10 }, now: NOW, sleep: async () => {}, schedule,
    });
    const p = f.run();
    await tick();
    bridge.push(ev({ type: 'strategy_analyst.completed', correlationId: 'corr1', summary: 'orig done' }));
    bridge.push(ev({ type: 'totally.unknown.completed', correlationId: 'corr1', summary: 'who knows' }));
    expect(out.some((e) => e.type === 'operator_message_completed')).toBe(false);
    timers.find((t) => t.ms === 10)!.cb();
    await p;
    const completed = out.find((e) => e.type === 'operator_message_completed') as Extract<OfficeEvent, { type: 'operator_message_completed' }>;
    expect(completed.reply.text).toMatch(/live progress stream ended/);
  });

  it('chain: an uncorrelated next-task terminal is ignored (only correlated completes)', async () => {
    const bridge = fakeBridge();
    const out: OfficeEvent[] = [];
    const f = new ConversationFollower({
      ids, taskId: 't1', taskType: 'strategy.onboard', nextTaskType: 'research.run_cycle', emit: (e) => out.push(e),
      client: clientWith([ev({ type: 'strategy_analyst.started', correlationId: 'corr1' })]) as never,
      bridge: bridge as never, guards, now: NOW, sleep: async () => {}, schedule: noSchedule,
    });
    const p = f.run();
    await tick();
    bridge.push(ev({ type: 'strategy_analyst.completed', correlationId: 'corr1', summary: 'orig done' }));
    bridge.push(ev({ type: 'research.run_cycle.completed', correlationId: 'OTHER', summary: 'someone else' }));
    expect(out.some((e) => e.type === 'operator_message_completed')).toBe(false);
    bridge.push(ev({ type: 'research.run_cycle.completed', correlationId: 'corr1', summary: 'ours' }));
    await p;
    expect(out.some((e) => e.type === 'operator_message_completed')).toBe(true);
  });

  it('maxDeltas cutoff finalizes honestly after N deltas', async () => {
    const bridge = fakeBridge();
    const out: OfficeEvent[] = [];
    const f = new ConversationFollower({
      ids, taskId: 't1', taskType: 'research.run_cycle', emit: (e) => out.push(e),
      client: clientWith([ev({ type: 'research.run_cycle.started', correlationId: 'corr1' })]) as never,
      bridge: bridge as never, guards: { ...guards, maxDeltas: 2 }, now: NOW, sleep: async () => {}, schedule: noSchedule,
    });
    const p = f.run();
    await tick();
    bridge.push(ev({ type: 'hypothesis.validated', correlationId: 'corr1', summary: 'A' }));
    bridge.push(ev({ type: 'hypothesis.validated', correlationId: 'corr1', summary: 'B' })); // 2nd → maxDeltas cutoff
    await p;
    const deltas = out.filter((e) => e.type === 'operator_message_delta');
    expect(deltas).toHaveLength(2);
    const completed = out.find((e) => e.type === 'operator_message_completed') as Extract<OfficeEvent, { type: 'operator_message_completed' }>;
    expect(completed.reply.text).toMatch(/live progress stream ended/);
  });

  it('maxMs guard finalizes honestly without asserting success', async () => {
    const bridge = fakeBridge();
    const timers: Array<{ ms: number; cb: () => void }> = [];
    const schedule = (ms: number, cb: () => void) => { const t = { ms, cb }; timers.push(t); return () => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); }; };
    const out: OfficeEvent[] = [];
    const f = new ConversationFollower({
      ids, taskId: 't1', taskType: 'research.run_cycle', emit: (e) => out.push(e),
      client: clientWith([ev({ type: 'research.run_cycle.started', correlationId: 'corr1' })]) as never,
      bridge: bridge as never, guards: { ...guards, maxMs: 100, idleMs: 9999 }, now: NOW, sleep: async () => {}, schedule,
    });
    const p = f.run();
    await tick();
    timers.find((t) => t.ms === 100)!.cb(); // fire max-duration guard
    await p;
    const completed = out.find((e) => e.type === 'operator_message_completed') as Extract<OfficeEvent, { type: 'operator_message_completed' }>;
    expect(completed.reply.text).toMatch(/live progress stream ended/);
    expect(out.some((e) => e.type === 'operator_message_failed')).toBe(false);
  });
});
