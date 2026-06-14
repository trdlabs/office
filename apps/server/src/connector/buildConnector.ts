import type { OfficeServerConfig } from '../config';
import type { OfficeReadConnector } from './OfficeReadConnector';
import { FixtureOfficeReadConnector } from './FixtureOfficeReadConnector';
import { createTradingLabWiring, type TradingLabWiringDeps } from './createTradingLabWiring';

export function buildConnector(config: OfficeServerConfig, deps: TradingLabWiringDeps = {}): OfficeReadConnector {
  if (config.connectorMode === 'fixture') return new FixtureOfficeReadConnector(config);
  return createTradingLabWiring(config, deps).connector;
}
