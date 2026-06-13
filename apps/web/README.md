# @trading-office/web

Phase 1 application shell for `trading-office`. Production-facing React/DOM shell
around the office-visual-kit: an outside establishing screen, mock login, and the
Trading Lab floor with a panel router. **Mock-first — no backend, no execution
authority.**

## Run

```bash
# from the repo root
npm install
npm run dev   # → http://localhost:5174
```

## Architecture

- **Pixi/office-visual-kit renders only the floor.** Outside, login, panels,
  topbar, and routing are React/DOM.
- **The router owns view/selection state; the scene follows** via a synchronous
  reconcile guard (no loops).
- **One data boundary:** the read-only `OfficeGateway` interface
  (`MockOfficeGateway` in Phase 1) → `OfficeRuntimeStore` → `applyStatusToScene`
  seam → `scene.setAgentStatus`. Panels never touch Pixi.
- `sendBossCommand` is **inert** in Phase 1 (mock transcript only — no execution).

## Layout

```text
src/
  App.tsx                 providers + routes
  app/                    RequireSession guard, AppShell topbar
  outside/                OutsideScreen (SVG facade + door), LoginModal
  session/                pure reducer/guard + SessionContext
  runtime/                types, OfficeGateway, MockOfficeGateway, fixtures,
                          OfficeRuntimeStore, sceneBridge, RuntimeContext
  floor/                  FloorScreen, panelRegistry, PanelDock, ExitConfirm,
                          floorConfig/floorSelection, objectPanels, panels/*
```

Floor maps/assets are synced from `@trading-office/trading-lab-floor` into
`public/` on `predev`/`prebuild` (`tools/sync-floor-public.mjs`); those copies
are git-ignored generated artifacts.
