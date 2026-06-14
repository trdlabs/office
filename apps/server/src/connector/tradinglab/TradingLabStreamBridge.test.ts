import { describe, it, expect } from 'vitest';
import { TradingLabStreamBridge, type SseConnect, type SseConnection } from './TradingLabStreamBridge';
import type { OfficeEvent } from '@trading-office/office-gateway';

const NOW = () => '2026-06-14T00:00:00.000Z';
const framesOf = (arr: unknown[]): SseConnection => ({
  frames: (async function* () { for (const f of arr) yield f as never; })(),
  close: () => {},
});
const parkUntilAbort = (signal: AbortSignal): SseConnection => ({
  frames: (async function* () { await new Promise<void>((res) => signal.addEventListener('abort', () => res())); })(),
  close: () => {},
});

describe('TradingLabStreamBridge', () => {
  it('maps frames to office events, tracks resume id, notices degrade, re-snapshots', async () => {
    const emitted: OfficeEvent[] = [];
    const seen: Array<Record<string, string>> = [];
    const connect: SseConnect = async ({ headers, signal }) => {
      seen.push(headers);
      if (seen.length === 1) {
        return framesOf([
          { event: 'agent_status_changed', data: JSON.stringify({ agentId: 'builder', status: 'working', currentTaskId: 't', ts: 'x' }) },
          { event: 'agent_event_appended', id: 'c1', data: JSON.stringify({ agentId: 'researcher', event: { id: 'e1', ts: 'x', type: 'research.run_cycle.started', taskId: 't', level: 'info', summary: 'Research Run Cycle Started' } }) },
        ]);
      }
      return parkUntilAbort(signal);
    };
    const bridge = new TradingLabStreamBridge({
      url: 'http://lab:3100', readToken: 't', reconnectBaseMs: 1, reconnectMaxMs: 1,
      onSnapshot: async () => ({}), connect, now: NOW, sleep: async () => {},
    });
    const appended: string[] = [];
    bridge.subscribeAppended((e) => appended.push(e.type));
    const stop = bridge.start((e) => emitted.push(e));
    await new Promise((r) => setTimeout(r, 10));
    stop();

    expect(emitted).toContainEqual({ type: 'agent_status_changed', ts: NOW(), agentId: 'builder', status: 'running' });
    expect(emitted).toContainEqual({ type: 'agent_trace_appended', ts: NOW(), agentId: 'researcher', line: { ts: 'x', level: 'info', text: 'Research Run Cycle Started' } });
    expect(appended).toEqual(['research.run_cycle.started']);
    expect(seen[0]!['Last-Event-ID']).toBeUndefined();
    expect(seen[1]!['Last-Event-ID']).toBe('c1');                       // resume cursor
    expect(emitted.some((e) => e.type === 'system_notice' && e.level === 'warn')).toBe(true);
    expect(emitted.some((e) => e.type === 'agent_statuses_snapshot')).toBe(true); // re-sync on reconnect
  });

  it('stop() halts the reconnect loop (no reconnect after stop)', async () => {
    let connects = 0;
    const box: { release: (() => void) | null } = { release: null };
    const connect: SseConnect = async () => { connects++; return framesOf([]); }; // ends immediately → backoff
    const sleep = () => new Promise<void>((r) => { box.release = r; });           // pause in backoff until released
    const bridge = new TradingLabStreamBridge({
      url: 'http://lab:3100', readToken: 't', reconnectBaseMs: 1, reconnectMaxMs: 1,
      onSnapshot: async () => ({}), connect, now: NOW, sleep,
    });
    const stop = bridge.start(() => {});
    await new Promise((r) => setTimeout(r, 5));   // first connect runs, ends, enters backoff
    expect(connects).toBe(1);
    stop();                                        // request stop while parked in backoff
    box.release?.();                               // release the backoff wait
    await new Promise((r) => setTimeout(r, 5));
    expect(connects).toBe(1);                      // loop saw stopped → did NOT reconnect
  });
});
