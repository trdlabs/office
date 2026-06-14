import { describe, it, expect, vi } from 'vitest';
import { CompositeOfficeReadConnector } from './CompositeOfficeReadConnector';

const read = {
  getAgentStatuses: vi.fn(async () => ({ analyst: 'idle' as const })),
  getAgentActivity: vi.fn(async () => ({ agentId: 'analyst', status: 'idle' as const, currentTask: null, logs: [] })),
  getHypotheses: vi.fn(async () => [{ id: 'h1', title: 't', summary: 's', stage: 'validated' as const }]),
  getBacktests: vi.fn(async () => []),
};
const infra = { getInfraStatus: vi.fn(async () => ({ services: [], queues: [], lastSync: 'x', sources: [] })) };
const make = (startBridge = () => () => {}) =>
  new CompositeOfficeReadConnector({ read: read as never, infra: infra as never, startBridge });

describe('CompositeOfficeReadConnector', () => {
  it('routes reads to the lab read connector', async () => {
    const c = make();
    expect(await c.getAgentStatuses()).toEqual({ analyst: 'idle' });
    expect(await c.getHypotheses()).toHaveLength(1);
    await c.getBacktests();
    expect(read.getBacktests).toHaveBeenCalled();
  });
  it('returns honest empty gaps for knowledge + bot-health (no fixtures)', async () => {
    const c = make();
    expect(await c.getKnowledge()).toEqual([]);
    expect(await c.getBotHealth()).toEqual([]);
  });
  it('delegates start() to the bridge factory and returns its stop', () => {
    const stop = vi.fn();
    const startBridge = vi.fn(() => stop);
    const off = make(startBridge).start(() => {});
    expect(startBridge).toHaveBeenCalledOnce();
    off();
    expect(stop).toHaveBeenCalledOnce();
  });
});
