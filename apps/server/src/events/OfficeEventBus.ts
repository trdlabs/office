import type { OfficeEvent } from '@trading-office/office-gateway';

export class OfficeEventBus {
  private readonly subscribers = new Set<(e: OfficeEvent) => void>();

  subscribe(fn: (e: OfficeEvent) => void): () => void {
    this.subscribers.add(fn);
    return () => { this.subscribers.delete(fn); };
  }

  publish(e: OfficeEvent): void {
    for (const fn of this.subscribers) fn(e);
  }

  get size(): number {
    return this.subscribers.size;
  }
}
