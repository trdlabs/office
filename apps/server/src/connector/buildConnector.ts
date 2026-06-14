import type { OfficeServerConfig } from '../config';
import type { OfficeReadConnector } from './OfficeReadConnector';
import { FixtureOfficeReadConnector } from './FixtureOfficeReadConnector';
import { CompositeOfficeReadConnector } from './CompositeOfficeReadConnector';
import { TradingLabHttpClient } from './tradinglab/TradingLabHttpClient';
import { TradingLabReadConnector } from './tradinglab/TradingLabReadConnector';
import { InfraAggregator } from './InfraAggregator';

export interface BuildConnectorDeps {
  fetchImpl?: typeof fetch;
}

export function buildConnector(config: OfficeServerConfig, deps: BuildConnectorDeps = {}): OfficeReadConnector {
  if (config.connectorMode === 'fixture') {
    return new FixtureOfficeReadConnector(config);
  }
  const client = new TradingLabHttpClient({
    readUrl: config.tradingLab.readUrl,
    readToken: config.tradingLab.readToken,
    requestTimeoutMs: config.tradingLab.requestTimeoutMs,
    fetchImpl: deps.fetchImpl,
  });
  const read = new TradingLabReadConnector(client);
  // M2 replaces the static 'live' + no-op startBridge with the real TradingLabStreamBridge.
  const infra = new InfraAggregator(client, () => 'live');
  return new CompositeOfficeReadConnector({ read, infra, startBridge: () => () => {} });
}
