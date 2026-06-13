import { describe, expect, it, vi } from 'vitest';
import { OfficeRuntimeStore } from './OfficeRuntimeStore';

describe('OfficeRuntimeStore', () => {
  it('starts empty and accepts a status map', () => {
    const s = new OfficeRuntimeStore();
    expect(s.getSnapshot().statuses).toEqual({});
    s.setStatuses({ boss: 'running' });
    expect(s.getSnapshot().statuses).toEqual({ boss: 'running' });
  });

  it('notifies subscribers on change and returns a stable snapshot otherwise', () => {
    const s = new OfficeRuntimeStore();
    const spy = vi.fn();
    const off = s.subscribe(spy);
    const before = s.getSnapshot();
    s.setStatus('boss', 'running');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(s.getSnapshot()).not.toBe(before);
    // same value → no new snapshot, no notify
    const after = s.getSnapshot();
    s.setStatus('boss', 'running');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(s.getSnapshot()).toBe(after);
    off();
  });

  it('stops notifying after unsubscribe', () => {
    const s = new OfficeRuntimeStore();
    const spy = vi.fn();
    s.subscribe(spy)();
    s.setStatus('boss', 'idle');
    expect(spy).not.toHaveBeenCalled();
  });

  it('setStatuses is a no-op when the map is unchanged', () => {
    const s = new OfficeRuntimeStore();
    s.setStatuses({ boss: 'running', analyst: 'idle' });
    const spy = vi.fn();
    s.subscribe(spy);
    const snap = s.getSnapshot();
    s.setStatuses({ boss: 'running', analyst: 'idle' });
    expect(spy).not.toHaveBeenCalled();
    expect(s.getSnapshot()).toBe(snap);
  });
});
