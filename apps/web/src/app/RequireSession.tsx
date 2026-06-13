import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { shouldRedirect } from '../session/session';
import { useSession } from '../session/SessionContext';

export function RequireSession({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const location = useLocation();
  if (shouldRedirect(session, location.pathname)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
