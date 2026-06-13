import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { MockOfficeGateway } from './MockOfficeGateway';
import { OfficeRuntimeStore } from './OfficeRuntimeStore';
import type { OfficeGateway } from './OfficeGateway';
import type { AgentStatusMap } from './types';

interface RuntimeContextValue {
  gateway: OfficeGateway;
  store: OfficeRuntimeStore;
}

const RuntimeContext = createContext<RuntimeContextValue | null>(null);

export function RuntimeProvider({ children }: { children: ReactNode }) {
  const value = useMemo<RuntimeContextValue>(
    () => ({ gateway: new MockOfficeGateway(), store: new OfficeRuntimeStore() }),
    [],
  );
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
