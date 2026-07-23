import type { ScorecardFollowGuards } from './operator/ScorecardFollower';
import { ambientEnv, parseOfficeEnv } from './env';

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

// Всё чтение окружения идёт через типизированную env-схему (src/env.ts) —
// единственную точку чтения process.env (env-catalog item 5). parseOfficeEnv
// валидирует env fail-fast (все ошибки разом); здесь остаются только
// кросс-переменные инварианты (fail-closed гейты) и сборка структуры конфига.
export function loadConfig(env: NodeJS.ProcessEnv = ambientEnv()): OfficeServerConfig {
  const e = parseOfficeEnv(env);
  const connectorMode: OfficeConnectorMode = e.OFFICE_CONNECTOR_MODE;

  const tradingLab: TradingLabConfig = {
    readUrl: e.TRADING_LAB_READ_URL,
    readToken: e.TRADING_LAB_READ_TOKEN ?? '',
    chatUrl: e.TRADING_LAB_CHAT_URL,
    chatToken: e.TRADING_LAB_CHAT_TOKEN ?? '',
    requestTimeoutMs: e.TRADING_LAB_REQUEST_TIMEOUT_MS,
  };

  // Инвариант смотрит на «сырое» окружение сознательно: в режиме trading-lab
  // URL и токен должны быть заданы ЯВНО — дефолт схемы не считается.
  if (connectorMode === 'trading-lab' && (!env.TRADING_LAB_READ_URL || !env.TRADING_LAB_READ_TOKEN)) {
    throw new Error(
      'OFFICE_CONNECTOR_MODE=trading-lab requires TRADING_LAB_READ_URL and TRADING_LAB_READ_TOKEN',
    );
  }

  const operatorPassword = e.OFFICE_OPERATOR_PASSWORD ?? '';
  const auth: AuthConfig = {
    enabled: operatorPassword !== '',
    password: operatorPassword,
    secret: e.OFFICE_AUTH_SECRET ?? operatorPassword,
    ttlMs: e.OFFICE_AUTH_TTL_MS, // default 12h
  };

  const platformEnabled = e.OFFICE_PLATFORM_ENABLED && connectorMode === 'trading-lab';
  const platform: PlatformConfig = {
    enabled: platformEnabled,
    readUrl: e.TRADING_PLATFORM_READ_URL,
    readToken: e.TRADING_PLATFORM_READ_TOKEN ?? '',
    requestTimeoutMs: e.TRADING_PLATFORM_REQUEST_TIMEOUT_MS,
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
    port: e.OFFICE_SERVER_PORT,
    corsOrigin: e.OFFICE_CORS_ORIGIN,
    eventTickMs: e.OFFICE_EVENT_TICK_MS,
    heartbeatMs: e.OFFICE_HEARTBEAT_MS,
    fixtureLatencyMs: e.OFFICE_FIXTURE_LATENCY_MS,
    connectorMode,
    tradingLab,
    chatFollow: {
      maxMs: e.OFFICE_CHAT_FOLLOW_MAX_MS,
      idleMs: e.OFFICE_CHAT_FOLLOW_IDLE_MS,
      maxDeltas: e.OFFICE_CHAT_FOLLOW_MAX_DELTAS,
      bootstrapRetries: e.OFFICE_CHAT_BOOTSTRAP_RETRIES,
      bootstrapIntervalMs: e.OFFICE_CHAT_BOOTSTRAP_INTERVAL_MS,
      completionSummaryEnabled: e.OPERATOR_COMPLETION_SUMMARY, // default ON
    },
    stream: {
      reconnectBaseMs: e.OFFICE_STREAM_RECONNECT_BASE_MS,
      reconnectMaxMs: e.OFFICE_STREAM_RECONNECT_MAX_MS,
    },
    platform,
    downstreamBacktests: {
      enabled: e.OPERATOR_DOWNSTREAM_BACKTESTS && connectorMode === 'trading-lab',
      idleMs: e.OFFICE_BACKTEST_WATCH_IDLE_MS,
      maxMs: e.OFFICE_BACKTEST_WATCH_MAX_MS,
      bootstrapRetries: e.OFFICE_CHAT_BOOTSTRAP_RETRIES,
      bootstrapIntervalMs: e.OFFICE_CHAT_BOOTSTRAP_INTERVAL_MS,
      summaryRetries: e.OFFICE_BACKTEST_SUMMARY_RETRIES,
      summaryIntervalMs: e.OFFICE_BACKTEST_SUMMARY_INTERVAL_MS,
    },
    cycleScorecard: {
      enabled: e.OPERATOR_CYCLE_SCORECARD && connectorMode === 'trading-lab',
      guards: {
        ttlMs: e.OFFICE_SCORECARD_TTL_MS,
        bootstrapRetries: e.OFFICE_SCORECARD_BOOTSTRAP_RETRIES,
        bootstrapIntervalMs: e.OFFICE_SCORECARD_BOOTSTRAP_INTERVAL_MS,
        fetchRetries: e.OFFICE_SCORECARD_FETCH_RETRIES,
        fetchIntervalMs: e.OFFICE_SCORECARD_FETCH_INTERVAL_MS,
      },
    },
    auth,
  };
}
