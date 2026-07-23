// env.ts — единственная точка чтения process.env в репо (контракт env-schema.1,
// control-center docs/architecture/contracts/env-schema.md, инициатива env-catalog).
//
// Здесь живут:
//  1) реестр ВСЕХ переменных окружения репо (ENV_SPECS) с типом, дефолтом,
//     описанием и признаками secret/flag — источник правды для экспорта
//     `npm run env:schema` и генерации ENV.md / .env*.example (`npm run env:docs`);
//  2) zod-схема серверных переменных: parseOfficeEnv() валидирует env fail-fast
//     (safeParse — печатаются ВСЕ невалидные переменные разом) и возвращает
//     типизированный объект. Тихих дефолтов для невалидных значений нет.
//
// Границы:
//  - VITE_* читаются на билд-тайме через import.meta.env (vite) — объявлены в
//    реестре (owner_unit office-web), но сервером не парсятся;
//  - OFFICE_IMAGE_TAG читает deploy/docker-compose.yml, ULPC_DIR — build-тул
//    packages/trading-lab-floor — тоже declaration-only;
//  - fail-closed гейт #32 (connected-режим требует OFFICE_OPERATOR_PASSWORD)
//    ЖИВЁТ в loadConfig (src/config.ts) и остаётся авторитетным: здесь пароль
//    описан как required=false + secret=true, потому что standalone (fixture)
//    режим без него легален. Схема описывает форму, не ослабляя гейт.

import { z } from 'zod';

export type EnvVarType = 'string' | 'int' | 'float' | 'bool' | 'enum' | 'url' | 'duration_ms' | 'csv';

export type EnvOwnerUnit = 'office-server' | 'office-web' | 'office-deploy' | 'office-tools';

export interface EnvVarSpec {
  readonly name: string;
  readonly type: EnvVarType;
  readonly required: boolean;
  /** Дефолт строкой, ровно как в .env; null — дефолта нет. Всегда null для secret/required. */
  readonly default: string | null;
  readonly description: string;
  readonly secret: boolean;
  readonly flag: boolean;
  readonly enum_values?: readonly string[];
  readonly owner_unit: EnvOwnerUnit;
  readonly consumers: readonly string[];
}

const CONFIG = 'apps/server/src/config.ts'; // единственный импортёр env.ts на серверной стороне
const COMPOSE = 'deploy/docker-compose.yml';

/**
 * Реестр переменных окружения репо. Отсортирован по name (правило контракта:
 * variables в экспорте отсортированы, имена уникальны — пинится тестами).
 */
export const ENV_SPECS: readonly EnvVarSpec[] = [
  {
    name: 'OFFICE_AUTH_SECRET',
    type: 'string',
    required: false,
    default: null,
    description: 'HMAC-ключ подписи сессионных токенов оператора; не задан — используется OFFICE_OPERATOR_PASSWORD',
    secret: true,
    flag: false,
    owner_unit: 'office-server',
    consumers: [CONFIG],
  },
  {
    name: 'OFFICE_AUTH_TTL_MS',
    type: 'duration_ms',
    required: false,
    default: '43200000',
    description: 'Время жизни сессионного токена оператора, мс (по умолчанию 12 часов)',
    secret: false,
    flag: false,
    owner_unit: 'office-server',
    consumers: [CONFIG],
  },
  {
    name: 'OFFICE_BACKTEST_SUMMARY_INTERVAL_MS',
    type: 'duration_ms',
    required: false,
    default: '500',
    description: 'Интервал между попытками получить summary завершившегося downstream-бэктеста, мс',
    secret: false,
    flag: false,
    owner_unit: 'office-server',
    consumers: [CONFIG],
  },
  {
    name: 'OFFICE_BACKTEST_SUMMARY_RETRIES',
    type: 'int',
    required: false,
    default: '5',
    description: 'Число попыток получить summary завершившегося downstream-бэктеста',
    secret: false,
    flag: false,
    owner_unit: 'office-server',
    consumers: [CONFIG],
  },
  {
    name: 'OFFICE_BACKTEST_WATCH_IDLE_MS',
    type: 'duration_ms',
    required: false,
    default: '120000',
    description: 'Idle-гард наблюдателя downstream-бэктестов: стоп после стольких мс без новых событий',
    secret: false,
    flag: false,
    owner_unit: 'office-server',
    consumers: [CONFIG],
  },
  {
    name: 'OFFICE_BACKTEST_WATCH_MAX_MS',
    type: 'duration_ms',
    required: false,
    default: '900000',
    description: 'Максимальная длительность наблюдения за downstream-бэктестами, мс',
    secret: false,
    flag: false,
    owner_unit: 'office-server',
    consumers: [CONFIG],
  },
  {
    name: 'OFFICE_CHAT_BOOTSTRAP_INTERVAL_MS',
    type: 'duration_ms',
    required: false,
    default: '750',
    description: 'Интервал между bootstrap-попытками чата/наблюдателей (первое чтение ленты событий), мс',
    secret: false,
    flag: false,
    owner_unit: 'office-server',
    consumers: [CONFIG],
  },
  {
    name: 'OFFICE_CHAT_BOOTSTRAP_RETRIES',
    type: 'int',
    required: false,
    default: '8',
    description: 'Число bootstrap-попыток чата/наблюдателей (первое чтение ленты событий)',
    secret: false,
    flag: false,
    owner_unit: 'office-server',
    consumers: [CONFIG],
  },
  {
    name: 'OFFICE_CHAT_FOLLOW_IDLE_MS',
    type: 'duration_ms',
    required: false,
    default: '45000',
    description: 'Idle-гард follow-режима оператор-чата: стоп после стольких мс без новых дельт',
    secret: false,
    flag: false,
    owner_unit: 'office-server',
    consumers: [CONFIG],
  },
  {
    name: 'OFFICE_CHAT_FOLLOW_MAX_DELTAS',
    type: 'int',
    required: false,
    default: '200',
    description: 'Максимум дельт, которые follow-режим оператор-чата ретранслирует за один запуск',
    secret: false,
    flag: false,
    owner_unit: 'office-server',
    consumers: [CONFIG],
  },
  {
    name: 'OFFICE_CHAT_FOLLOW_MAX_MS',
    type: 'duration_ms',
    required: false,
    default: '300000',
    description: 'Максимальная длительность follow-режима оператор-чата, мс',
    secret: false,
    flag: false,
    owner_unit: 'office-server',
    consumers: [CONFIG],
  },
  {
    name: 'OFFICE_CONNECTOR_MODE',
    type: 'enum',
    required: false,
    default: 'fixture',
    description: 'Режим коннектора офиса: fixture (демо-данные, standalone) или trading-lab (connected, live-чтение лаборатории)',
    secret: false,
    flag: false,
    enum_values: ['fixture', 'trading-lab'],
    owner_unit: 'office-server',
    consumers: [CONFIG],
  },
  {
    name: 'OFFICE_CORS_ORIGIN',
    type: 'string',
    required: false,
    default: 'http://localhost:5174',
    description: 'Разрешённый CORS-origin веб-офиса; обязан совпадать с origin, с которого браузер грузит web-приложение',
    secret: false,
    flag: false,
    owner_unit: 'office-server',
    consumers: [CONFIG, COMPOSE],
  },
  {
    name: 'OFFICE_EVENT_TICK_MS',
    type: 'duration_ms',
    required: false,
    default: '2600',
    description: 'Период тика fixture-продьюсера офисных событий, мс',
    secret: false,
    flag: false,
    owner_unit: 'office-server',
    consumers: [CONFIG],
  },
  {
    name: 'OFFICE_FIXTURE_LATENCY_MS',
    type: 'duration_ms',
    required: false,
    default: '0',
    description: 'Искусственная задержка ответов fixture-коннектора (демо реалистичной сети), мс',
    secret: false,
    flag: false,
    owner_unit: 'office-server',
    consumers: [CONFIG],
  },
  {
    name: 'OFFICE_HEARTBEAT_MS',
    type: 'duration_ms',
    required: false,
    default: '15000',
    description: 'Период heartbeat-события в WebSocket-потоке офиса, мс',
    secret: false,
    flag: false,
    owner_unit: 'office-server',
    consumers: [CONFIG],
  },
  {
    name: 'OFFICE_IMAGE_TAG',
    type: 'string',
    required: false,
    default: 'latest',
    description: 'Тег опубликованных GHCR-образов office-server/office-web для docker compose (пин конкретного билда, напр. sha-244d217)',
    secret: false,
    flag: false,
    owner_unit: 'office-deploy',
    consumers: [COMPOSE],
  },
  {
    name: 'OFFICE_OPERATOR_PASSWORD',
    type: 'string',
    required: false,
    default: null,
    description:
      'Пароль оператора: включает auth на /api/office/* и WS. В connected-режиме (OFFICE_CONNECTOR_MODE=trading-lab и/или OFFICE_PLATFORM_ENABLED=true) обязателен — сервер отказывается стартовать без него (fail-closed гейт SEC-O1 в loadConfig); standalone (fixture) без него легален',
    secret: true,
    flag: false,
    owner_unit: 'office-server',
    consumers: [CONFIG, COMPOSE],
  },
  {
    name: 'OFFICE_PLATFORM_ENABLED',
    type: 'bool',
    required: false,
    default: 'false',
    description: 'Мониторинг trading-platform в офисе; действует только в режиме trading-lab и требует TRADING_PLATFORM_READ_URL/TOKEN',
    secret: false,
    flag: false,
    owner_unit: 'office-server',
    consumers: [CONFIG],
  },
  {
    name: 'OFFICE_SCORECARD_BOOTSTRAP_INTERVAL_MS',
    type: 'duration_ms',
    required: false,
    default: '750',
    description: 'Интервал между bootstrap-попытками scorecard-фолловера, мс',
    secret: false,
    flag: false,
    owner_unit: 'office-server',
    consumers: [CONFIG],
  },
  {
    name: 'OFFICE_SCORECARD_BOOTSTRAP_RETRIES',
    type: 'int',
    required: false,
    default: '8',
    description: 'Число bootstrap-попыток scorecard-фолловера',
    secret: false,
    flag: false,
    owner_unit: 'office-server',
    consumers: [CONFIG],
  },
  {
    name: 'OFFICE_SCORECARD_FETCH_INTERVAL_MS',
    type: 'duration_ms',
    required: false,
    default: '500',
    description: 'Интервал между попытками скачать markdown цикл-скоркарда, мс',
    secret: false,
    flag: false,
    owner_unit: 'office-server',
    consumers: [CONFIG],
  },
  {
    name: 'OFFICE_SCORECARD_FETCH_RETRIES',
    type: 'int',
    required: false,
    default: '3',
    description: 'Число попыток скачать markdown цикл-скоркарда',
    secret: false,
    flag: false,
    owner_unit: 'office-server',
    consumers: [CONFIG],
  },
  {
    name: 'OFFICE_SCORECARD_TTL_MS',
    type: 'duration_ms',
    required: false,
    default: '3600000',
    description: 'TTL наблюдения scorecard-фолловера за cycle-run, мс',
    secret: false,
    flag: false,
    owner_unit: 'office-server',
    consumers: [CONFIG],
  },
  {
    name: 'OFFICE_SERVER_PORT',
    type: 'int',
    required: false,
    default: '8787',
    description: 'Порт HTTP/WS office-server',
    secret: false,
    flag: false,
    owner_unit: 'office-server',
    consumers: [CONFIG],
  },
  {
    name: 'OFFICE_STREAM_RECONNECT_BASE_MS',
    type: 'duration_ms',
    required: false,
    default: '1000',
    description: 'Базовая задержка экспоненциального reconnect-бэккофа стрима лаборатории, мс',
    secret: false,
    flag: false,
    owner_unit: 'office-server',
    consumers: [CONFIG],
  },
  {
    name: 'OFFICE_STREAM_RECONNECT_MAX_MS',
    type: 'duration_ms',
    required: false,
    default: '30000',
    description: 'Потолок reconnect-бэккофа стрима лаборатории, мс',
    secret: false,
    flag: false,
    owner_unit: 'office-server',
    consumers: [CONFIG],
  },
  {
    name: 'OPERATOR_COMPLETION_SUMMARY',
    type: 'bool',
    required: false,
    default: 'true',
    description: 'Публиковать completion-summary задач лаборатории в оператор-чат (по умолчанию включено)',
    secret: false,
    flag: false,
    owner_unit: 'office-server',
    consumers: [CONFIG],
  },
  {
    name: 'OPERATOR_CYCLE_SCORECARD',
    type: 'bool',
    required: false,
    default: 'false',
    description: 'Публиковать cycle-скоркард лаборатории в оператор-чат (R5d); действует только в режиме trading-lab',
    secret: false,
    flag: false,
    owner_unit: 'office-server',
    consumers: [CONFIG],
  },
  {
    name: 'OPERATOR_DOWNSTREAM_BACKTESTS',
    type: 'bool',
    required: false,
    default: 'false',
    description: 'Следить за downstream-бэктестами cycle-run и публиковать их summary в оператор-чат; действует только в режиме trading-lab',
    secret: false,
    flag: false,
    owner_unit: 'office-server',
    consumers: [CONFIG],
  },
  {
    name: 'TRADING_LAB_CHAT_TOKEN',
    type: 'string',
    required: false,
    default: null,
    description: 'Сервисный токен чат-API trading-lab (прокси оператор-чата); без него connected-офис работает без чата',
    secret: true,
    flag: false,
    owner_unit: 'office-server',
    consumers: [CONFIG],
  },
  {
    name: 'TRADING_LAB_CHAT_URL',
    type: 'url',
    required: false,
    default: 'http://localhost:3000',
    description: 'Базовый URL чат-API trading-lab',
    secret: false,
    flag: false,
    owner_unit: 'office-server',
    consumers: [CONFIG],
  },
  {
    name: 'TRADING_LAB_READ_TOKEN',
    type: 'string',
    required: false,
    default: null,
    description: 'Сервисный токен read-API trading-lab; в режиме trading-lab обязателен (гейт в loadConfig)',
    secret: true,
    flag: false,
    owner_unit: 'office-server',
    consumers: [CONFIG],
  },
  {
    name: 'TRADING_LAB_READ_URL',
    type: 'url',
    required: false,
    default: 'http://localhost:3100',
    description: 'Базовый URL read-API trading-lab; в режиме trading-lab обязан быть задан явно (гейт в loadConfig)',
    secret: false,
    flag: false,
    owner_unit: 'office-server',
    consumers: [CONFIG],
  },
  {
    name: 'TRADING_LAB_REQUEST_TIMEOUT_MS',
    type: 'duration_ms',
    required: false,
    default: '10000',
    description: 'Таймаут HTTP-запросов офиса к trading-lab, мс',
    secret: false,
    flag: false,
    owner_unit: 'office-server',
    consumers: [CONFIG],
  },
  {
    name: 'TRADING_PLATFORM_READ_TOKEN',
    type: 'string',
    required: false,
    default: null,
    description: 'Сервисный ops-read токен trading-platform; при OFFICE_PLATFORM_ENABLED=true обязателен (гейт в loadConfig)',
    secret: true,
    flag: false,
    owner_unit: 'office-server',
    consumers: [CONFIG],
  },
  {
    name: 'TRADING_PLATFORM_READ_URL',
    type: 'url',
    required: false,
    default: 'http://localhost:8839',
    description: 'Базовый URL ops-read API trading-platform; при включённом мониторинге обязан быть задан явно (гейт в loadConfig)',
    secret: false,
    flag: false,
    owner_unit: 'office-server',
    consumers: [CONFIG],
  },
  {
    name: 'TRADING_PLATFORM_REQUEST_TIMEOUT_MS',
    type: 'duration_ms',
    required: false,
    default: '10000',
    description: 'Таймаут HTTP-запросов офиса к trading-platform, мс',
    secret: false,
    flag: false,
    owner_unit: 'office-server',
    consumers: [CONFIG],
  },
  {
    name: 'ULPC_DIR',
    type: 'string',
    required: false,
    default: null,
    description: 'Каталог Universal-LPC-Spritesheet для build-тула compose-lpc-agents; не задан — используется ~/tmp/ulpc (вычисляется, статического дефолта нет)',
    secret: false,
    flag: false,
    owner_unit: 'office-tools',
    consumers: ['packages/trading-lab-floor/tools/compose-lpc-agents.mjs'],
  },
  {
    name: 'VITE_OFFICE_GATEWAY_URL',
    type: 'url',
    required: false,
    default: 'http://localhost:8787',
    description: 'Build-time (vite): базовый HTTP-URL office-server для connected-веба',
    secret: false,
    flag: false,
    owner_unit: 'office-web',
    consumers: ['apps/web/src/runtime/RuntimeContext.tsx', 'apps/web/src/outside/OutsideScreen.tsx'],
  },
  {
    name: 'VITE_OFFICE_GATEWAY_WS_URL',
    type: 'url',
    required: false,
    default: null,
    description: 'Build-time (vite): WS-URL office-server; не задан — шлюз выводит его из VITE_OFFICE_GATEWAY_URL',
    secret: false,
    flag: false,
    owner_unit: 'office-web',
    consumers: ['apps/web/src/runtime/RuntimeContext.tsx'],
  },
  {
    name: 'VITE_OFFICE_MODE',
    type: 'enum',
    required: false,
    default: 'mock',
    description: 'Build-time (vite): режим веб-офиса — mock (fixtures в браузере) или connected (live-шлюз office-server)',
    secret: false,
    flag: false,
    enum_values: ['mock', 'connected'],
    owner_unit: 'office-web',
    consumers: ['apps/web/src/runtime/RuntimeContext.tsx', 'apps/web/src/outside/OutsideScreen.tsx'],
  },
];

// ---------------------------------------------------------------------------
// zod-схема серверных переменных (семантика типов — по контракту env-schema.1)
// ---------------------------------------------------------------------------

const blankAsUndefined = (v: unknown): unknown => (v === '' ? undefined : v);

const intEnv = z
  .string()
  .regex(/^-?[0-9]+$/, 'ожидается целое число (base-10)')
  .transform((s) => Number.parseInt(s, 10));

const durationMsEnv = z
  .string()
  .regex(/^[0-9]+$/, 'ожидается неотрицательное целое число миллисекунд (суффиксы 5s/1m не поддерживаются)')
  .transform((s) => Number.parseInt(s, 10));

const boolEnv = z
  .enum(['true', 'false'], { errorMap: () => ({ message: 'ожидается строго true или false (без 1/yes/on)' }) })
  .transform((s) => s === 'true');

const urlEnv = z.string().refine((s) => {
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
}, 'ожидается абсолютный URL со схемой');

function optionalVar<T extends z.ZodTypeAny>(schema: T): z.ZodEffects<z.ZodOptional<T>, z.output<T> | undefined, unknown> {
  return z.preprocess(blankAsUndefined, schema.optional());
}

function withDefault<T extends z.ZodTypeAny>(schema: T, def: z.output<T>) {
  return optionalVar(schema).transform((v) => (v === undefined ? def : v));
}

/** Серверные переменные (owner_unit office-server): парсятся при старте. */
export const officeEnvSchema = z.object({
  OFFICE_AUTH_SECRET: optionalVar(z.string()),
  OFFICE_AUTH_TTL_MS: withDefault(durationMsEnv, 43_200_000),
  OFFICE_BACKTEST_SUMMARY_INTERVAL_MS: withDefault(durationMsEnv, 500),
  OFFICE_BACKTEST_SUMMARY_RETRIES: withDefault(intEnv, 5),
  OFFICE_BACKTEST_WATCH_IDLE_MS: withDefault(durationMsEnv, 120_000),
  OFFICE_BACKTEST_WATCH_MAX_MS: withDefault(durationMsEnv, 900_000),
  OFFICE_CHAT_BOOTSTRAP_INTERVAL_MS: withDefault(durationMsEnv, 750),
  OFFICE_CHAT_BOOTSTRAP_RETRIES: withDefault(intEnv, 8),
  OFFICE_CHAT_FOLLOW_IDLE_MS: withDefault(durationMsEnv, 45_000),
  OFFICE_CHAT_FOLLOW_MAX_DELTAS: withDefault(intEnv, 200),
  OFFICE_CHAT_FOLLOW_MAX_MS: withDefault(durationMsEnv, 300_000),
  OFFICE_CONNECTOR_MODE: withDefault(z.enum(['fixture', 'trading-lab']), 'fixture'),
  OFFICE_CORS_ORIGIN: withDefault(z.string(), 'http://localhost:5174'),
  OFFICE_EVENT_TICK_MS: withDefault(durationMsEnv, 2600),
  OFFICE_FIXTURE_LATENCY_MS: withDefault(durationMsEnv, 0),
  OFFICE_HEARTBEAT_MS: withDefault(durationMsEnv, 15_000),
  OFFICE_OPERATOR_PASSWORD: optionalVar(z.string()),
  OFFICE_PLATFORM_ENABLED: withDefault(boolEnv, false),
  OFFICE_SCORECARD_BOOTSTRAP_INTERVAL_MS: withDefault(durationMsEnv, 750),
  OFFICE_SCORECARD_BOOTSTRAP_RETRIES: withDefault(intEnv, 8),
  OFFICE_SCORECARD_FETCH_INTERVAL_MS: withDefault(durationMsEnv, 500),
  OFFICE_SCORECARD_FETCH_RETRIES: withDefault(intEnv, 3),
  OFFICE_SCORECARD_TTL_MS: withDefault(durationMsEnv, 3_600_000),
  OFFICE_SERVER_PORT: withDefault(intEnv, 8787),
  OFFICE_STREAM_RECONNECT_BASE_MS: withDefault(durationMsEnv, 1000),
  OFFICE_STREAM_RECONNECT_MAX_MS: withDefault(durationMsEnv, 30_000),
  OPERATOR_COMPLETION_SUMMARY: withDefault(boolEnv, true),
  OPERATOR_CYCLE_SCORECARD: withDefault(boolEnv, false),
  OPERATOR_DOWNSTREAM_BACKTESTS: withDefault(boolEnv, false),
  TRADING_LAB_CHAT_TOKEN: optionalVar(z.string()),
  TRADING_LAB_CHAT_URL: withDefault(urlEnv, 'http://localhost:3000'),
  TRADING_LAB_READ_TOKEN: optionalVar(z.string()),
  TRADING_LAB_READ_URL: withDefault(urlEnv, 'http://localhost:3100'),
  TRADING_LAB_REQUEST_TIMEOUT_MS: withDefault(durationMsEnv, 10_000),
  TRADING_PLATFORM_READ_TOKEN: optionalVar(z.string()),
  TRADING_PLATFORM_READ_URL: withDefault(urlEnv, 'http://localhost:8839'),
  TRADING_PLATFORM_REQUEST_TIMEOUT_MS: withDefault(durationMsEnv, 10_000),
});

export type OfficeEnv = z.infer<typeof officeEnvSchema>;

/** Имена серверных переменных, покрытых zod-схемой (для тестов согласованности). */
export const OFFICE_ENV_KEYS: readonly string[] = Object.keys(officeEnvSchema.shape);

/**
 * Fail-fast парсинг окружения: при ошибке бросает Error, перечисляющий ВСЕ
 * невалидные переменные (safeParse, не первая ошибка). Вызывается на старте
 * сервера (loadConfig) — невалидный env означает отказ стартовать.
 */
export function parseOfficeEnv(raw: NodeJS.ProcessEnv): OfficeEnv {
  const result = officeEnvSchema.safeParse(raw);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ${String(i.path[0] ?? '?')}: ${i.message}`);
    throw new Error(`невалидные переменные окружения (${lines.length}):\n${lines.join('\n')}`);
  }
  return result.data;
}

/**
 * Единственное чтение process.env в репо (гейт «Полнота схемы» пинится
 * тестом envCompleteness.test.ts). Всё остальное получает env отсюда.
 */
export function ambientEnv(): NodeJS.ProcessEnv {
  return process.env;
}

export function loadOfficeEnv(): OfficeEnv {
  return parseOfficeEnv(ambientEnv());
}

// ---------------------------------------------------------------------------
// Экспорт документа env-schema.1 (`npm run env:schema`)
// ---------------------------------------------------------------------------

export interface EnvSchemaVariable {
  name: string;
  type: EnvVarType;
  required: boolean;
  default: string | null;
  description: string;
  secret: boolean;
  flag: boolean;
  enum_values?: string[];
  owner_unit: string;
  consumers: string[];
}

export interface EnvSchemaDocument {
  schema_version: 'env-schema.1';
  repo: string;
  generated_from: string;
  variables: EnvSchemaVariable[];
}

/** Детерминированный документ env-schema.1: без timestamp, variables по name. */
export function envSchemaDocument(): EnvSchemaDocument {
  const variables = [...ENV_SPECS]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((s): EnvSchemaVariable => ({
      name: s.name,
      type: s.type,
      required: s.required,
      default: s.default,
      description: s.description,
      secret: s.secret,
      flag: s.flag,
      ...(s.enum_values ? { enum_values: [...s.enum_values] } : {}),
      owner_unit: s.owner_unit,
      consumers: [...s.consumers],
    }));
  return {
    schema_version: 'env-schema.1',
    repo: 'trading-office',
    generated_from: 'apps/server/src/env.ts',
    variables,
  };
}

/** JSON-рендер документа: 2 пробела, завершающий перевод строки (контракт). */
export function renderEnvSchemaJson(): string {
  return `${JSON.stringify(envSchemaDocument(), null, 2)}\n`;
}
