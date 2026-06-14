import { describe, it, expect } from 'vitest';
import { InfraAggregator } from './InfraAggregator';

const NOW = () => '2026-06-14T00:00:00.000Z';
const byDomain = (infra: Awaited<ReturnType<InfraAggregator['getInfraStatus']>>) =>
  Object.fromEntries((infra.sources ?? []).map((s) => [s.domain, s.state]));

describe('InfraAggregator', () => {
  it('read-api live + knowledge/bot-health gaps when readyz ok', async () => {
    const client = { getReadyz: async () => ({ status: 'ok' as const, checks: { db: true } }) };
    const infra = await new InfraAggregator(client, () => 'live', NOW).getInfraStatus();
    const d = byDomain(infra);
    expect(d['trading-lab-read-api']).toBe('live');
    expect(d['trading-lab-stream']).toBe('live');
    expect(d['knowledge']).toBe('gap');
    expect(d['bot-health']).toBe('gap');
    expect(infra.queues).toEqual([]);
    expect(infra.lastSync).toBe('2026-06-14T00:00:00.000Z');
  });

  it('read-api error when readyz throws; stream state reflected', async () => {
    const client = { getReadyz: async () => { throw new Error('down'); } };
    const infra = await new InfraAggregator(client, () => 'error', NOW).getInfraStatus();
    const d = byDomain(infra);
    expect(d['trading-lab-read-api']).toBe('error');
    expect(d['trading-lab-stream']).toBe('error');
  });
});
