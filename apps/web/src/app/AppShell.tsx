import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../session/SessionContext';
import { FLOOR_THEMES, type FloorThemeName } from '@trading-office/trading-lab-floor';

const THEME_ORDER: FloorThemeName[] = ['day', 'night'];

// Authed chrome (topbar: theme toggle + simulate toggle + logout), mounted
// around FloorScreen by App.tsx's FloorRoute.
export function AppShell({
  themeName,
  onThemeChange,
  simulate,
  onSimulateChange,
  children,
}: {
  themeName: FloorThemeName;
  onThemeChange: (t: FloorThemeName) => void;
  simulate: boolean;
  onSimulateChange: (v: boolean) => void;
  children: ReactNode;
}) {
  const { session, logout } = useSession();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <div className="shell">
      <header className="shell__topbar">
        <div className="shell__brand">
          <strong>Trading Office</strong>
          <span className="shell__floor">Trading Lab · Research Floor</span>
        </div>
        <div className="shell__controls">
          <div className="theme-toggle" role="group" aria-label="Scene theme">
            {THEME_ORDER.map((name) => (
              <button
                key={name}
                type="button"
                className="theme-btn"
                data-active={name === themeName}
                onClick={() => onThemeChange(name)}
              >
                {name === 'day' ? '☀' : '☾'} {FLOOR_THEMES[name].label}
              </button>
            ))}
          </div>
          <label className="sim-toggle">
            <input
              type="checkbox"
              checked={simulate}
              onChange={(e) => onSimulateChange(e.target.checked)}
            />
            simulate activity
          </label>
          <span className="shell__user">{session.user?.name ?? ''}</span>
          <button type="button" className="btn btn--ghost" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>
      <main className="shell__stage">{children}</main>
    </div>
  );
}
