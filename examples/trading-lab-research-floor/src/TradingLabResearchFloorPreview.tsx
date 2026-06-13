import type {
  AgentStatus,
  OfficeEntity,
  OfficeScene,
} from '@trading-office/office-visual-kit';
import { OfficeSceneCanvas } from '@trading-office/office-visual-kit/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DebugCard } from './DebugCard';
import {
  createTradingLabResearchFloorScene,
  FLOOR_THEMES,
  type FloorThemeName,
} from '@trading-office/trading-lab-floor';

/**
 * Preview shell for the Trading Lab Research Floor. The React layer is a thin
 * wrapper: canvas + debug overlay + preview-only toggles (theme, status
 * simulation). All rendering happens inside the kit's PixiJS core.
 */

/** Plausible status loops per agent — preview-side only, no real API. */
const STATUS_POOLS: Record<string, AgentStatus[]> = {
  boss: ['thinking', 'running', 'waiting', 'thinking'],
  analyst: ['thinking', 'reviewing', 'idle', 'success'],
  researcher: ['thinking', 'running', 'idle', 'thinking'],
  critic: ['reviewing', 'blocked', 'reviewing', 'idle'],
  builder: ['running', 'idle', 'success', 'running'],
  evaluator: ['backtesting', 'success', 'backtesting', 'failed'],
  'perf-monitor': ['idle', 'running', 'failed', 'running'],
};

const THEME_ORDER: FloorThemeName[] = ['day', 'night'];

export function TradingLabResearchFloorPreview() {
  const [themeName, setThemeName] = useState<FloorThemeName>('day');
  const config = useMemo(
    () => createTradingLabResearchFloorScene(themeName),
    [themeName],
  );
  const sceneRef = useRef<OfficeScene | null>(null);

  const [hovered, setHovered] = useState<OfficeEntity | null>(null);
  const [selected, setSelected] = useState<OfficeEntity | null>(null);
  const [simulate, setSimulate] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const handleSceneReady = useCallback((scene: OfficeScene) => {
    sceneRef.current = scene;
  }, []);

  const switchTheme = useCallback((next: FloorThemeName) => {
    sceneRef.current = null;
    setHovered(null);
    setSelected(null);
    setError(null);
    setThemeName(next);
  }, []);

  // Lightweight "the office is alive" status simulation (off by default).
  useEffect(() => {
    if (!simulate) return;
    let tick = 0;
    const agentIds = Object.keys(STATUS_POOLS);
    const interval = setInterval(() => {
      const scene = sceneRef.current;
      if (!scene) return;
      tick += 1;
      // Advance one agent per tick, round-robin, through its status pool.
      const agentId = agentIds[tick % agentIds.length]!;
      const pool = STATUS_POOLS[agentId]!;
      const status = pool[Math.floor(tick / agentIds.length) % pool.length]!;
      scene.setAgentStatus(agentId, status);
      // Keep the debug card in sync.
      const sync = (current: OfficeEntity | null) =>
        current?.kind === 'agent' && current.id === agentId
          ? { ...current, status }
          : current;
      setSelected(sync);
      setHovered(sync);
    }, 1400);
    return () => clearInterval(interval);
  }, [simulate]);

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1 className="title">Trading Lab — Research Floor</h1>
          <p className="subtitle">
            office-visual-kit preview · Tiled map → scene config → PixiJS → React
          </p>
        </div>
        <div className="topbar-controls">
          <div className="theme-toggle" role="group" aria-label="Scene theme">
            {THEME_ORDER.map((name) => (
              <button
                key={name}
                type="button"
                className="theme-btn"
                data-active={name === themeName}
                onClick={() => switchTheme(name)}
              >
                {name === 'day' ? '☀ ' : '☾ '}
                {FLOOR_THEMES[name].label}
              </button>
            ))}
          </div>
          <label className="sim-toggle">
            <input
              type="checkbox"
              checked={simulate}
              onChange={(event) => setSimulate(event.target.checked)}
            />
            simulate agent activity
          </label>
        </div>
      </header>

      <main className="stage">
        <OfficeSceneCanvas
          key={themeName}
          config={config}
          onSceneReady={handleSceneReady}
          onSceneError={setError}
          onEntityHover={setHovered}
          onEntitySelect={setSelected}
        >
          <DebugCard hovered={hovered} selected={selected} />
        </OfficeSceneCanvas>
        {error && (
          <div className="scene-error">
            <strong>Scene failed to load</strong>
            <pre>{error.message}</pre>
          </div>
        )}
      </main>

      <footer className="hintbar">
        drag&nbsp;·&nbsp;pan&nbsp;&nbsp;&nbsp;wheel&nbsp;·&nbsp;zoom&nbsp;&nbsp;&nbsp;hover&nbsp;·&nbsp;inspect&nbsp;&nbsp;&nbsp;click&nbsp;·&nbsp;pin
        entity&nbsp;&nbsp;&nbsp;click floor&nbsp;·&nbsp;clear
      </footer>
    </div>
  );
}
