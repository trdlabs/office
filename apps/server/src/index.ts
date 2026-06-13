import { serve } from '@hono/node-server';
import type { OfficeEvent } from '@trading-office/office-gateway';
import { createOfficeApp } from './app';
import { loadConfig } from './config';
import { FixtureOfficeReadConnector } from './connector/FixtureOfficeReadConnector';
import { OfficeEventBus } from './events/OfficeEventBus';

const nowIso = (): string => new Date().toISOString();

const config = loadConfig();
const bus = new OfficeEventBus();
const connector = new FixtureOfficeReadConnector(config);
const stopProducer = connector.start((e) => bus.publish(e));
const heartbeat = setInterval(() => {
  const e: OfficeEvent = { type: 'heartbeat', ts: nowIso() };
  bus.publish(e);
}, config.heartbeatMs);

const { app, injectWebSocket } = createOfficeApp({ connector, bus, config });
const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`office server listening on :${info.port}`);
});
injectWebSocket(server);

const shutdown = (): void => {
  clearInterval(heartbeat);
  stopProducer();
  server.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
