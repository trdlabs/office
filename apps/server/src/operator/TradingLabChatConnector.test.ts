import { describe, it, expect, vi } from 'vitest';
import { TradingLabChatConnector } from './TradingLabChatConnector';

const cfg = { chatUrl: 'http://lab:3000', chatToken: 'ct', requestTimeoutMs: 1000 };

describe('TradingLabChatConnector', () => {
  it('POSTs /chat/messages with Bearer chat token + body, returns ChatResponse', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ kind: 'task_created', sessionId: 's', taskId: 't1', taskType: 'research.run_cycle', status: 'queued' }), { status: 200 }));
    const c = new TradingLabChatConnector({ ...cfg, fetchImpl });
    const r = await c.send({ message: 'hi', sessionId: 's' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe('http://lab:3000/chat/messages');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer ct');
    expect(JSON.parse(init.body as string)).toEqual({ message: 'hi', sessionId: 's', channel: 'web' });
    expect(r).toMatchObject({ kind: 'task_created', taskId: 't1' });
  });

  it('maps 503 (chat not configured) to upstream_unavailable', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 503 }));
    const c = new TradingLabChatConnector({ ...cfg, fetchImpl });
    await expect(c.send({ message: 'x', sessionId: 's' })).rejects.toMatchObject({ office: { code: 'upstream_unavailable' } });
  });

  it('maps 401 to upstream_unauthorized', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 401 }));
    const c = new TradingLabChatConnector({ ...cfg, fetchImpl });
    await expect(c.send({ message: 'x', sessionId: 's' })).rejects.toMatchObject({ office: { code: 'upstream_unauthorized' } });
  });

  it('confirm() POSTs to /chat/confirm with bearer + body and returns the lab response', async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      captured = { url, init };
      return new Response(JSON.stringify({ kind: 'task_created', sessionId: 's1', taskId: 't1', taskType: 'strategy.onboard', status: 'queued' }), { status: 200 });
    }) as unknown as typeof fetch;
    const c = new TradingLabChatConnector({ chatUrl: 'http://lab:3000', chatToken: 'tok', requestTimeoutMs: 1000, fetchImpl });

    const res = await c.confirm({ pendingInteractionId: 'p1', sessionId: 's1', decision: 'confirm' });

    expect(captured!.url).toBe('http://lab:3000/chat/confirm');
    expect((captured!.init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(JSON.parse(captured!.init.body as string)).toEqual({ pendingInteractionId: 'p1', sessionId: 's1', decision: 'confirm' });
    expect(res.kind).toBe('task_created');
  });

  it('confirm() maps a 401 to upstream_unauthorized', async () => {
    const fetchImpl = (async () => new Response('', { status: 401 })) as unknown as typeof fetch;
    const c = new TradingLabChatConnector({ chatUrl: 'http://lab:3000', chatToken: 'tok', requestTimeoutMs: 1000, fetchImpl });
    await expect(c.confirm({ pendingInteractionId: 'p', sessionId: 's', decision: 'confirm' })).rejects.toMatchObject({ office: { code: 'upstream_unauthorized' } });
  });

  it('maps 429 to upstream_rate_limited (throttled — distinct from a bad request)', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 429 }));
    const c = new TradingLabChatConnector({ ...cfg, fetchImpl });
    await expect(c.send({ message: 'x', sessionId: 's' })).rejects.toMatchObject({ office: { code: 'upstream_rate_limited' } });
  });

  it('confirm() maps 429 to upstream_rate_limited', async () => {
    const fetchImpl = (async () => new Response('', { status: 429 })) as unknown as typeof fetch;
    const c = new TradingLabChatConnector({ chatUrl: 'http://lab:3000', chatToken: 'tok', requestTimeoutMs: 1000, fetchImpl });
    await expect(c.confirm({ pendingInteractionId: 'p', sessionId: 's', decision: 'confirm' })).rejects.toMatchObject({ office: { code: 'upstream_rate_limited' } });
  });
});
