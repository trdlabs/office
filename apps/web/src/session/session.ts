export interface SessionUser {
  name: string;
}

export interface SessionState {
  user: SessionUser | null;
}

export type SessionAction =
  | { type: 'login'; name: string }
  | { type: 'logout' };

export const initialSession: SessionState = { user: null };

export function sessionReducer(
  state: SessionState,
  action: SessionAction,
): SessionState {
  switch (action.type) {
    case 'login':
      return { user: { name: action.name.trim() || 'Trader' } };
    case 'logout':
      return { user: null };
  }
}

export function shouldRedirect(state: SessionState, pathname: string): boolean {
  return state.user === null && pathname.startsWith('/floor');
}
