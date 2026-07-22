import { describe, it, expect } from 'vitest';
import { loadConfig } from './config';

describe('platform config', () => {
  it('defaults: platform disabled', () => {
    const c = loadConfig({ OFFICE_CONNECTOR_MODE: 'trading-lab', TRADING_LAB_READ_URL: 'http://lab', TRADING_LAB_READ_TOKEN: 't', OFFICE_OPERATOR_PASSWORD: 'op-pass' });
    expect(c.platform.enabled).toBe(false);
  });
  it('enabled in trading-lab mode reads url/token', () => {
    const c = loadConfig({ OFFICE_CONNECTOR_MODE: 'trading-lab', TRADING_LAB_READ_URL: 'http://lab', TRADING_LAB_READ_TOKEN: 't', OFFICE_OPERATOR_PASSWORD: 'op-pass',
      OFFICE_PLATFORM_ENABLED: 'true', TRADING_PLATFORM_READ_URL: 'http://plat:8839', TRADING_PLATFORM_READ_TOKEN: 'p' });
    expect(c.platform).toMatchObject({ enabled: true, readUrl: 'http://plat:8839', readToken: 'p', requestTimeoutMs: 10000 });
  });
  it('fail-fast: enabled in trading-lab mode without url/token throws', () => {
    expect(() => loadConfig({ OFFICE_CONNECTOR_MODE: 'trading-lab', TRADING_LAB_READ_URL: 'http://lab', TRADING_LAB_READ_TOKEN: 't', OFFICE_OPERATOR_PASSWORD: 'op-pass', OFFICE_PLATFORM_ENABLED: 'true' }))
      .toThrow(/OFFICE_PLATFORM_ENABLED/);
  });
  it('flag ignored in fixture mode (platform disabled, no throw)', () => {
    const c = loadConfig({ OFFICE_CONNECTOR_MODE: 'fixture', OFFICE_PLATFORM_ENABLED: 'true' });
    expect(c.platform.enabled).toBe(false);
  });
});
