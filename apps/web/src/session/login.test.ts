import { describe, it, expect } from 'vitest';
import { OFFICE_API } from '@trading-office/office-gateway';
import { loginOperator, LoginError } from './login';

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('loginOperator', () => {
  it('POSTs the password to the operator login route and returns the issued token', async () => {
    let calledUrl = '';
    let calledBody = '';
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calledUrl = url;
      calledBody = String(init?.body);
      return jsonRes({ authRequired: true, token: 'jwt-xyz' });
    }) as unknown as typeof fetch;

    const res = await loginOperator('http://office:8787/', 'hunter2', fetchImpl);
    expect(res).toEqual({ authRequired: true, token: 'jwt-xyz' });
    expect(calledUrl).toBe(`http://office:8787${OFFICE_API.operatorLogin}`);
    expect(JSON.parse(calledBody)).toEqual({ password: 'hunter2' });
  });

  it('returns authRequired:false (no token) when the server has auth disabled', async () => {
    const fetchImpl = (async () => jsonRes({ authRequired: false, token: null })) as unknown as typeof fetch;
    expect(await loginOperator('http://office:8787', '', fetchImpl)).toEqual({
      authRequired: false,
      token: null,
    });
  });

  it('throws a LoginError on a 401 (wrong password)', async () => {
    const fetchImpl = (async () => jsonRes({ error: { code: 'unauthorized' } }, 401)) as unknown as typeof fetch;
    await expect(loginOperator('http://office:8787', 'bad', fetchImpl)).rejects.toBeInstanceOf(LoginError);
  });
});
