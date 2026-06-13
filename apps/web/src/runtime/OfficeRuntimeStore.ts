import type { AgentStatus, AgentStatusMap } from './types';
import type { OfficeEvent } from '@trading-office/office-gateway';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

export interface RuntimeState {
  statuses: AgentStatusMap;
  connection: ConnectionStatus;
}

export class OfficeRuntimeStore {
  private state: RuntimeState = { statuses: {}, connection: 'connected' };
  private readonly listeners = new Set<() => void>();

  getSnapshot = (): RuntimeState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  setStatus(agentId: string, status: AgentStatus): void {
    if (this.state.statuses[agentId] === status) return;
    this.state = { ...this.state, statuses: { ...this.state.statuses, [agentId]: status } };
    this.emit();
  }

  /** Narrow reducer: only floor-shell status state. Other events are panel-local. */
  reduce(e: OfficeEvent): void {
    if (e.type === 'agent_statuses_snapshot') this.setStatuses(e.statuses);
    else if (e.type === 'agent_status_changed') this.setStatus(e.agentId, e.status);
  }

  setStatuses(statuses: AgentStatusMap): void {
    const cur = this.state.statuses;
    const keys = Object.keys(statuses);
    if (
      keys.length === Object.keys(cur).length &&
      keys.every((k) => cur[k] === statuses[k])
    ) {
      return;
    }
    this.state = { ...this.state, statuses: { ...statuses } };
    this.emit();
  }

  setConnection(connection: ConnectionStatus): void {
    if (this.state.connection === connection) return;
    this.state = { ...this.state, connection };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
