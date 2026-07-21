import { describe, it, expect } from 'vitest';
import { OFFICE_API } from '@trading-office/office-gateway';
import { createFixtureOfficeApp } from './app';

const PW = 'op3rator-pass';

const login = (app: ReturnType<typeof createFixtureOfficeApp>['app'], password: string) =>
  app.request(OFFICE_API.operatorLogin, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });

describe('operator auth — disabled (no password configured)', () => {
  it('leaves the office API open', async () => {
    const { app } = createFixtureOfficeApp({});
    expect((await app.request(OFFICE_API.agentStatuses)).status).toBe(200);
  });

  it('login reports authRequired:false so the client knows it can proceed', async () => {
    const { app } = createFixtureOfficeApp({});
    const res = await login(app, 'anything');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ authRequired: false });
  });
});

describe('operator auth — enabled (password configured)', () => {
  const appWithAuth = () => createFixtureOfficeApp({ OFFICE_OPERATOR_PASSWORD: PW });

  it('rejects unauthenticated reads with 401', async () => {
    const { app } = appWithAuth();
    expect((await app.request(OFFICE_API.agentStatuses)).status).toBe(401);
  });

  it('rejects unauthenticated operator messages with 401', async () => {
    const { app } = appWithAuth();
    const res = await app.request(OFFICE_API.operatorMessages, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'hi', source: 'web', target: 'orchestrator', floorId: 'f' }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects a wrong password at login', async () => {
    const { app } = appWithAuth();
    expect((await login(app, 'nope')).status).toBe(401);
  });

  it('issues a token for the right password that then authorizes reads', async () => {
    const { app } = appWithAuth();
    const res = await login(app, PW);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { authRequired: boolean; token: string };
    expect(body.authRequired).toBe(true);
    expect(typeof body.token).toBe('string');

    const ok = await app.request(OFFICE_API.agentStatuses, {
      headers: { authorization: `Bearer ${body.token}` },
    });
    expect(ok.status).toBe(200);

    const bad = await app.request(OFFICE_API.agentStatuses, {
      headers: { authorization: 'Bearer not-a-real-token' },
    });
    expect(bad.status).toBe(401);
  });

  it('guards the WebSocket upgrade via ?access_token (browsers cannot set WS headers)', async () => {
    const { app } = appWithAuth();
    const body = (await (await login(app, PW)).json()) as { token: string };

    const noToken = await app.request(OFFICE_API.events);
    expect(noToken.status).toBe(401);

    const badToken = await app.request(`${OFFICE_API.events}?access_token=bogus`);
    expect(badToken.status).toBe(401);

    const goodToken = await app.request(`${OFFICE_API.events}?access_token=${encodeURIComponent(body.token)}`);
    expect(goodToken.status).not.toBe(401);
  });

  it('the login route itself is reachable without a token', async () => {
    const { app } = appWithAuth();
    expect((await login(app, PW)).status).toBe(200);
  });

  // SEC-O4: /operator/confirm resolves a pending human-in-the-loop interaction, so it must sit
  // behind the same chokepoint as every other route — not on a quieter path of its own. The
  // authority decision over WHAT is being confirmed belongs to trading-lab, which owns the
  // ActionProposal; authentication here is the office's own first and only chokepoint.
  describe('/operator/confirm', () => {
    const confirm = (app: ReturnType<typeof createFixtureOfficeApp>['app'], headers: Record<string, string> = {}) =>
      app.request(OFFICE_API.operatorConfirm, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({ pendingInteractionId: 'p1', sessionId: 's1', decision: 'confirm' }),
      });

    it('rejects an unauthenticated confirm with 401', async () => {
      const { app } = appWithAuth();
      expect((await confirm(app)).status).toBe(401);
    });

    it('rejects a confirm carrying an invalid token with 401', async () => {
      const { app } = appWithAuth();
      expect((await confirm(app, { authorization: 'Bearer not-a-real-token' })).status).toBe(401);
    });

    it('lets a valid credential through to the route (503 = past auth, no confirm responder wired)', async () => {
      const { app } = appWithAuth();
      const { token } = (await (await login(app, PW)).json()) as { token: string };
      const res = await confirm(app, { authorization: `Bearer ${token}` });
      expect(res.status).not.toBe(401);
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({ error: { code: 'not_configured' } });
    });
  });
});
