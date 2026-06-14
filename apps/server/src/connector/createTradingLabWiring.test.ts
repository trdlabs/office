import { describe, it, expect } from 'vitest';
import { createTradingLabWiring } from './createTradingLabWiring';
import { loadConfig } from '../config';
import type { SseConnect, SseConnection } from './tradinglab/TradingLabStreamBridge';
import type { OfficeEvent } from '@trading-office/office-gateway';

const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });

describe('createTradingLabWiring', () => {
  it('turns a trading-lab stream event into an office WS event', async () => {
    const config = loadConfig({ OFFICE_CONNECTOR_MODE: 'trading-lab', TRADING_LAB_READ_URL: 'http://lab:3100', TRADING_LAB_READ_TOKEN: 't' });
    const fetchImpl = (async () => json({ status: 'ok', checks: { db: true } })) as unknown as typeof fetch;
    const connect: SseConnect = async ({ signal }): Promise<SseConnection> => ({
      frames: (async function* () {
        yield { event: 'agent_status_changed', data: JSON.stringify({ agentId: 'critic', status: 'working', currentTaskId: null, ts: 'x' }) } as never;
        await new Promise<void>((res) => signal.addEventListener('abort', () => res()));
      })(),
      close: () => {},
    });
    const wiring = createTradingLabWiring(config, { fetchImpl, connect, now: () => 'T' });
    const out: OfficeEvent[] = [];
    const stop = wiring.connector.start((e) => out.push(e));
    await new Promise((r) => setTimeout(r, 10));
    stop();
    expect(out).toContainEqual({ type: 'agent_status_changed', ts: 'T', agentId: 'critic', status: 'reviewing' });
    expect(wiring.bridge.state()).toBe('live');
  });
});
