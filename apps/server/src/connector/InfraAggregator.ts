import type { InfraStatus, InfraSource, InfraSourceState } from '@trading-office/office-gateway';
import type { TradingLabHttpClient } from './tradinglab/TradingLabHttpClient';
import type { PlatformInfra } from './platform/PlatformMonitoringConnector';

type ReadyzClient = Pick<TradingLabHttpClient, 'getReadyz'>;
type StreamState = Extract<InfraSourceState, 'live' | 'degraded' | 'error'>;

export class InfraAggregator {
  constructor(
    private readonly client: ReadyzClient,
    private readonly streamState: () => StreamState,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly platformInfra?: () => Promise<PlatformInfra>,
  ) {}

  async getInfraStatus(): Promise<InfraStatus> {
    const services: InfraStatus['services'] = [{ name: 'office-server', up: true, detail: 'ok' }];
    let readApi: InfraSourceState = 'live';
    let readDetail = 'reachable';
    try {
      const ready = await this.client.getReadyz();
      const up = ready.status === 'ok';
      services.push({ name: 'trading-lab-read-api', up, detail: ready.status });
      readApi = up ? 'live' : 'degraded';
      readDetail = `readyz: ${ready.status}`;
    } catch {
      services.push({ name: 'trading-lab-read-api', up: false, detail: 'unreachable' });
      readApi = 'error';
      readDetail = 'unreachable';
    }
    const stream = this.streamState();
    const sources: InfraSource[] = [
      { domain: 'office-server', state: 'live', detail: 'office server' },
      { domain: 'trading-lab-read-api', state: readApi, detail: readDetail },
      { domain: 'trading-lab-stream', state: stream, detail: `stream ${stream}` },
    ];
    sources.push({ domain: 'knowledge', state: 'gap', detail: 'Knowledge source is not connected yet' });
    if (this.platformInfra) {
      const p = await this.platformInfra().catch((): PlatformInfra => ({ services: [], sources: [{ domain: 'bot-health', state: 'error', detail: 'platform infra unavailable' }] }));
      services.push(...p.services);
      sources.push(...p.sources);
    } else {
      sources.push({ domain: 'bot-health', state: 'gap', detail: 'Bot runtime monitoring is not connected yet' });
    }
    return { services, queues: [], lastSync: this.now(), sources };
  }
}
