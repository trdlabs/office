import { describe, it, expect } from 'vitest';
import { createTradingLabWiring } from '../createTradingLabWiring';
import { loadConfig } from '../../config';
import type { PlatformMonitoringConnector } from './PlatformMonitoringConnector';

const cfg = () => loadConfig({ OFFICE_CONNECTOR_MODE: 'trading-lab', TRADING_LAB_READ_URL: 'http://lab', TRADING_LAB_READ_TOKEN: 't' });
const labFetch = (async () => new Response(JSON.stringify({ status: 'ok' }), { status: 200 })) as unknown as typeof fetch;

const fakePlatform = (): PlatformMonitoringConnector => ({
  getBotHealth: async () => [{ id: 'b1', name: 's', state: 'running', uptime: '1m', lastHeartbeat: '2s ago' }],
  getPlatformInfra: async () => ({ services: [], sources: [{ domain: 'bot-health', state: 'live', detail: 'ok' }] }),
} as unknown as PlatformMonitoringConnector);

describe('platform composition', () => {
  it('with platform injected: getBotHealth routes to platform; infra bot-health is live (not gap)', async () => {
    const wiring = createTradingLabWiring(cfg(), { fetchImpl: labFetch, platform: fakePlatform() });
    expect(await wiring.connector.getBotHealth()).toHaveLength(1);
    const infra = await wiring.connector.getInfraStatus();
    expect(infra.sources?.find((s) => s.domain === 'bot-health')).toMatchObject({ state: 'live' });
  });
  it('without platform: getBotHealth [] and bot-health stays gap (Phase 3 behavior)', async () => {
    const wiring = createTradingLabWiring(cfg(), { fetchImpl: labFetch });
    expect(await wiring.connector.getBotHealth()).toEqual([]);
    const infra = await wiring.connector.getInfraStatus();
    expect(infra.sources?.find((s) => s.domain === 'bot-health')).toMatchObject({ state: 'gap' });
    expect(infra.sources?.find((s) => s.domain === 'knowledge')).toMatchObject({ state: 'gap' });
  });
});
