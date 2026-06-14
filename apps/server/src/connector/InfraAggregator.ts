import type { InfraStatus, InfraSource, InfraSourceState } from '@trading-office/office-gateway';
import type { TradingLabHttpClient } from './tradinglab/TradingLabHttpClient';

type ReadyzClient = Pick<TradingLabHttpClient, 'getReadyz'>;
type StreamState = Extract<InfraSourceState, 'live' | 'degraded' | 'error'>;

export class InfraAggregator {
  constructor(
    private readonly client: ReadyzClient,
    private readonly streamState: () => StreamState,
    private readonly now: () => string = () => new Date().toISOString(),
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
      { domain: 'knowledge', state: 'gap', detail: 'Knowledge source is not connected yet' },
      { domain: 'bot-health', state: 'gap', detail: 'Bot runtime monitoring is not connected yet' },
    ];
    return { services, queues: [], lastSync: this.now(), sources };
  }
}
