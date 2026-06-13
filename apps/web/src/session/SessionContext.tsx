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
  login: (name: string) => void;
  logout: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function loadInitial(): SessionState {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return initialSession;
    const parsed = JSON.parse(raw) as SessionState;
    return parsed.user && typeof parsed.user.name === 'string'
      ? parsed
      : initialSession;
  } catch {
    return initialSession;
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

  const login = useCallback((name: string) => dispatch({ type: 'login', name }), []);
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
