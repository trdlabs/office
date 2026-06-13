import { describe, it, expect } from 'vitest';
import { OfficeEventBus } from './OfficeEventBus';

describe('OfficeEventBus', () => {
  it('fans out to all subscribers and stops on unsubscribe', () => {
    const bus = new OfficeEventBus();
    const a: string[] = [];
    const b: string[] = [];
    const offA = bus.subscribe((e) => a.push(e.type));
    bus.subscribe((e) => b.push(e.type));
    bus.publish({ type: 'heartbeat', ts: '1' });
    expect(a).toEqual(['heartbeat']);
    expect(b).toEqual(['heartbeat']);
    offA();
    bus.publish({ type: 'heartbeat', ts: '2' });
    expect(a).toEqual(['heartbeat']);
    expect(b).toEqual(['heartbeat', 'heartbeat']);
    expect(bus.size).toBe(1);
  });
});
