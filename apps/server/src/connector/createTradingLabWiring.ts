import type { OfficeServerConfig } from '../config';
import type { OfficeReadConnector } from './OfficeReadConnector';
import type { SseConnect } from './tradinglab/TradingLabStreamBridge';
import type { PlatformMonitoringConnector } from './platform/PlatformMonitoringConnector';
import { TradingLabHttpClient } from './tradinglab/TradingLabHttpClient';
import { TradingLabReadConnector } from './tradinglab/TradingLabReadConnector';
import { TradingLabStreamBridge } from './tradinglab/TradingLabStreamBridge';
import { InfraAggregator } from './InfraAggregator';
import { CompositeOfficeReadConnector } from './CompositeOfficeReadConnector';
import { createPlatformWiring } from './platform/createPlatformWiring';

export interface TradingLabWiringDeps {
  fetchImpl?: typeof fetch;
  connect?: SseConnect;
  now?: () => string;
  sleep?: (ms: number) => Promise<void>;
  platform?: PlatformMonitoringConnector;
}

export interface TradingLabWiring {
  connector: OfficeReadConnector;
  bridge: TradingLabStreamBridge;
  client: TradingLabHttpClient;
}

export function createTradingLabWiring(config: OfficeServerConfig, deps: TradingLabWiringDeps = {}): TradingLabWiring {
  const client = new TradingLabHttpClient({
    readUrl: config.tradingLab.readUrl,
    readToken: config.tradingLab.readToken,
    requestTimeoutMs: config.tradingLab.requestTimeoutMs,
    fetchImpl: deps.fetchImpl,
  });
  const read = new TradingLabReadConnector(client, deps.now);
  const bridge = new TradingLabStreamBridge({
    url: config.tradingLab.readUrl,
    readToken: config.tradingLab.readToken,
    reconnectBaseMs: config.stream.reconnectBaseMs,
    reconnectMaxMs: config.stream.reconnectMaxMs,
    onSnapshot: () => read.getAgentStatuses(),
    connect: deps.connect,
    now: deps.now,
    sleep: deps.sleep,
  });
  const platform = deps.platform ?? (config.platform.enabled ? createPlatformWiring(config, { fetchImpl: deps.fetchImpl }).connector : undefined);
  const infra = new InfraAggregator(client, () => bridge.state(), deps.now, platform ? () => platform.getPlatformInfra() : undefined);
  const connector = new CompositeOfficeReadConnector({ read, infra, startBridge: (emit) => bridge.start(emit), platform });
  return { connector, bridge, client };
}
