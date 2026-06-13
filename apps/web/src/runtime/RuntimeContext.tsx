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
    return new HttpOfficeGateway({ baseUrl, wsUrl: import.meta.env.VITE_OFFICE_GATEWAY_WS_URL });
  }
  return new MockOfficeGateway();
}

interface ConnectionSignaling {
  subscribeConnection(cb: (s: ConnectionStatus) => void): () => void;
}
function isConnectionSignaling(g: unknown): g is ConnectionSignaling {
  return typeof (g as { subscribeConnection?: unknown }).subscribeConnection === 'function';
}

export function RuntimeProvider({ children }: { children: ReactNode }) {
  const value = useMemo<RuntimeContextValue>(
    () => ({ gateway: createGateway(), store: new OfficeRuntimeStore() }),
    [],
  );
  useEffect(() => {
    if (isConnectionSignaling(value.gateway)) {
      return value.gateway.subscribeConnection((s) => value.store.setConnection(s));
    }
    value.store.setConnection('connected'); // mock mode: always connected
  }, [value]);
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
