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
