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
