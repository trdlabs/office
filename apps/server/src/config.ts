export interface OfficeServerConfig {
  port: number;
  corsOrigin: string;
  eventTickMs: number;
  heartbeatMs: number;
  fixtureLatencyMs: number;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): OfficeServerConfig {
  return {
    port: Number(env.OFFICE_SERVER_PORT ?? 8787),
    corsOrigin: env.OFFICE_CORS_ORIGIN ?? 'http://localhost:5174',
    eventTickMs: Number(env.OFFICE_EVENT_TICK_MS ?? 2600),
    heartbeatMs: Number(env.OFFICE_HEARTBEAT_MS ?? 15000),
    fixtureLatencyMs: Number(env.OFFICE_FIXTURE_LATENCY_MS ?? 0),
  };
}
