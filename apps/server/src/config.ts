import type { ScorecardFollowGuards } from './operator/ScorecardFollower';

export type OfficeConnectorMode = 'fixture' | 'trading-lab';

export interface TradingLabConfig {
  readUrl: string;
  readToken: string;
  chatUrl: string;
  chatToken: string;
  requestTimeoutMs: number;
}

export interface ChatFollowConfig {
  maxMs: number;
  idleMs: number;
  maxDeltas: number;
  bootstrapRetries: number;
  bootstrapIntervalMs: number;
  completionSummaryEnabled: boolean;
}

export interface StreamConfig {
  reconnectBaseMs: number;
  reconnectMaxMs: number;
}

export interface PlatformConfig {
  enabled: boolean;
  readUrl: string;
  readToken: string;
  requestTimeoutMs: number;
}

export interface DownstreamBacktestsConfig {
  enabled: boolean;
  idleMs: number;
  maxMs: number;
  bootstrapRetries: number;
  bootstrapIntervalMs: number;
  summaryRetries: number;
  summaryIntervalMs: number;
}

export interface AuthConfig {
  /** Operator auth is enforced only when a password is configured. */
  enabled: boolean;
  /** Shared operator password (verified server-side, constant-time). */
  password: string;
  /** HMAC key for session tokens; defaults to the password when unset. */
  secret: string;
  /** Session token lifetime in ms. */
  ttlMs: number;
}

export interface OfficeServerConfig {
  port: number;
  corsOrigin: string;
  eventTickMs: number;
  heartbeatMs: number;
  fixtureLatencyMs: number;
  connectorMode: OfficeConnectorMode;
  tradingLab: TradingLabConfig;
  chatFollow: ChatFollowConfig;
  stream: StreamConfig;
  platform: PlatformConfig;
  downstreamBacktests: DownstreamBacktestsConfig;
  cycleScorecard: { enabled: boolean; guards: ScorecardFollowGuards };
  auth: AuthConfig;
}

const num = (env: NodeJS.ProcessEnv, key: string, def: number): number => {
  const raw = env[key];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  return Number.isFinite(n) ? n : def;
};

const str = (env: NodeJS.ProcessEnv, key: string, def: string): string => {
  const raw = env[key];
  return raw === undefined || raw === '' ? def : raw;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): OfficeServerConfig {
  const connectorMode: OfficeConnectorMode =
    env.OFFICE_CONNECTOR_MODE === 'trading-lab' ? 'trading-lab' : 'fixture';

  const tradingLab: TradingLabConfig = {
    readUrl: str(env, 'TRADING_LAB_READ_URL', 'http://localhost:3100'),
    readToken: str(env, 'TRADING_LAB_READ_TOKEN', ''),
    chatUrl: str(env, 'TRADING_LAB_CHAT_URL', 'http://localhost:3000'),
    chatToken: str(env, 'TRADING_LAB_CHAT_TOKEN', ''),
    requestTimeoutMs: num(env, 'TRADING_LAB_REQUEST_TIMEOUT_MS', 10000),
  };

  if (connectorMode === 'trading-lab' && (!env.TRADING_LAB_READ_URL || !env.TRADING_LAB_READ_TOKEN)) {
    throw new Error(
      'OFFICE_CONNECTOR_MODE=trading-lab requires TRADING_LAB_READ_URL and TRADING_LAB_READ_TOKEN',
    );
  }

  const operatorPassword = str(env, 'OFFICE_OPERATOR_PASSWORD', '');
  const auth: AuthConfig = {
    enabled: operatorPassword !== '',
    password: operatorPassword,
    secret: str(env, 'OFFICE_AUTH_SECRET', operatorPassword),
    ttlMs: num(env, 'OFFICE_AUTH_TTL_MS', 12 * 60 * 60 * 1000), // 12h
  };

  const platformEnabled = env.OFFICE_PLATFORM_ENABLED === 'true' && connectorMode === 'trading-lab';
  const platform: PlatformConfig = {
    enabled: platformEnabled,
    readUrl: str(env, 'TRADING_PLATFORM_READ_URL', 'http://localhost:8839'),
    readToken: str(env, 'TRADING_PLATFORM_READ_TOKEN', ''),
    requestTimeoutMs: num(env, 'TRADING_PLATFORM_REQUEST_TIMEOUT_MS', 10000),
  };
  // Fail-closed (SEC-O1). `auth.enabled` above keys off a non-empty password, which makes
  // operator auth OPTIONAL — acceptable for the fixture/demo path, never for a CONNECTED
  // office: there the server holds real lab and platform service tokens and proxies them on
  // every call, so an unauthenticated port is a credential-bearing bypass. Refuse to start
  // rather than serve an open API. Whitespace is rejected too: it would mount a guard whose
  // password cannot be typed, which reads as "auth on" while being unusable.
  // platformEnabled already implies trading-lab mode; both are named so the invariant survives
  // if that coupling is ever relaxed.
  if ((connectorMode === 'trading-lab' || platformEnabled) && operatorPassword.trim() === '') {
    throw new Error(
      'connected mode (OFFICE_CONNECTOR_MODE=trading-lab / OFFICE_PLATFORM_ENABLED=true) requires a non-empty OFFICE_OPERATOR_PASSWORD — operator auth is mandatory once the office fronts real credentials',
    );
  }

  if (platformEnabled && (!env.TRADING_PLATFORM_READ_URL || !env.TRADING_PLATFORM_READ_TOKEN)) {
    throw new Error(
      'OFFICE_PLATFORM_ENABLED=true (trading-lab mode) requires TRADING_PLATFORM_READ_URL and TRADING_PLATFORM_READ_TOKEN',
    );
  }

  return {
    port: num(env, 'OFFICE_SERVER_PORT', 8787),
    corsOrigin: str(env, 'OFFICE_CORS_ORIGIN', 'http://localhost:5174'),
    eventTickMs: num(env, 'OFFICE_EVENT_TICK_MS', 2600),
    heartbeatMs: num(env, 'OFFICE_HEARTBEAT_MS', 15000),
    fixtureLatencyMs: num(env, 'OFFICE_FIXTURE_LATENCY_MS', 0),
    connectorMode,
    tradingLab,
    chatFollow: {
      maxMs: num(env, 'OFFICE_CHAT_FOLLOW_MAX_MS', 300000),
      idleMs: num(env, 'OFFICE_CHAT_FOLLOW_IDLE_MS', 45000),
      maxDeltas: num(env, 'OFFICE_CHAT_FOLLOW_MAX_DELTAS', 200),
      bootstrapRetries: num(env, 'OFFICE_CHAT_BOOTSTRAP_RETRIES', 8),
      bootstrapIntervalMs: num(env, 'OFFICE_CHAT_BOOTSTRAP_INTERVAL_MS', 750),
      completionSummaryEnabled: env.OPERATOR_COMPLETION_SUMMARY !== 'false', // default ON
    },
    stream: {
      reconnectBaseMs: num(env, 'OFFICE_STREAM_RECONNECT_BASE_MS', 1000),
      reconnectMaxMs: num(env, 'OFFICE_STREAM_RECONNECT_MAX_MS', 30000),
    },
    platform,
    downstreamBacktests: {
      enabled: env.OPERATOR_DOWNSTREAM_BACKTESTS === 'true' && connectorMode === 'trading-lab',
      idleMs: num(env, 'OFFICE_BACKTEST_WATCH_IDLE_MS', 120000),
      maxMs: num(env, 'OFFICE_BACKTEST_WATCH_MAX_MS', 900000),
      bootstrapRetries: num(env, 'OFFICE_CHAT_BOOTSTRAP_RETRIES', 8),
      bootstrapIntervalMs: num(env, 'OFFICE_CHAT_BOOTSTRAP_INTERVAL_MS', 750),
      summaryRetries: num(env, 'OFFICE_BACKTEST_SUMMARY_RETRIES', 5),
      summaryIntervalMs: num(env, 'OFFICE_BACKTEST_SUMMARY_INTERVAL_MS', 500),
    },
    cycleScorecard: {
      enabled: env.OPERATOR_CYCLE_SCORECARD === 'true' && connectorMode === 'trading-lab',
      guards: {
        ttlMs: num(env, 'OFFICE_SCORECARD_TTL_MS', 3_600_000),
        bootstrapRetries: num(env, 'OFFICE_SCORECARD_BOOTSTRAP_RETRIES', 8),
        bootstrapIntervalMs: num(env, 'OFFICE_SCORECARD_BOOTSTRAP_INTERVAL_MS', 750),
        fetchRetries: num(env, 'OFFICE_SCORECARD_FETCH_RETRIES', 3),
        fetchIntervalMs: num(env, 'OFFICE_SCORECARD_FETCH_INTERVAL_MS', 500),
      },
    },
    auth,
  };
}
