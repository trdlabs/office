import type { OfficeServerConfig } from '../../config';
import { PlatformHttpClient } from './PlatformHttpClient';
import { PlatformMonitoringConnector } from './PlatformMonitoringConnector';

export interface PlatformWiringDeps { fetchImpl?: typeof fetch; nowMs?: () => number; }
export interface PlatformWiring { connector: PlatformMonitoringConnector; client: PlatformHttpClient; }

export function createPlatformWiring(config: OfficeServerConfig, deps: PlatformWiringDeps = {}): PlatformWiring {
  const client = new PlatformHttpClient({
    readUrl: config.platform.readUrl,
    readToken: config.platform.readToken,
    requestTimeoutMs: config.platform.requestTimeoutMs,
    fetchImpl: deps.fetchImpl,
  });
  const connector = new PlatformMonitoringConnector(client, deps.nowMs);
  return { connector, client };
}
