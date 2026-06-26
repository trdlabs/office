import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { MockOfficeGateway } from './MockOfficeGateway';
import { HttpOfficeGateway } from './HttpOfficeGateway';
import { OfficeRuntimeStore } from './OfficeRuntimeStore';
import { bindGatewayToStore } from './runtimeBinding';
import { readPersistedToken } from '../session/SessionContext';
import type { OfficeGateway } from './OfficeGateway';
import type { ConnectionStatus } from './OfficeRuntimeStore';
import type { AgentStatusMap } from './types';

interface RuntimeContextValue {
  gateway: OfficeGateway;
  store: OfficeRuntimeStore;
}

const RuntimeContext = createContext<RuntimeContextValue | null>(null);

function createGateway(): OfficeGateway {
  const mode = import.meta.env.VITE_OFFICE_MODE ?? 'mock';
  if (mode === 'connected') {
    const baseUrl = import.meta.env.VITE_OFFICE_GATEWAY_URL ?? 'http://localhost:8787';
    return new HttpOfficeGateway({
      baseUrl,
      wsUrl: import.meta.env.VITE_OFFICE_GATEWAY_WS_URL,
      getToken: readPersistedToken,
    });
  }
  return new MockOfficeGateway();
}

export function RuntimeProvider({ children }: { children: ReactNode }) {
  const value = useMemo<RuntimeContextValue>(
    () => ({ gateway: createGateway(), store: new OfficeRuntimeStore() }),
    [],
  );
  // Pump live connection state AND the office event stream into the store. The
  // eager event subscription also opens the WebSocket up-front so the floor
  // gets the on-connect status snapshot without a panel having to be opened.
  useEffect(() => bindGatewayToStore(value.gateway, value.store), [value]);
  return <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>;
}

function useRuntime(): RuntimeContextValue {
  const ctx = useContext(RuntimeContext);
  if (!ctx) throw new Error('useRuntime must be used within <RuntimeProvider>');
  return ctx;
}

export function useGateway(): OfficeGateway {
  return useRuntime().gateway;
}

export function useRuntimeStore(): OfficeRuntimeStore {
  return useRuntime().store;
}

export function useAgentStatuses(): AgentStatusMap {
  const { store } = useRuntime();
  return useSyncExternalStore(store.subscribe, () => store.getSnapshot().statuses);
}

export function useConnectionStatus(): ConnectionStatus {
  const { store } = useRuntime();
  return useSyncExternalStore(store.subscribe, () => store.getSnapshot().connection);
}
