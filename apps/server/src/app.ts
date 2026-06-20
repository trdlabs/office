import { createNodeWebSocket } from '@hono/node-ws';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { OFFICE_API, operatorMessageSchema, operatorConfirmSchema } from '@trading-office/office-gateway';
import type { OfficeEvent } from '@trading-office/office-gateway';
import type { OfficeServerConfig } from './config';
import { loadConfig } from './config';
import type { OfficeReadConnector } from './connector/OfficeReadConnector';
import { FixtureOfficeReadConnector } from './connector/FixtureOfficeReadConnector';
import { OfficeEventBus } from './events/OfficeEventBus';
import { handleOperatorMessage } from './operator/responder';
import type { OperatorResponder, OperatorConfirmResponder } from './operator/TradingLabOperatorResponder';

const nowIso = (): string => new Date().toISOString();

export interface OfficeAppDeps {
  connector: OfficeReadConnector;
  bus: OfficeEventBus;
  config: OfficeServerConfig;
  operatorResponder?: OperatorResponder;
  operatorConfirmResponder?: OperatorConfirmResponder;
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

  app.post(OFFICE_API.operatorConfirm, async (c) => {
    const parsed = operatorConfirmSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: { code: 'bad_request', message: 'invalid operator confirm' } }, 400);
    }
    // Deliberate asymmetry vs the messages route: confirm has no fixture fallback
    // (a confirm is meaningless without a real chat connector), so an unconfigured
    // responder honestly returns 503 rather than degrading to a stub.
    if (!deps.operatorConfirmResponder) {
      return c.json({ error: { code: 'not_configured', message: 'operator confirm not configured' } }, 503);
    }
    return c.json(deps.operatorConfirmResponder(parsed.data, deps.bus));
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

  // Aggregate endpoints already degrade to an empty projection inside the
  // connector; this is the safety net for the strict detail/proxy endpoint
  // (agent activity) and any other uncaught upstream read error — it must be a
  // TYPED status, never a generic 500. Body is safe + static: no token, URL, or
  // stack trace, just the stable reason code.
  app.onError((err, c) => {
    const office = (err as { office?: { code?: string; reason?: string } }).office;
    if (!office) return c.json({ error: { code: 'internal_error', message: 'internal error' } }, 500);
    const reason = office.reason ?? office.code ?? 'upstream_error';
    const authFailed = reason === 'auth_failed' || office.code === 'upstream_unauthorized';
    return c.json({ error: { code: reason, message: 'upstream read unavailable' } }, authFailed ? 401 : 502);
  });

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
