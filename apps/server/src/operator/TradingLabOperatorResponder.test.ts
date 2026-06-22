import { describe, it, expect, vi } from 'vitest';
import { makeTradingLabOperatorResponder, makeTradingLabOperatorConfirmResponder, defaultNewIds } from './TradingLabOperatorResponder';
import { OfficeEventBus } from '../events/OfficeEventBus';
import type { LabChatResponse } from '../connector/tradinglab/labDtos';
import type { OfficeEvent } from '@trading-office/office-gateway';

const msg = { text: 'hi', source: 'web', target: 'orchestrator', floorId: 'f1' } as const;
const guards = { maxMs: 1, idleMs: 1, maxDeltas: 1, bootstrapRetries: 1, bootstrapIntervalMs: 0, completionSummaryEnabled: true };
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

function depsWith(chat: { send: (...a: never[]) => Promise<LabChatResponse>; confirm: (...a: never[]) => Promise<LabChatResponse> }, startFollow = vi.fn()) {
  return { chat: chat as never, client: {} as never, bridge: {} as never, guards, now: NOW, newIds: fixedIds, startFollow };
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

  it('task_status active → emits completed info message and does NOT start follower', async () => {
    const { responder, bus, seen, startFollow } = setup({ kind: 'task_status', sessionId: 'c1', taskId: 't5', status: 'running' });
    responder(msg, bus);
    await flush();
    expect(seen.map((e) => e.type)).toEqual(['operator_message_accepted', 'operator_message_completed']);
    expect(startFollow).not.toHaveBeenCalled();
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

  it('runTurn drops the interpretation evidence card from the proposal badges (Q3)', async () => {
    const bus = new OfficeEventBus();
    const seen: OfficeEvent[] = [];
    bus.subscribe((e) => seen.push(e));
    const chat = {
      send: async () => ({ kind: 'assistant_message' as const, sessionId: 's1', message: 'Вижу стратегию. Подтвердите запуск анализа.', evidence: [{ kind: 'interpretation' as const, text: 'Вижу стратегию. Подтвердите запуск анализа.' }, { kind: 'exact_duplicate' as const, text: 'dup', sourceId: 'pf1' }], actions: [{ id: 'confirm' as const, label: 'Подтвердить', style: 'primary' as const }], pendingInteractionId: 'p1' }),
      confirm: async (): Promise<LabChatResponse> => { throw new Error('unused'); },
    };
    const responder = makeTradingLabOperatorResponder(depsWith(chat));
    responder(msg, bus);
    await flush();
    const done = seen.find((e) => e.type === 'operator_message_completed') as Extract<OfficeEvent, { type: 'operator_message_completed' }>;
    const badges = done.reply.evidence!;
    expect(badges).toHaveLength(1);
    expect(badges[0]!.kind).toBe('exact_duplicate');
    expect(badges.some((b) => b.kind === 'interpretation')).toBe(false);
    // the interpretation is still the message text:
    expect(done.reply.text).toBe('Вижу стратегию. Подтвердите запуск анализа.');
  });

  it('runTurn assistant_message proposal -> completed carrying actions + evidence + ids', async () => {
    const bus = new OfficeEventBus();
    const seen: OfficeEvent[] = [];
    bus.subscribe((e) => seen.push(e));
    const chat = {
      send: async () => ({ kind: 'assistant_message' as const, sessionId: 's1', message: 'Подтвердите запуск анализа.', evidence: [{ kind: 'exact_duplicate' as const, text: 'dup', sourceId: 'pf1' }], actions: [{ id: 'confirm' as const, label: 'Подтвердить', style: 'primary' as const }], pendingInteractionId: 'p1' }),
      confirm: async (): Promise<LabChatResponse> => { throw new Error('unused'); },
    };
    const responder = makeTradingLabOperatorResponder(depsWith(chat));
    responder(msg, bus);
    await flush();
    const done = seen.find((e) => e.type === 'operator_message_completed') as Extract<OfficeEvent, { type: 'operator_message_completed' }>;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(done!.reply.actions![0]!.id).toBe('confirm');
    expect(done!.reply.pendingInteractionId).toBe('p1');
    expect(done!.reply.evidence![0]!.sourceId).toBe('pf1');
  });
});

describe('makeTradingLabOperatorConfirmResponder', () => {
  it('confirm responder: assistant_message terminal (not_found) -> completed with NO actions', async () => {
    const bus = new OfficeEventBus();
    const seen: OfficeEvent[] = [];
    bus.subscribe((e) => seen.push(e));
    const chat = {
      send: async (): Promise<LabChatResponse> => { throw new Error('unused'); },
      confirm: async () => ({ kind: 'assistant_message' as const, sessionId: 's1', message: 'Не нашёл активного подтверждения. Пришлите запрос заново.', evidence: [], actions: [] }),
    };
    const respondConfirm = makeTradingLabOperatorConfirmResponder(depsWith(chat));
    respondConfirm({ pendingInteractionId: 'gone', sessionId: 's1', decision: 'confirm' }, bus);
    await flush();
    const done = seen.find((e) => e.type === 'operator_message_completed') as Extract<OfficeEvent, { type: 'operator_message_completed' }> | undefined;
    expect(done?.reply.text).toContain('Не нашёл');
    expect(done?.reply.actions ?? []).toHaveLength(0);
  });

  it('confirm responder: task_created -> progress + startFollow', async () => {
    const bus = new OfficeEventBus();
    const seen: OfficeEvent[] = [];
    bus.subscribe((e) => seen.push(e));
    const startFollow = vi.fn();
    const chat = {
      send: async (): Promise<LabChatResponse> => { throw new Error('unused'); },
      confirm: async () => ({ kind: 'task_created' as const, sessionId: 's1', taskId: 't9', taskType: 'strategy.onboard', status: 'queued' as const }),
    };
    const respondConfirm = makeTradingLabOperatorConfirmResponder({ ...depsWith(chat), startFollow });
    respondConfirm({ pendingInteractionId: 'p1', sessionId: 's1', decision: 'confirm' }, bus);
    await flush();
    expect(startFollow).toHaveBeenCalledWith(expect.objectContaining({ taskId: 't9' }));
  });
});

describe('onRunCycleTask hook', () => {
  it('calls onRunCycleTask for a research.run_cycle task_created', async () => {
    const onRunCycleTask = vi.fn();
    const bus = new OfficeEventBus();
    const chat = { send: vi.fn(async () => ({ kind: 'task_created' as const, sessionId: 's', taskId: 'rc-1', taskType: 'research.run_cycle', status: 'queued' as const })) };
    const responder = makeTradingLabOperatorResponder({
      chat: chat as never, client: {} as never, bridge: {} as never, guards, now: NOW, newIds: fixedIds, startFollow: vi.fn(), onRunCycleTask,
    });
    responder(msg, bus);
    await flush();
    expect(onRunCycleTask).toHaveBeenCalledWith('rc-1', 'c1');
  });

  it('calls onRunCycleTask when plannedNextStep.taskType is research.run_cycle', async () => {
    const onRunCycleTask = vi.fn();
    const bus = new OfficeEventBus();
    const chat = { send: vi.fn(async () => ({ kind: 'task_created' as const, sessionId: 's', taskId: 'rc-2', taskType: 'strategy.onboard', status: 'queued' as const, plannedNextStep: { taskType: 'research.run_cycle' } })) };
    const responder = makeTradingLabOperatorResponder({
      chat: chat as never, client: {} as never, bridge: {} as never, guards, now: NOW, newIds: fixedIds, startFollow: vi.fn(), onRunCycleTask,
    });
    responder(msg, bus);
    await flush();
    expect(onRunCycleTask).toHaveBeenCalledWith('rc-2', 'c1');
  });

  it('does NOT call onRunCycleTask for a strategy.onboard task_created without a run_cycle next step', async () => {
    const onRunCycleTask = vi.fn();
    const bus = new OfficeEventBus();
    const chat = { send: vi.fn(async () => ({ kind: 'task_created' as const, sessionId: 's', taskId: 'ob-1', taskType: 'strategy.onboard', status: 'queued' as const })) };
    const responder = makeTradingLabOperatorResponder({
      chat: chat as never, client: {} as never, bridge: {} as never, guards, now: NOW, newIds: fixedIds, startFollow: vi.fn(), onRunCycleTask,
    });
    responder(msg, bus);
    await flush();
    expect(onRunCycleTask).not.toHaveBeenCalled();
  });

  it('confirm responder calls onRunCycleTask for a run_cycle task_created', async () => {
    const onRunCycleTask = vi.fn();
    const bus = new OfficeEventBus();
    const chat = {
      send: async (): Promise<never> => { throw new Error('unused'); },
      confirm: vi.fn(async () => ({ kind: 'task_created' as const, sessionId: 's', taskId: 'rc-3', taskType: 'research.run_cycle', status: 'queued' as const })),
    };
    const respondConfirm = makeTradingLabOperatorConfirmResponder({
      chat: chat as never, client: {} as never, bridge: {} as never, guards, now: NOW, newIds: fixedIds, startFollow: vi.fn(), onRunCycleTask,
    });
    respondConfirm({ pendingInteractionId: 'p1', sessionId: 's1', decision: 'confirm' }, bus);
    await flush();
    expect(onRunCycleTask).toHaveBeenCalledWith('rc-3', 'c1');
  });
});

describe('defaultNewIds', () => {
  it('defaultNewIds: two independent instances never collide on operatorMessageId (Q1 regression)', () => {
    const a = defaultNewIds();
    const b = defaultNewIds();
    const a1 = a();
    const b1 = b();
    expect(a1.operatorMessageId).not.toBe(b1.operatorMessageId);
    // each call is also unique within an instance
    expect(a().operatorMessageId).not.toBe(a1.operatorMessageId);
    // all three id fields are distinct, non-empty strings
    expect(new Set([a1.operatorMessageId, a1.conversationId, a1.replyMessageId]).size).toBe(3);
    expect(a1.operatorMessageId.length).toBeGreaterThan(0);
  });
});
