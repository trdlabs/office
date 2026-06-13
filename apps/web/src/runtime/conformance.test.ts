import { describe, it, expect } from 'vitest';
import { createFixtureOfficeApp } from '@trading-office/server';
import { HttpOfficeGateway } from './HttpOfficeGateway';
import { MockOfficeGateway } from './MockOfficeGateway';

// Connected (real HTTP serialization, in-process Hono) must equal mock on every
// deterministic snapshot — proving the wire contract + serialization is lossless.
const { app } = createFixtureOfficeApp({ OFFICE_FIXTURE_LATENCY_MS: '0' });
const http = new HttpOfficeGateway({ baseUrl: 'http://conformance.local', fetchImpl: (url, init) => Promise.resolve(app.request(url, init)) });
const mock = new MockOfficeGateway({ latencyMs: 0 });

describe('mock == connected (deterministic snapshots)', () => {
  it('agent statuses', async () => expect(await http.getAgentStatuses()).toEqual(await mock.getAgentStatuses()));
  it('agent activity', async () => expect(await http.getAgentActivity('researcher')).toEqual(await mock.getAgentActivity('researcher')));
  it('hypotheses', async () => expect(await http.getHypotheses()).toEqual(await mock.getHypotheses()));
  it('backtests', async () => expect(await http.getBacktests()).toEqual(await mock.getBacktests()));
  it('bot health', async () => expect(await http.getBotHealth()).toEqual(await mock.getBotHealth()));
  it('knowledge', async () => expect(await http.getKnowledge()).toEqual(await mock.getKnowledge()));
  it('infra', async () => expect(await http.getInfraStatus()).toEqual(await mock.getInfraStatus()));
});
