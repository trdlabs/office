import { describe, it, expect } from 'vitest';
import {
  ENV_SPECS,
  OFFICE_ENV_KEYS,
  parseOfficeEnv,
  envSchemaDocument,
  renderEnvSchemaJson,
} from './env';

// env-схема office — контракт env-schema.1 (control-center,
// docs/architecture/contracts/env-schema.md). Эти тесты пинят:
//  1) fail-fast парсинг process.env (все ошибки разом, не первая);
//  2) семантику типов контракта (int/bool/enum/url/duration_ms);
//  3) валидность и детерминизм экспорта envSchemaDocument().

describe('parseOfficeEnv — дефолты и типы', () => {
  it('пустое окружение даёт полный набор дефолтов', () => {
    const e = parseOfficeEnv({});
    expect(e.OFFICE_SERVER_PORT).toBe(8787);
    expect(e.OFFICE_CORS_ORIGIN).toBe('http://localhost:5174');
    expect(e.OFFICE_CONNECTOR_MODE).toBe('fixture');
    expect(e.OFFICE_EVENT_TICK_MS).toBe(2600);
    expect(e.OFFICE_HEARTBEAT_MS).toBe(15000);
    expect(e.OFFICE_FIXTURE_LATENCY_MS).toBe(0);
    expect(e.TRADING_LAB_READ_URL).toBe('http://localhost:3100');
    expect(e.TRADING_LAB_CHAT_URL).toBe('http://localhost:3000');
    expect(e.TRADING_LAB_REQUEST_TIMEOUT_MS).toBe(10000);
    expect(e.TRADING_PLATFORM_READ_URL).toBe('http://localhost:8839');
    expect(e.TRADING_PLATFORM_REQUEST_TIMEOUT_MS).toBe(10000);
    expect(e.OFFICE_PLATFORM_ENABLED).toBe(false);
    expect(e.OPERATOR_COMPLETION_SUMMARY).toBe(true);
    expect(e.OPERATOR_DOWNSTREAM_BACKTESTS).toBe(false);
    expect(e.OPERATOR_CYCLE_SCORECARD).toBe(false);
    expect(e.OFFICE_AUTH_TTL_MS).toBe(43_200_000);
    // секреты без значения — undefined (никаких тихих дефолтов)
    expect(e.OFFICE_OPERATOR_PASSWORD).toBeUndefined();
    expect(e.OFFICE_AUTH_SECRET).toBeUndefined();
    expect(e.TRADING_LAB_READ_TOKEN).toBeUndefined();
    expect(e.TRADING_LAB_CHAT_TOKEN).toBeUndefined();
    expect(e.TRADING_PLATFORM_READ_TOKEN).toBeUndefined();
  });

  it('пустая строка трактуется как «не задано» (совместимость с прежним loadConfig)', () => {
    const e = parseOfficeEnv({ OFFICE_SERVER_PORT: '', OFFICE_CORS_ORIGIN: '' });
    expect(e.OFFICE_SERVER_PORT).toBe(8787);
    expect(e.OFFICE_CORS_ORIGIN).toBe('http://localhost:5174');
  });

  it('int: парсит целое, отклоняет не-целое', () => {
    expect(parseOfficeEnv({ OFFICE_SERVER_PORT: '9000' }).OFFICE_SERVER_PORT).toBe(9000);
    expect(() => parseOfficeEnv({ OFFICE_SERVER_PORT: '90.5' })).toThrow(/OFFICE_SERVER_PORT/);
    expect(() => parseOfficeEnv({ OFFICE_SERVER_PORT: 'abc' })).toThrow(/OFFICE_SERVER_PORT/);
  });

  it('bool: строго true|false — без 1/yes/on', () => {
    expect(parseOfficeEnv({ OFFICE_PLATFORM_ENABLED: 'true' }).OFFICE_PLATFORM_ENABLED).toBe(true);
    expect(parseOfficeEnv({ OFFICE_PLATFORM_ENABLED: 'false' }).OFFICE_PLATFORM_ENABLED).toBe(false);
    expect(() => parseOfficeEnv({ OFFICE_PLATFORM_ENABLED: '1' })).toThrow(/OFFICE_PLATFORM_ENABLED/);
    expect(() => parseOfficeEnv({ OPERATOR_COMPLETION_SUMMARY: 'yes' })).toThrow(/OPERATOR_COMPLETION_SUMMARY/);
  });

  it('enum: OFFICE_CONNECTOR_MODE принимает только fixture|trading-lab', () => {
    expect(parseOfficeEnv({ OFFICE_CONNECTOR_MODE: 'trading-lab' }).OFFICE_CONNECTOR_MODE).toBe('trading-lab');
    expect(() => parseOfficeEnv({ OFFICE_CONNECTOR_MODE: 'garbage' })).toThrow(/OFFICE_CONNECTOR_MODE/);
  });

  it('url: абсолютный URL со схемой, мусор отклоняется', () => {
    expect(parseOfficeEnv({ TRADING_LAB_READ_URL: 'http://lab:3100' }).TRADING_LAB_READ_URL).toBe('http://lab:3100');
    expect(() => parseOfficeEnv({ TRADING_LAB_READ_URL: 'not a url' })).toThrow(/TRADING_LAB_READ_URL/);
  });

  it('duration_ms: неотрицательное целое, суффиксы 5s/1m не поддерживаются', () => {
    expect(parseOfficeEnv({ OFFICE_HEARTBEAT_MS: '30000' }).OFFICE_HEARTBEAT_MS).toBe(30000);
    expect(() => parseOfficeEnv({ OFFICE_HEARTBEAT_MS: '-1' })).toThrow(/OFFICE_HEARTBEAT_MS/);
    expect(() => parseOfficeEnv({ OFFICE_HEARTBEAT_MS: '5s' })).toThrow(/OFFICE_HEARTBEAT_MS/);
  });

  it('fail-fast агрегирует ВСЕ ошибки разом (safeParse, не первая)', () => {
    let message = '';
    try {
      parseOfficeEnv({ OFFICE_SERVER_PORT: 'abc', OFFICE_PLATFORM_ENABLED: 'yes', OFFICE_HEARTBEAT_MS: '-5' });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/OFFICE_SERVER_PORT/);
    expect(message).toMatch(/OFFICE_PLATFORM_ENABLED/);
    expect(message).toMatch(/OFFICE_HEARTBEAT_MS/);
  });
});

describe('envSchemaDocument — экспорт env-schema.1', () => {
  const doc = envSchemaDocument();

  it('верхний уровень соответствует контракту', () => {
    expect(doc.schema_version).toBe('env-schema.1');
    expect(doc.repo).toBe('trading-office');
    expect(doc.generated_from).toBe('apps/server/src/env.ts');
    expect(Array.isArray(doc.variables)).toBe(true);
    expect(doc.variables.length).toBeGreaterThan(30);
  });

  it('variables отсортированы по name и уникальны', () => {
    const names = doc.variables.map((v) => v.name);
    expect([...names].sort()).toEqual(names);
    expect(new Set(names).size).toBe(names.length);
  });

  it('каждая переменная несёт полный набор обязательных полей контракта', () => {
    for (const v of doc.variables) {
      expect(v.name).toMatch(/^[A-Z][A-Z0-9_]*$/);
      expect(['string', 'int', 'float', 'bool', 'enum', 'url', 'duration_ms', 'csv']).toContain(v.type);
      expect(typeof v.required).toBe('boolean');
      expect(v.default === null || typeof v.default === 'string').toBe(true);
      expect(typeof v.description).toBe('string');
      expect(v.description.length).toBeGreaterThan(0);
      expect(typeof v.secret).toBe('boolean');
      expect(typeof v.flag).toBe('boolean');
      expect(typeof v.owner_unit).toBe('string');
      expect(v.owner_unit.length).toBeGreaterThan(0);
      expect(Array.isArray(v.consumers)).toBe(true);
      // enum_values — ровно для type=enum
      if (v.type === 'enum') expect(v.enum_values && v.enum_values.length).toBeTruthy();
      else expect(v.enum_values).toBeUndefined();
    }
  });

  it('secret ⇒ default null; required ⇒ default null', () => {
    for (const v of doc.variables) {
      if (v.secret) expect(v.default).toBeNull();
      if (v.required) expect(v.default).toBeNull();
    }
  });

  it('OFFICE_OPERATOR_PASSWORD: secret, required=false — standalone (fixture) без него легален; connected-гейт живёт в loadConfig (#32), схема описывает форму', () => {
    const v = doc.variables.find((x) => x.name === 'OFFICE_OPERATOR_PASSWORD');
    expect(v).toBeDefined();
    expect(v!.secret).toBe(true);
    expect(v!.required).toBe(false);
    expect(v!.default).toBeNull();
    // описание фиксирует connected-правило, не ослабляя авторитетный гейт
    expect(v!.description).toMatch(/connected|trading-lab/i);
  });

  it('все токены — secret', () => {
    for (const name of [
      'TRADING_LAB_READ_TOKEN',
      'TRADING_LAB_CHAT_TOKEN',
      'TRADING_PLATFORM_READ_TOKEN',
      'OFFICE_AUTH_SECRET',
    ]) {
      const v = doc.variables.find((x) => x.name === name);
      expect(v, name).toBeDefined();
      expect(v!.secret, name).toBe(true);
      expect(v!.default, name).toBeNull();
    }
  });

  it('VITE_* объявлены (build-time, читаются vite/import.meta.env, не сервером)', () => {
    const mode = doc.variables.find((x) => x.name === 'VITE_OFFICE_MODE');
    expect(mode).toBeDefined();
    expect(mode!.type).toBe('enum');
    expect(mode!.enum_values).toEqual(['mock', 'connected']);
    expect(mode!.default).toBe('mock');
    expect(doc.variables.some((x) => x.name === 'VITE_OFFICE_GATEWAY_URL')).toBe(true);
    expect(doc.variables.some((x) => x.name === 'VITE_OFFICE_GATEWAY_WS_URL')).toBe(true);
  });

  it('флагов E4b-паттерна в офисе нет: все переменные flag=false и без flag_states', () => {
    for (const v of doc.variables) {
      expect(v.flag, v.name).toBe(false);
      expect((v as unknown as Record<string, unknown>).flag_states).toBeUndefined();
      expect((v as unknown as Record<string, unknown>).default_state).toBeUndefined();
    }
  });

  it('экспорт детерминирован: два вызова байт-в-байт равны, без timestamp-полей', () => {
    expect(renderEnvSchemaJson()).toBe(renderEnvSchemaJson());
    expect(Object.keys(doc)).toEqual(['schema_version', 'repo', 'generated_from', 'variables']);
    expect(renderEnvSchemaJson().endsWith('\n')).toBe(true);
    // JSON парсится обратно в тот же документ
    expect(JSON.parse(renderEnvSchemaJson())).toEqual(doc);
  });

  it('реестр и zod-схема согласованы: office-server-переменные ⇔ ключи схемы', () => {
    const serverSpecs = ENV_SPECS.filter((s) => s.owner_unit === 'office-server').map((s) => s.name);
    expect([...OFFICE_ENV_KEYS].sort()).toEqual([...serverSpecs].sort());
    // каждая серверная переменная реально парсится: подставляем валидное значение по типу
    const sample = (name: string): string => {
      const spec = ENV_SPECS.find((s) => s.name === name)!;
      switch (spec.type) {
        case 'int': return '7';
        case 'duration_ms': return '7';
        case 'bool': return 'true';
        case 'enum': return spec.enum_values![0]!;
        case 'url': return 'http://localhost:1';
        default: return 'x';
      }
    };
    const probe = Object.fromEntries(serverSpecs.map((n) => [n, sample(n)]));
    const parsed = parseOfficeEnv(probe) as Record<string, unknown>;
    for (const name of serverSpecs) {
      expect(parsed[name], name).not.toBeUndefined();
    }
  });
});
