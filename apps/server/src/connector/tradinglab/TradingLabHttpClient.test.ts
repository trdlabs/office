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

  it('sends Authorization: Bearer <read token> to the /v1/authz credential probe', async () => {
    const fetchImpl = vi.fn(async () => ok({ status: 'ok' }));
    const client = new TradingLabHttpClient({ ...cfg, fetchImpl });
    await expect(client.getAuthz()).resolves.toEqual({ status: 'ok' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe('http://lab:3100/v1/authz');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret');
  });

  it('maps a 401 from /v1/authz to upstream_unauthorized (wrong read token)', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 401 }));
    const client = new TradingLabHttpClient({ ...cfg, fetchImpl });
    await expect(client.getAuthz()).rejects.toMatchObject({ office: { code: 'upstream_unauthorized' } });
  });

  it('does not send the read token to healthz (public)', async () => {
    const fetchImpl = vi.fn(async () => ok({ status: 'ok' }));
    const client = new TradingLabHttpClient({ ...cfg, fetchImpl });
    await client.getHealthz();
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('attaches a granular office.reason while keeping office.code stable', async () => {
    const c503 = new TradingLabHttpClient({ ...cfg, fetchImpl: vi.fn(async () => new Response('x', { status: 503 })) });
    await expect(c503.getBacktests()).rejects.toMatchObject({ office: { code: 'upstream_unavailable', reason: 'upstream_5xx' } });
    const c403 = new TradingLabHttpClient({ ...cfg, fetchImpl: vi.fn(async () => new Response('{}', { status: 403 })) });
    await expect(c403.getBacktests()).rejects.toMatchObject({ office: { code: 'upstream_unauthorized', reason: 'auth_failed' } });
  });

  it('network throw → reason upstream_unreachable; AbortError → reason upstream_timeout', async () => {
    const net = new TradingLabHttpClient({ ...cfg, fetchImpl: vi.fn(async () => { throw new Error('ECONNREFUSED'); }) });
    await expect(net.getAgents()).rejects.toMatchObject({ office: { reason: 'upstream_unreachable' } });
    const to = new TradingLabHttpClient({ ...cfg, fetchImpl: vi.fn(async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); }) });
    await expect(to.getAgents()).rejects.toMatchObject({ office: { reason: 'upstream_timeout' } });
  });

  it('non-JSON 200 body → reason upstream_bad_response', async () => {
    const c = new TradingLabHttpClient({ ...cfg, fetchImpl: vi.fn(async () => new Response('<<not json>>', { status: 200, headers: { 'content-type': 'application/json' } })) });
    await expect(c.getHypotheses()).rejects.toMatchObject({ office: { reason: 'upstream_bad_response' } });
  });
});

const client = (fetchImpl: typeof fetch) =>
  new TradingLabHttpClient({ readUrl: 'http://lab', readToken: 't', requestTimeoutMs: 1000, fetchImpl });

describe('TradingLabHttpClient.getCompletionSummary', () => {
  it('returns the parsed summary on 200', async () => {
    const body = { kind: 'backtest.completed', taskId: 'x', status: 'completed', profile: null, hypothesis: null, decision: 'PASS', metrics: { netPnlUsd: 1, netPnlPct: null, winRate: null, profitFactor: null, maxDrawdownPct: null, sharpe: null, totalTrades: null }, reasons: [], willRetry: false, links: { taskId: 'x' }, warnings: [] };
    const c = client((async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch);
    const s = await c.getCompletionSummary('x');
    expect(s?.kind).toBe('backtest.completed');
  });

  it('returns null on a 404 (summary not available)', async () => {
    const c = client((async () => new Response(JSON.stringify({ error: { code: 'not_found' } }), { status: 404, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch);
    expect(await c.getCompletionSummary('missing')).toBeNull();
  });
});
