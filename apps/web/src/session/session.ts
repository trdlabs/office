export interface SessionUser {
  name: string;
}

export interface SessionState {
  user: SessionUser | null;
  /** Operator session token from the server; null in open/mock mode. */
  token: string | null;
}

export type SessionAction =
  | { type: 'login'; name: string; token?: string | null }
  | { type: 'logout' };

export const initialSession: SessionState = { user: null, token: null };

export function sessionReducer(
  state: SessionState,
  action: SessionAction,
): SessionState {
  switch (action.type) {
    case 'login':
      return { user: { name: action.name.trim() || 'Trader' }, token: action.token ?? null };
    case 'logout':
      return { user: null, token: null };
  }
}

export function shouldRedirect(state: SessionState, pathname: string): boolean {
  return state.user === null && pathname.startsWith('/floor');
}
