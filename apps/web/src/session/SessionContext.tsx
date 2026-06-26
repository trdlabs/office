import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  type ReactNode,
} from 'react';
import {
  initialSession,
  sessionReducer,
  type SessionState,
} from './session';

const STORAGE_KEY = 'trading-office.session';

interface SessionContextValue {
  session: SessionState;
  login: (name: string, token?: string | null) => void;
  logout: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function loadInitial(): SessionState {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return initialSession;
    const parsed = JSON.parse(raw) as SessionState;
    return parsed.user && typeof parsed.user.name === 'string'
      ? { user: parsed.user, token: parsed.token ?? null }
      : initialSession;
  } catch {
    return initialSession;
  }
}

/**
 * Read the persisted operator token outside React (the gateway needs it at
 * request time without subscribing to context). Returns null in open/mock mode.
 */
export function readPersistedToken(): string | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    return (JSON.parse(raw) as SessionState).token ?? null;
  } catch {
    return null;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, dispatch] = useReducer(sessionReducer, undefined, loadInitial);

  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      /* ignore quota / disabled storage */
    }
  }, [session]);

  const login = useCallback(
    (name: string, token?: string | null) => dispatch({ type: 'login', name, token }),
    [],
  );
  const logout = useCallback(() => dispatch({ type: 'logout' }), []);

  return (
    <SessionContext.Provider value={{ session, login, logout }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within <SessionProvider>');
  return ctx;
}
