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
});
