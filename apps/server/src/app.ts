import { createNodeWebSocket } from '@hono/node-ws';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { OFFICE_API, operatorMessageSchema } from '@trading-office/office-gateway';
import type { OfficeEvent } from '@trading-office/office-gateway';
import type { OfficeServerConfig } from './config';
import { loadConfig } from './config';
import type { OfficeReadConnector } from './connector/OfficeReadConnector';
import { FixtureOfficeReadConnector } from './connector/FixtureOfficeReadConnector';
import { OfficeEventBus } from './events/OfficeEventBus';
import { handleOperatorMessage } from './operator/responder';
import type { OperatorResponder } from './operator/TradingLabOperatorResponder';

const nowIso = (): string => new Date().toISOString();

export interface OfficeAppDeps {
  connector: OfficeReadConnector;
  bus: OfficeEventBus;
  config: OfficeServerConfig;
  operatorResponder?: OperatorResponder;
}

export function createOfficeApp(deps: OfficeAppDeps) {
  const app = new Hono();
  const { upgradeWebSocket, injectWebSocket } = createNodeWebSocket({ app });

  app.use('*', cors({ origin: deps.config.corsOrigin }));

  app.get(OFFICE_API.agentStatuses, async (c) => c.json(await deps.connector.getAgentStatuses()));
  app.get(OFFICE_API.agentActivityPattern, async (c) =>
    c.json(await deps.connector.getAgentActivity(c.req.param('agentId'))),
  );
  app.get(OFFICE_API.hypotheses, async (c) => c.json(await deps.connector.getHypotheses()));
  app.get(OFFICE_API.backtests, async (c) => c.json(await deps.connector.getBacktests()));
  app.get(OFFICE_API.bots, async (c) => c.json(await deps.connector.getBotHealth()));
  app.get(OFFICE_API.knowledge, async (c) => c.json(await deps.connector.getKnowledge()));
  app.get(OFFICE_API.infra, async (c) => c.json(await deps.connector.getInfraStatus()));

  app.post(OFFICE_API.operatorMessages, async (c) => {
    const parsed = operatorMessageSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: { code: 'bad_request', message: 'invalid operator message' } }, 400);
    }
    const respond: OperatorResponder = deps.operatorResponder ?? ((m, b) => handleOperatorMessage(m, b));
    return c.json(respond(parsed.data, deps.bus));
  });

  app.get(
    OFFICE_API.events,
    upgradeWebSocket(() => {
      let off: (() => void) | null = null;
      return {
        async onOpen(_evt, ws) {
          const snapshot: OfficeEvent = {
            type: 'agent_statuses_snapshot',
            ts: nowIso(),
            statuses: await deps.connector.getAgentStatuses(),
          };
          ws.send(JSON.stringify(snapshot));
          off = deps.bus.subscribe((e) => ws.send(JSON.stringify(e)));
        },
        onClose() {
          off?.();
          off = null;
        },
      };
    }),
  );

  return { app, injectWebSocket };
}

/**
 * Test/demo convenience: a fully fixture-wired app (config + bus + connector).
 * NOTE: HTTP-snapshot only — it does NOT start the live producer/heartbeat, so
 * its WS emits just the initial snapshot. The runnable `index.ts` starts those.
 */
export function createFixtureOfficeApp(env: Record<string, string | undefined> = {}) {
  const config = loadConfig(env);
  const bus = new OfficeEventBus();
  const connector = new FixtureOfficeReadConnector(config);
  const built = createOfficeApp({ connector, bus, config });
  return { ...built, bus, connector, config };
}
