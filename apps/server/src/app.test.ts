import { describe, it, expect, vi } from 'vitest';
import { OFFICE_API } from '@trading-office/office-gateway';
import { INITIAL_STATUSES, BACKTESTS } from '@trading-office/office-fixtures';
import { loadConfig } from './config';
import { OfficeEventBus } from './events/OfficeEventBus';
import { FixtureOfficeReadConnector } from './connector/FixtureOfficeReadConnector';
import { createOfficeApp } from './app';
import { ExecutionAuthorityError } from './guard/noExecutionAuthority';

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

  it('GET /api/office/agents/:id/traces returns agent traces', async () => {
    const { app } = makeApp();
    const res = await app.request(OFFICE_API.agentTraces('analyst'));
    expect(res.status).toBe(200);
    expect((await res.json()).agentId).toBe('analyst');
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

  it('POST /api/office/operator/confirm invokes the confirm responder and returns accepted', async () => {
    const calls: unknown[] = [];
    const operatorConfirmResponder = (c: unknown) => { calls.push(c); return { operatorMessageId: 'm1', conversationId: 'c1', status: 'accepted' as const }; };
    const config = loadConfig({});
    const bus = new OfficeEventBus();
    const connector = new FixtureOfficeReadConnector(config);
    const { app } = createOfficeApp({ connector, bus, config, operatorConfirmResponder });
    const res = await app.request(OFFICE_API.operatorConfirm, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pendingInteractionId: 'p1', sessionId: 's1', decision: 'confirm' }),
    });
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  // A refused authority escalation is an authorization outcome, not a server fault. Reaching the
  // guard over HTTP takes a responder that throws, because operatorMessageSchema already pins
  // `target` to 'orchestrator' — schema validation is the outer net, the guard is the chokepoint.
  it('a real ExecutionAuthorityError surfaces as a typed 403, never a generic 500', async () => {
    const config = loadConfig({});
    const bus = new OfficeEventBus();
    const connector = new FixtureOfficeReadConnector(config);
    const operatorResponder = (): never => {
      throw new ExecutionAuthorityError("operator message target 'execution' is not permitted");
    };
    const { app } = createOfficeApp({ connector, bus, config, operatorResponder });
    const res = await app.request(OFFICE_API.operatorMessages, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'sell everything', source: 'web', target: 'orchestrator', floorId: 'trading-lab' }),
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatchObject({ code: 'execution_authority_denied' });
  });

  it('an unrecognised error still falls through to 500 (the 403 is not a catch-all)', async () => {
    const config = loadConfig({});
    const bus = new OfficeEventBus();
    const connector = new FixtureOfficeReadConnector(config);
    const operatorResponder = (): never => {
      throw new Error('boom');
    };
    const { app } = createOfficeApp({ connector, bus, config, operatorResponder });
    const res = await app.request(OFFICE_API.operatorMessages, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'hi', source: 'web', target: 'orchestrator', floorId: 'trading-lab' }),
    });
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe('internal_error');
  });

  it('POST /api/office/operator/confirm with a bad body -> 400', async () => {
    const { app } = makeApp();
    const res = await app.request(OFFICE_API.operatorConfirm, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'maybe' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('bad_request');
  });
});
