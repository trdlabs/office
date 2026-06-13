import { describe, it, expect } from 'vitest';
import { serve } from '@hono/node-server';
import { WebSocket } from 'ws';
import type { OfficeEvent } from '@trading-office/office-gateway';
import { OFFICE_API } from '@trading-office/office-gateway';
import { loadConfig } from './config';
import { OfficeEventBus } from './events/OfficeEventBus';
import { FixtureOfficeReadConnector } from './connector/FixtureOfficeReadConnector';
import { createOfficeApp } from './app';

describe('WS /api/office/events', () => {
  it('sends a snapshot then live events, and unsubscribes on close', async () => {
    const config = { ...loadConfig({}), eventTickMs: 20 };
    const bus = new OfficeEventBus();
    const connector = new FixtureOfficeReadConnector(config);
    const stopProducer = connector.start((e) => bus.publish(e));
    const { app, injectWebSocket } = createOfficeApp({ connector, bus, config });

    const port: number = await new Promise((resolve) => {
      const s = serve({ fetch: app.fetch, port: 0 }, (info) => resolve(info.port));
      injectWebSocket(s);
      (globalThis as any).__srv = s;
    });

    const messages: OfficeEvent[] = [];
    const ws = new WebSocket(`ws://localhost:${port}${OFFICE_API.events}`);
    await new Promise<void>((resolve, reject) => {
      ws.on('message', (data) => {
        messages.push(JSON.parse(data.toString()));
        if (messages.length >= 2) resolve();
      });
      ws.on('error', reject);
      setTimeout(() => reject(new Error('WS timeout')), 2000);
    });

    expect(messages[0]!.type).toBe('agent_statuses_snapshot');
    expect(messages.length).toBeGreaterThanOrEqual(2);
    expect(bus.size).toBe(1);

    ws.close();
    const deadline = Date.now() + 2000;
    while (bus.size > 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 10));
    expect(bus.size).toBe(0);

    stopProducer();
    await new Promise<void>((r) => (globalThis as any).__srv.close(() => r()));
  });
});
