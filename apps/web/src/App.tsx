import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useState } from 'react';
import { RequireSession } from './app/RequireSession';
import { AppShell } from './app/AppShell';
import { OutsideScreen } from './outside/OutsideScreen';
import { SessionProvider } from './session/SessionContext';
import { RuntimeProvider } from './runtime/RuntimeContext';
import { FloorScreen } from './floor/FloorScreen';
import type { FloorThemeName } from '@trading-office/trading-lab-floor';

function FloorRoute() {
  const [themeName, setThemeName] = useState<FloorThemeName>('day');
  const [simulate, setSimulate] = useState(false);
  return (
    <AppShell
      themeName={themeName}
      onThemeChange={setThemeName}
      simulate={simulate}
      onSimulateChange={setSimulate}
    >
      <FloorScreen themeName={themeName} simulate={simulate} />
    </AppShell>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <RuntimeProvider>
          <Routes>
            <Route path="/" element={<OutsideScreen />} />
            <Route
              path="/floor/trading-lab/*"
              element={
                <RequireSession>
                  <FloorRoute />
                </RequireSession>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </RuntimeProvider>
      </SessionProvider>
    </BrowserRouter>
  );
}
