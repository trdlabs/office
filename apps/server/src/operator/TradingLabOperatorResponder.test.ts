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
});
