import { describe, it, expect, vi } from 'vitest';
import { makeRunCycleFanout } from './runCycleFanout';

describe('makeRunCycleFanout', () => {
  it('returns undefined when there is no consumer', () => {
    expect(makeRunCycleFanout([undefined, undefined])).toBeUndefined();
  });
  it('registers the follower even when the watcher is absent', () => {
    const follower = { register: vi.fn() };
    makeRunCycleFanout([undefined, follower])!('t1', 'c1');
    expect(follower.register).toHaveBeenCalledWith('t1', 'c1');
  });
  it('registers with every present consumer', () => {
    const watcher = { register: vi.fn() };
    const follower = { register: vi.fn() };
    makeRunCycleFanout([watcher, follower])!('t1', 'c1');
    expect(watcher.register).toHaveBeenCalledWith('t1', 'c1');
    expect(follower.register).toHaveBeenCalledWith('t1', 'c1');
  });
});
