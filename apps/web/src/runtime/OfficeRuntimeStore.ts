import type { AgentStatus, AgentStatusMap } from './types';

export interface RuntimeState {
  statuses: AgentStatusMap;
}

export class OfficeRuntimeStore {
  private state: RuntimeState = { statuses: {} };
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
    this.state = { statuses: { ...this.state.statuses, [agentId]: status } };
    this.emit();
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
    this.state = { statuses: { ...statuses } };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
