import { describe, it, expect } from 'vitest';
import { OfficeRuntimeStore } from './OfficeRuntimeStore';

describe('OfficeRuntimeStore.reduce', () => {
  it('applies a snapshot then a single status change', () => {
    const store = new OfficeRuntimeStore();
    store.reduce({ type: 'agent_statuses_snapshot', ts: '1', statuses: { boss: 'thinking', analyst: 'idle' } });
    expect(store.getSnapshot().statuses).toEqual({ boss: 'thinking', analyst: 'idle' });
    store.reduce({ type: 'agent_status_changed', ts: '2', agentId: 'analyst', status: 'running' });
    expect(store.getSnapshot().statuses.analyst).toBe('running');
  });

  it('ignores non-status events (stays narrow — not a god-object)', () => {
    const store = new OfficeRuntimeStore();
    store.reduce({ type: 'agent_statuses_snapshot', ts: '1', statuses: { boss: 'thinking' } });
    store.reduce({ type: 'heartbeat', ts: '2' });
    store.reduce({ type: 'agent_trace_appended', ts: '3', agentId: 'boss', line: { ts: '3', level: 'info', text: 'x' } });
    expect(store.getSnapshot().statuses).toEqual({ boss: 'thinking' });
  });

  it('tracks shell connection state without touching statuses', () => {
    const store = new OfficeRuntimeStore();
    store.reduce({ type: 'agent_statuses_snapshot', ts: '1', statuses: { boss: 'thinking' } });
    expect(store.getSnapshot().connection).toBe('connected');
    store.setConnection('reconnecting');
    expect(store.getSnapshot().connection).toBe('reconnecting');
    expect(store.getSnapshot().statuses).toEqual({ boss: 'thinking' });
  });
});
