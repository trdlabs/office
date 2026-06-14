import { describe, it, expect, vi } from 'vitest';
import { buildConnector } from './buildConnector';
import { loadConfig } from '../config';

describe('buildConnector', () => {
  it('returns the fixture connector in fixture mode (knowledge is sample data)', async () => {
    const conn = buildConnector(loadConfig({}));
    expect((await conn.getKnowledge()).length).toBeGreaterThan(0);
  });

  it('returns the composite (empty knowledge gap) in trading-lab mode', async () => {
    const config = loadConfig({ OFFICE_CONNECTOR_MODE: 'trading-lab', TRADING_LAB_READ_URL: 'http://lab:3100', TRADING_LAB_READ_TOKEN: 't' });
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [], cursor: null }), { status: 200 }));
    const conn = buildConnector(config, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await conn.getKnowledge()).toEqual([]);
  });
});
