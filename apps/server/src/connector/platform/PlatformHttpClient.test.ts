import { describe, it, expect } from 'vitest';
import { PlatformHttpClient } from './PlatformHttpClient';

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });

describe('PlatformHttpClient', () => {
  it('sends bearer + ?mode and parses the runs PageEnvelope', async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string> });
      return json({ items: [{ runId: 'r1', mode: 'live', status: 'running', strategy: { name: 's', version: '1' }, startedAtMs: 1, finishedAtMs: null, lastSeenMs: 2, symbols: [] }], nextCursor: null, asOf: 9, window: {}, freshness: {} });
    }) as unknown as typeof fetch;
    const client = new PlatformHttpClient({ readUrl: 'http://plat', readToken: 'tok', requestTimeoutMs: 1000, fetchImpl });
    const env = await client.getRuns('live');
    expect(calls[0]!.url).toBe('http://plat/ops/runs?mode=live');
    expect(calls[0]!.headers.authorization).toBe('Bearer tok');
    expect(env.items[0]!.runId).toBe('r1');
    expect(env.nextCursor).toBeNull();
  });
  it('maps 401 → upstream_unauthorized (thrown)', async () => {
    const fetchImpl = (async () => json({}, 401)) as unknown as typeof fetch;
    const client = new PlatformHttpClient({ readUrl: 'http://plat', readToken: 't', requestTimeoutMs: 1000, fetchImpl });
    await expect(client.getDiscover()).rejects.toMatchObject({ office: { code: 'upstream_unauthorized' } });
  });
  it('maps 500 → upstream_unavailable; network → upstream_unavailable; 400 → upstream_bad_request', async () => {
    const mk = (impl: typeof fetch) => new PlatformHttpClient({ readUrl: 'http://p', readToken: 't', requestTimeoutMs: 1000, fetchImpl: impl });
    await expect(mk((async () => json({}, 500)) as unknown as typeof fetch).getMarketHealth()).rejects.toMatchObject({ office: { code: 'upstream_unavailable' } });
    await expect(mk((async () => { throw new Error('net'); }) as unknown as typeof fetch).getMarketHealth()).rejects.toMatchObject({ office: { code: 'upstream_unavailable' } });
    await expect(mk((async () => json({}, 400)) as unknown as typeof fetch).getCoverage()).rejects.toMatchObject({ office: { code: 'upstream_bad_request' } });
  });
});
