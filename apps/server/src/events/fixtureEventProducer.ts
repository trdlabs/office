import { STATUS_POOLS } from '@trading-office/office-fixtures';
import type { OfficeEvent } from '@trading-office/office-gateway';

const nowIso = (): string => new Date().toISOString();

/**
 * Server-side replacement for the Phase 1 client-side setInterval status loop.
 * Cycles each agent's status on a fixed tick and occasionally appends a trace.
 * Returns a stop function.
 */
export function createFixtureEventProducer(emit: (e: OfficeEvent) => void, tickMs: number): () => void {
  const ids = Object.keys(STATUS_POOLS);
  let tick = 0;
  const timer = setInterval(() => {
    tick += 1;
    for (const id of ids) {
      const pool = STATUS_POOLS[id]!;
      emit({ type: 'agent_status_changed', ts: nowIso(), agentId: id, status: pool[tick % pool.length]! });
    }
    if (tick % 3 === 0) {
      emit({ type: 'agent_trace_appended', ts: nowIso(), agentId: 'researcher', line: { ts: nowIso(), level: 'info', text: `sweep tick ${tick}` } });
    }
  }, tickMs);
  return () => clearInterval(timer);
}
