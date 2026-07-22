import { describe, it, expect } from 'vitest';
import { loadConfig } from './config';

// Connected mode is fail-closed on the operator password, so every trading-lab fixture below
// must carry one — an omission is a startup refusal, not an "auth off" config.
const base = { TRADING_LAB_READ_URL: 'http://lab:3100', TRADING_LAB_READ_TOKEN: 't', OFFICE_OPERATOR_PASSWORD: 'op-pass' };

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

  it('cycleScorecard defaults: disabled, sane guards', () => {
    const c = loadConfig({});
    expect(c.cycleScorecard.enabled).toBe(false);
    expect(c.cycleScorecard.guards.ttlMs).toBe(3_600_000);
    expect(c.cycleScorecard.guards.fetchRetries).toBe(3);
  });
  it('OPERATOR_CYCLE_SCORECARD only enables in trading-lab mode', () => {
    expect(loadConfig({ OPERATOR_CYCLE_SCORECARD: 'true' }).cycleScorecard.enabled).toBe(false); // fixture mode
    const c = loadConfig({ OPERATOR_CYCLE_SCORECARD: 'true', OFFICE_CONNECTOR_MODE: 'trading-lab', ...base });
    expect(c.cycleScorecard.enabled).toBe(true);
  });
  it('scorecard guards read from env', () => {
    const c = loadConfig({ OFFICE_SCORECARD_TTL_MS: '5000', OFFICE_SCORECARD_FETCH_RETRIES: '1' });
    expect(c.cycleScorecard.guards.ttlMs).toBe(5000);
    expect(c.cycleScorecard.guards.fetchRetries).toBe(1);
  });

  describe('operator auth', () => {
    it('is disabled when no operator password is set (open, as before)', () => {
      expect(loadConfig({}).auth.enabled).toBe(false);
    });

    it('turns on when OFFICE_OPERATOR_PASSWORD is set; secret defaults to the password', () => {
      const c = loadConfig({ OFFICE_OPERATOR_PASSWORD: 's3cret' });
      expect(c.auth).toMatchObject({ enabled: true, password: 's3cret', secret: 's3cret' });
      expect(c.auth.ttlMs).toBeGreaterThan(0);
    });

    it('an empty password string does not enable auth', () => {
      expect(loadConfig({ OFFICE_OPERATOR_PASSWORD: '' }).auth.enabled).toBe(false);
    });

    it('OFFICE_AUTH_SECRET and OFFICE_AUTH_TTL_MS override the defaults', () => {
      const c = loadConfig({
        OFFICE_OPERATOR_PASSWORD: 's3cret',
        OFFICE_AUTH_SECRET: 'hmac-key',
        OFFICE_AUTH_TTL_MS: '1000',
      });
      expect(c.auth.secret).toBe('hmac-key');
      expect(c.auth.ttlMs).toBe(1000);
    });
  });

  // SEC-O1: the fixture path may stay open, but a connected office fronts real lab/platform
  // service tokens — there an unauthenticated port is a credential-bearing bypass. loadConfig()
  // runs before serve() in index.ts, so a throw here IS the non-zero exit the gate asks for.
  describe('fail-closed: connected mode requires an operator password', () => {
    const connected = { OFFICE_CONNECTOR_MODE: 'trading-lab', TRADING_LAB_READ_URL: 'http://lab:3100', TRADING_LAB_READ_TOKEN: 't' };

    it('refuses to build a trading-lab config with no operator password', () => {
      expect(() => loadConfig(connected)).toThrow(/OFFICE_OPERATOR_PASSWORD/);
    });

    it('refuses an explicitly empty operator password', () => {
      expect(() => loadConfig({ ...connected, OFFICE_OPERATOR_PASSWORD: '' })).toThrow(/OFFICE_OPERATOR_PASSWORD/);
    });

    it('refuses a whitespace-only password (an unusable guard is not a guard)', () => {
      expect(() => loadConfig({ ...connected, OFFICE_OPERATOR_PASSWORD: '   ' })).toThrow(/OFFICE_OPERATOR_PASSWORD/);
    });

    it('refuses platform-enabled mode with no operator password', () => {
      expect(() =>
        loadConfig({
          ...connected,
          OFFICE_PLATFORM_ENABLED: 'true',
          TRADING_PLATFORM_READ_URL: 'http://platform:8839',
          TRADING_PLATFORM_READ_TOKEN: 'p',
        }),
      ).toThrow(/OFFICE_OPERATOR_PASSWORD/);
    });

    it('starts once a password is supplied, with auth enforced', () => {
      const c = loadConfig({ ...connected, OFFICE_OPERATOR_PASSWORD: 'op-pass' });
      expect(c.connectorMode).toBe('trading-lab');
      expect(c.auth.enabled).toBe(true);
    });

    it('leaves fixture mode startable without a password (demo path is unchanged)', () => {
      const c = loadConfig({});
      expect(c.connectorMode).toBe('fixture');
      expect(c.auth.enabled).toBe(false);
    });
  });
});
