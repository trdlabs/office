import { describe, it, expect, vi } from 'vitest';
import { OFFICE_API } from '@trading-office/office-gateway';
import { INITIAL_STATUSES, BACKTESTS } from '@trading-office/office-fixtures';
import { HttpOfficeGateway } from './HttpOfficeGateway';

function jsonResponse(data: unknown, ok = true, status = 200): Response {
  return { ok, status, statusText: 'x', json: async () => data } as unknown as Response;
}

class FakeWs {
  closed = false;
  private listeners: Record<string, ((ev: { data?: unknown }) => void)[]> = {};
  constructor(public url: string) {}
  addEventListener(type: string, fn: (ev: { data?: unknown }) => void) { (this.listeners[type] ??= []).push(fn); }
  removeEventListener() {}
  send() {}
  close() { this.closed = true; (this.listeners['close'] ?? []).forEach((f) => f({})); }
  emit(event: unknown) { (this.listeners['message'] ?? []).forEach((f) => f({ data: JSON.stringify(event) })); }
  open() { (this.listeners['open'] ?? []).forEach((f) => f({})); }
  drop() { (this.listeners['close'] ?? []).forEach((f) => f({})); }
}

describe('HttpOfficeGateway', () => {
  it('reads snapshots over HTTP', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith(OFFICE_API.agentStatuses)) return jsonResponse(INITIAL_STATUSES);
      if (url.endsWith(OFFICE_API.backtests)) return jsonResponse(BACKTESTS);
      return jsonResponse(null, false, 404);
    });
    const gw = new HttpOfficeGateway({ baseUrl: 'http://x', fetchImpl });
    expect(await gw.getAgentStatuses()).toEqual(INITIAL_STATUSES);
    expect(await gw.getBacktests()).toEqual(BACKTESTS);
  });

  it('throws on a non-2xx (no silent fallback)', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { code: 'down', message: 'server unavailable' } }, false, 503));
    const gw = new HttpOfficeGateway({ baseUrl: 'http://x', fetchImpl });
    await expect(gw.getHypotheses()).rejects.toThrow(/server unavailable/);
  });

  it('fans out WS events over a single connection and closes on last unsubscribe', () => {
    const sockets: FakeWs[] = [];
    const gw = new HttpOfficeGateway({
      baseUrl: 'http://x',
      fetchImpl: async () => jsonResponse(null),
      wsFactory: (url) => { const s = new FakeWs(url); sockets.push(s); return s; },
    });
    const a: string[] = [];
    const b: string[] = [];
    const offA = gw.subscribeOfficeEvents!((e) => a.push(e.type));
    const offB = gw.subscribeOfficeEvents!((e) => b.push(e.type));
    expect(sockets.length).toBe(1);
    sockets[0]!.emit({ type: 'heartbeat', ts: '1' });
    expect(a).toEqual(['heartbeat']);
    expect(b).toEqual(['heartbeat']);
    offA(); offB();
    expect(sockets[0]!.closed).toBe(true);
  });

  it('does not flag a degraded connection on intentional close (last unsubscribe)', () => {
    const sockets: FakeWs[] = [];
    const gw = new HttpOfficeGateway({
      baseUrl: 'http://x',
      fetchImpl: async () => jsonResponse(null),
      wsFactory: (url) => { const s = new FakeWs(url); sockets.push(s); return s; },
    });
    const seen: string[] = [];
    gw.subscribeConnection((s) => seen.push(s));
    const off = gw.subscribeOfficeEvents!(() => {});
    sockets[0]!.open();           // connecting → connected
    off();                        // last unsubscribe → intentional disconnect → socket close
    expect(seen).not.toContain('reconnecting');
    expect(seen).not.toContain('disconnected');
    expect(seen).not.toContain('error');
  });

  it('confirmAction POSTs to operatorConfirm and returns accepted', async () => {
    let captured: { url: string; init?: RequestInit } | undefined;
    const fetchImpl = async (url: string, init?: RequestInit) => {
      captured = { url, init };
      return new Response(JSON.stringify({ operatorMessageId: 'm9', conversationId: 'c9', status: 'accepted' }), { status: 200 });
    };
    const gw = new HttpOfficeGateway({ baseUrl: 'http://office', fetchImpl });
    const accepted = await gw.confirmAction({ pendingInteractionId: 'p1', sessionId: 's1', decision: 'confirm' });
    expect(captured!.url).toBe('http://office' + OFFICE_API.operatorConfirm);
    expect(captured!.init!.method).toBe('POST');
    expect(JSON.parse(captured!.init!.body as string)).toEqual({ pendingInteractionId: 'p1', sessionId: 's1', decision: 'confirm' });
    expect(accepted.operatorMessageId).toBe('m9');
  });

  it('confirmAction throws on a non-ok response', async () => {
    const fetchImpl = async () => new Response('', { status: 503 });
    const gw = new HttpOfficeGateway({ baseUrl: 'http://office', fetchImpl });
    await expect(gw.confirmAction({ pendingInteractionId: 'p', sessionId: 's', decision: 'cancel' })).rejects.toThrow();
  });

  it('sends Authorization: Bearer on reads when a token is provided', async () => {
    let authHeader: string | undefined;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      authHeader = new Headers(init?.headers).get('authorization') ?? undefined;
      return jsonResponse(INITIAL_STATUSES);
    }) as unknown as typeof fetch;
    const gw = new HttpOfficeGateway({ baseUrl: 'http://x', fetchImpl, getToken: () => 'tok-1' });
    await gw.getAgentStatuses();
    expect(authHeader).toBe('Bearer tok-1');
  });

  it('omits Authorization when no token is available (open mode)', async () => {
    let hasAuth = true;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      hasAuth = new Headers(init?.headers).has('authorization');
      return jsonResponse(INITIAL_STATUSES);
    }) as unknown as typeof fetch;
    const gw = new HttpOfficeGateway({ baseUrl: 'http://x', fetchImpl, getToken: () => null });
    await gw.getAgentStatuses();
    expect(hasAuth).toBe(false);
  });

  it('sends Authorization: Bearer on operator POSTs', async () => {
    let authHeader: string | undefined;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      authHeader = new Headers(init?.headers).get('authorization') ?? undefined;
      return new Response(JSON.stringify({ operatorMessageId: 'm', conversationId: 'c', status: 'accepted' }), { status: 200 });
    }) as unknown as typeof fetch;
    const gw = new HttpOfficeGateway({ baseUrl: 'http://office', fetchImpl, getToken: () => 'tok-post' });
    await gw.confirmAction({ pendingInteractionId: 'p', sessionId: 's', decision: 'confirm' });
    expect(authHeader).toBe('Bearer tok-post');
  });

  it('passes the token to the WebSocket as ?access_token (header-less upgrade)', () => {
    const sockets: FakeWs[] = [];
    const gw = new HttpOfficeGateway({
      baseUrl: 'http://x',
      fetchImpl: async () => jsonResponse(null),
      wsFactory: (url) => { const s = new FakeWs(url); sockets.push(s); return s; },
      getToken: () => 'tok-ws',
    });
    const off = gw.subscribeOfficeEvents!(() => {});
    expect(sockets[0]!.url).toContain('access_token=tok-ws');
    off();
  });

  it('signals connection state across the WS lifecycle', () => {
    const sockets: FakeWs[] = [];
    const gw = new HttpOfficeGateway({
      baseUrl: 'http://x',
      fetchImpl: async () => jsonResponse(null),
      wsFactory: (url) => { const s = new FakeWs(url); sockets.push(s); return s; },
    });
    const seen: string[] = [];
    gw.subscribeConnection((s) => seen.push(s));
    const off = gw.subscribeOfficeEvents!(() => {});
    expect(seen).toContain('connecting');
    sockets[0]!.open();
    expect(seen).toContain('connected');
    sockets[0]!.drop();
    expect(seen.some((s) => s === 'reconnecting' || s === 'disconnected')).toBe(true);
    off();
  });
});
