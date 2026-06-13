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
