import { serve } from '@hono/node-server';
import type { OfficeEvent } from '@trading-office/office-gateway';
import { createOfficeApp } from './app';
import { loadConfig } from './config';
import { createTradingLabWiring } from './connector/createTradingLabWiring';
import { FixtureOfficeReadConnector } from './connector/FixtureOfficeReadConnector';
import { OfficeEventBus } from './events/OfficeEventBus';
import { TradingLabChatConnector } from './operator/TradingLabChatConnector';
import { makeTradingLabOperatorResponder, makeTradingLabOperatorConfirmResponder, makeChatUnavailableResponder, defaultNewIds } from './operator/TradingLabOperatorResponder';
import type { OperatorResponder, OperatorConfirmResponder } from './operator/TradingLabOperatorResponder';
import { createDownstreamBacktestWatcher } from './operator/DownstreamBacktestWatcher';
import type { DownstreamBacktestWatcher } from './operator/DownstreamBacktestWatcher';
import { renderCompletionSummary } from './operator/completionSummaryRender';

const nowIso = (): string => new Date().toISOString();

const config = loadConfig();
const bus = new OfficeEventBus();
const wiring = config.connectorMode === 'trading-lab' ? createTradingLabWiring(config) : null;
const connector = wiring ? wiring.connector : new FixtureOfficeReadConnector(config);
const stopConnector = connector.start((e) => bus.publish(e));
const heartbeat = setInterval(() => {
  const e: OfficeEvent = { type: 'heartbeat', ts: nowIso() };
  bus.publish(e);
}, config.heartbeatMs);

let operatorResponder: OperatorResponder | undefined;
let operatorConfirmResponder: OperatorConfirmResponder | undefined;
let backtestWatcher: DownstreamBacktestWatcher | undefined;
if (wiring) {
  if (config.tradingLab.chatToken) {
    const chat = new TradingLabChatConnector({
      chatUrl: config.tradingLab.chatUrl,
      chatToken: config.tradingLab.chatToken,
      requestTimeoutMs: config.tradingLab.requestTimeoutMs,
    });
    backtestWatcher = config.downstreamBacktests.enabled
      ? createDownstreamBacktestWatcher({
          bridge: wiring.bridge,
          client: {
            getAgentEvents: (q) => wiring!.client.getAgentEvents(q).then((env) => env.data),
            getCompletionSummary: (taskId) => wiring!.client.getCompletionSummary(taskId),
          },
          bus,
          newIds: () => { const { operatorMessageId, replyMessageId } = defaultNewIds()(); return { operatorMessageId, replyMessageId }; },
          render: renderCompletionSummary,
          guards: config.downstreamBacktests,
        })
      : undefined;
    const responderDeps = {
      chat, client: wiring.client, bridge: wiring.bridge, guards: config.chatFollow,
      completionSummaryEnabled: config.chatFollow.completionSummaryEnabled,
      onRunCycleTask: backtestWatcher ? (taskId: string, cid: string) => backtestWatcher!.register(taskId, cid) : undefined,
    };
    operatorResponder = makeTradingLabOperatorResponder(responderDeps);
    operatorConfirmResponder = makeTradingLabOperatorConfirmResponder(responderDeps);
  } else {
    operatorResponder = makeChatUnavailableResponder();
  }
}

const { app, injectWebSocket } = createOfficeApp({ connector, bus, config, operatorResponder, operatorConfirmResponder });
const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`office server listening on :${info.port}`);
});
injectWebSocket(server);

const shutdown = (): void => {
  clearInterval(heartbeat);
  stopConnector();
  backtestWatcher?.stop();
  server.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
