import { describe, it, expect, vi } from 'vitest';
import { TradingLabHttpClient } from './TradingLabHttpClient';

const ok = (body: unknown): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

const cfg = { readUrl: 'http://lab:3100', readToken: 'secret', requestTimeoutMs: 1000 };

describe('TradingLabHttpClient', () => {
  it('sends Authorization: Bearer <read token> to /v1 paths', async () => {
    const fetchImpl = vi.fn(async () => ok({ data: [], page: { nextCursor: null, limit: 20 } }));
    const client = new TradingLabHttpClient({ ...cfg, fetchImpl });
    await client.getHypotheses();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe('http://lab:3100/v1/hypotheses');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret');
  });

  it('maps 401 to upstream_unauthorized', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 401 }));
    const client = new TradingLabHttpClient({ ...cfg, fetchImpl });
    await expect(client.getBacktests()).rejects.toMatchObject({ office: { code: 'upstream_unauthorized' } });
  });

  it('maps 500 to upstream_unavailable', async () => {
    const fetchImpl = vi.fn(async () => new Response('boom', { status: 500 }));
    const client = new TradingLabHttpClient({ ...cfg, fetchImpl });
    await expect(client.getBacktests()).rejects.toMatchObject({ office: { code: 'upstream_unavailable' } });
  });

  it('maps a network throw to upstream_unavailable', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('ECONNREFUSED'); });
    const client = new TradingLabHttpClient({ ...cfg, fetchImpl });
    await expect(client.getAgents()).rejects.toMatchObject({ office: { code: 'upstream_unavailable' } });
  });

  it('does not send the read token to healthz (public)', async () => {
    const fetchImpl = vi.fn(async () => ok({ status: 'ok' }));
    const client = new TradingLabHttpClient({ ...cfg, fetchImpl });
    await client.getHealthz();
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});
