import { describe, it, expect } from 'vitest';
import { loadConfig } from './config';

const base = { TRADING_LAB_READ_URL: 'http://lab:3100', TRADING_LAB_READ_TOKEN: 't' };

describe('loadConfig', () => {
  it('defaults to fixture mode with no lab env', () => {
    const c = loadConfig({});
    expect(c.connectorMode).toBe('fixture');
    expect(c.port).toBe(8787);
  });

  it('parses trading-lab mode with lab + follow + stream knobs', () => {
    const c = loadConfig({
      OFFICE_CONNECTOR_MODE: 'trading-lab',
      ...base,
      TRADING_LAB_CHAT_URL: 'http://lab:3000',
      TRADING_LAB_CHAT_TOKEN: 'c',
      OFFICE_CHAT_FOLLOW_MAX_MS: '120000',
      OFFICE_CHAT_FOLLOW_IDLE_MS: '9000',
      OFFICE_CHAT_FOLLOW_MAX_DELTAS: '50',
      OFFICE_STREAM_RECONNECT_BASE_MS: '500',
      OFFICE_STREAM_RECONNECT_MAX_MS: '10000',
    });
    expect(c.connectorMode).toBe('trading-lab');
    expect(c.tradingLab.readUrl).toBe('http://lab:3100');
    expect(c.tradingLab.readToken).toBe('t');
    expect(c.tradingLab.chatUrl).toBe('http://lab:3000');
    expect(c.chatFollow.maxMs).toBe(120000);
    expect(c.chatFollow.idleMs).toBe(9000);
    expect(c.chatFollow.maxDeltas).toBe(50);
    expect(c.stream.reconnectBaseMs).toBe(500);
    expect(c.stream.reconnectMaxMs).toBe(10000);
  });

  it('fails fast in trading-lab mode without read url+token', () => {
    expect(() => loadConfig({ OFFICE_CONNECTOR_MODE: 'trading-lab' })).toThrow(/TRADING_LAB_READ_URL.*TRADING_LAB_READ_TOKEN/s);
  });

  it('uses follow/stream defaults when unset', () => {
    const c = loadConfig({ OFFICE_CONNECTOR_MODE: 'trading-lab', ...base });
    expect(c.chatFollow.maxMs).toBe(300000);
    expect(c.chatFollow.idleMs).toBe(45000);
    expect(c.chatFollow.maxDeltas).toBe(200);
    expect(c.chatFollow.bootstrapRetries).toBe(8);
    expect(c.stream.reconnectBaseMs).toBe(1000);
  });

  it('completionSummaryEnabled defaults to true when OPERATOR_COMPLETION_SUMMARY is unset', () => {
    expect(loadConfig({} as NodeJS.ProcessEnv).chatFollow.completionSummaryEnabled).toBe(true);
  });

  it('completionSummaryEnabled is false when OPERATOR_COMPLETION_SUMMARY=false', () => {
    expect(
      loadConfig({ OPERATOR_COMPLETION_SUMMARY: 'false' } as unknown as NodeJS.ProcessEnv).chatFollow.completionSummaryEnabled,
    ).toBe(false);
  });

  it('downstream-backtests flag defaults off; on when OPERATOR_DOWNSTREAM_BACKTESTS=true in trading-lab mode', () => {
    // defaults off in fixture mode
    expect(loadConfig({}).downstreamBacktests.enabled).toBe(false);
    // defaults off even with flag set in fixture mode
    expect(loadConfig({ OPERATOR_DOWNSTREAM_BACKTESTS: 'true' }).downstreamBacktests.enabled).toBe(false);
    // on when flag=true + trading-lab mode
    expect(
      loadConfig({ OFFICE_CONNECTOR_MODE: 'trading-lab', ...base, OPERATOR_DOWNSTREAM_BACKTESTS: 'true' }).downstreamBacktests.enabled,
    ).toBe(true);
    // off when flag unset in trading-lab mode
    expect(
      loadConfig({ OFFICE_CONNECTOR_MODE: 'trading-lab', ...base }).downstreamBacktests.enabled,
    ).toBe(false);
  });

  it('downstream-backtests guard defaults are applied', () => {
    const c = loadConfig({ OFFICE_CONNECTOR_MODE: 'trading-lab', ...base });
    expect(c.downstreamBacktests.idleMs).toBe(120000);
    expect(c.downstreamBacktests.maxMs).toBe(900000);
    expect(c.downstreamBacktests.bootstrapRetries).toBe(8);
    expect(c.downstreamBacktests.bootstrapIntervalMs).toBe(750);
    expect(c.downstreamBacktests.summaryRetries).toBe(5);
    expect(c.downstreamBacktests.summaryIntervalMs).toBe(500);
  });
});
