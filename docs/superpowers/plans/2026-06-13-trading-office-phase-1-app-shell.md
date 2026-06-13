# Trading Office — Phase 1: Application Shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-facing `apps/web` shell around the Phase 0 office-visual-kit — an outside establishing screen, mock login, and an authenticated Trading Lab floor with a real panel router — all mock-first, with no execution authority.

**Architecture:** Pixi/office-visual-kit renders only the interactive floor; React/DOM owns the outside screen, login, panels, topbar, and routing. The router owns view/selection state and the scene follows it through a synchronous reconcile guard (no loops). Runtime data crosses one boundary — the read-only `OfficeGateway` interface (mock impl in Phase 1) — feeding a minimal subscribable store, which a thin bridge-seam pushes into `scene.setAgentStatus`.

**Tech Stack:** Vite 7, React 19, `react-router-dom` 7, `@pixi/react` 8 / `pixi.js` 8 / `pixi-viewport` 6, `@trading-office/office-visual-kit`, a new `@trading-office/trading-lab-floor` package, Vitest (node env) for the four pure-logic units.

**Spec:** `docs/superpowers/specs/2026-06-13-trading-office-phase-1-app-shell-design.md`

---

## Conventions for this plan

- Run all commands from the repo root `/home/alexxxnikolskiy/projects/trading-office` unless stated.
- Branch first: `git checkout -b phase-1-app-shell` before Task 1.1 (Phase 0 lives on `main`).
- TypeScript is strict (`tsconfig.base.json`): `noUncheckedIndexedAccess`, `verbatimModuleSyntax` (use `import type` for type-only imports), `isolatedModules`.
- Workspaces install: after adding any `package.json`, run `npm install` from the root to link the new workspace before importing it.
- Commit messages use Conventional Commits.

## File map (what each new file is responsible for)

**`packages/trading-lab-floor/`** (extracted floor — single source of truth)
- `package.json` — workspace pkg `@trading-office/trading-lab-floor`, exports `.` → `src/index.ts`.
- `src/index.ts` — re-exports the scene API.
- `src/tradingLabResearchFloor.scene.ts` — moved verbatim from the example.
- `tools/**` — moved generators (location-relative output, unchanged).
- `public/{maps,assets}/**` — canonical committed maps + assets (generators + LPC output).
- `tsconfig.json` — extends base.

**`apps/web/`** (production shell)
- `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx` — app bootstrap.
- `src/App.tsx` — providers + router.
- `src/app/RequireSession.tsx`, `src/app/AppShell.tsx` — guard + authed chrome (topbar + outlet).
- `src/session/session.ts` — pure `sessionReducer` + `shouldRedirect` (tested).
- `src/session/SessionContext.tsx` — provider + `useSession`, localStorage persistence.
- `src/outside/OutsideScreen.tsx`, `src/outside/LoginModal.tsx` — DOM establishing screen + mock login.
- `src/runtime/types.ts` — shared data types.
- `src/runtime/OfficeGateway.ts` — read-only gateway interface.
- `src/runtime/MockOfficeGateway.ts` — fixtures-backed impl (tested).
- `src/runtime/fixtures.ts` — mock data.
- `src/runtime/OfficeRuntimeStore.ts` — subscribable status store (tested).
- `src/runtime/sceneBridge.ts` — `applyStatusToScene` seam.
- `src/runtime/RuntimeContext.tsx` — provides gateway + store; `useGateway`, `useAgentStatuses`.
- `src/floor/FloorScreen.tsx` — canvas mount + loop-free reconcile + camera.
- `src/floor/floorSelection.ts` — `RouteSelection`, `panelTargetToObjectId`, `selectedEntityId` (pure).
- `src/floor/panelRegistry.ts` — `resolvePanel` (tested).
- `src/floor/PanelDock.tsx` — right dock host (derives open state, excludes exit).
- `src/floor/ExitConfirm.tsx` — centered exit overlay (no dock).
- `src/floor/panels/PanelChrome.tsx`, `src/floor/panels/useResource.ts` — shared panel shell + fetch hook.
- `src/floor/panels/{BossCommandPanel,AgentActivityPanel,HypothesisPanel,BacktestPanel,BotHealthPanel,KnowledgePanel,InfraStatusPanel,UnknownPanel}.tsx` — the panels.
- `src/styles.css` — app + panel styles.
- `src/floor/floorConfig.ts` — wraps `createTradingLabResearchFloorScene`.

**Shared tooling**
- `tools/sync-floor-public.mjs` — copies floor package `public/` into a consumer `public/`, with `--check`.

---

## Milestone 1 — Extract the shared floor package

### Task 1.1: Branch and create the floor package skeleton

**Files:**
- Create: `packages/trading-lab-floor/package.json`
- Create: `packages/trading-lab-floor/tsconfig.json`
- Modify: `package.json` (root `workspaces`)

- [ ] **Step 1: Branch**

```bash
git checkout -b phase-1-app-shell
```

- [ ] **Step 2: Create `packages/trading-lab-floor/package.json`**

```json
{
  "name": "@trading-office/trading-lab-floor",
  "version": "0.1.0",
  "license": "MIT",
  "private": true,
  "type": "module",
  "description": "Trading Lab Research Floor — shared scene config + maps + assets + generators (single source of truth)",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  },
  "files": ["src", "public", "tools"],
  "scripts": {
    "typecheck": "tsc --noEmit",
    "build": "tsc --noEmit",
    "generate": "node tools/generate-assets.mjs && node tools/generate-map.mjs",
    "generate:assets": "node tools/generate-assets.mjs",
    "generate:map": "node tools/generate-map.mjs",
    "compose:lpc": "node tools/compose-lpc-agents.mjs"
  },
  "dependencies": {
    "@trading-office/office-visual-kit": "*"
  },
  "devDependencies": {
    "typescript": "^5.8.3"
  }
}
```

- [ ] **Step 3: Create `packages/trading-lab-floor/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Add `apps/*` and the floor to root workspaces**

In root `package.json`, change the `workspaces` array to:

```json
  "workspaces": [
    "packages/*",
    "apps/*",
    "examples/*"
  ],
```

- [ ] **Step 5: Commit**

```bash
git add package.json packages/trading-lab-floor/package.json packages/trading-lab-floor/tsconfig.json
git commit -m "feat(floor): scaffold @trading-office/trading-lab-floor package"
```

### Task 1.2: Move scene config, tools, and assets into the package

**Files:**
- Move: `examples/trading-lab-research-floor/src/scene/tradingLabResearchFloor.scene.ts` → `packages/trading-lab-floor/src/tradingLabResearchFloor.scene.ts`
- Move: `examples/trading-lab-research-floor/tools/` → `packages/trading-lab-floor/tools/`
- Move: `examples/trading-lab-research-floor/public/maps/` → `packages/trading-lab-floor/public/maps/`
- Move: `examples/trading-lab-research-floor/public/assets/` → `packages/trading-lab-floor/public/assets/`
- Create: `packages/trading-lab-floor/src/index.ts`

- [ ] **Step 1: Move files with git (preserves history)**

```bash
mkdir -p packages/trading-lab-floor/src packages/trading-lab-floor/public
git mv examples/trading-lab-research-floor/src/scene/tradingLabResearchFloor.scene.ts packages/trading-lab-floor/src/tradingLabResearchFloor.scene.ts
git mv examples/trading-lab-research-floor/tools packages/trading-lab-floor/tools
git mv examples/trading-lab-research-floor/public/maps packages/trading-lab-floor/public/maps
git mv examples/trading-lab-research-floor/public/assets packages/trading-lab-floor/public/assets
rmdir examples/trading-lab-research-floor/src/scene 2>/dev/null || true
```

- [ ] **Step 2: Create `packages/trading-lab-floor/src/index.ts`**

```ts
export {
  createTradingLabResearchFloorScene,
  FLOOR_THEMES,
  type FloorThemeName,
} from './tradingLabResearchFloor.scene';
```

- [ ] **Step 3: Verify the scene file's import is unchanged**

The moved scene file imports `import type { OfficeSceneConfig, OfficeSceneTheme } from '@trading-office/office-visual-kit';` — that resolves the same way from the package. No edit needed.

- [ ] **Step 4: Install + typecheck the package**

```bash
npm install
npm run typecheck -w @trading-office/trading-lab-floor
```
Expected: no type errors.

- [ ] **Step 5: Verify assets regenerate byte-for-byte (no LPC needed)**

```bash
npm run generate -w @trading-office/trading-lab-floor
git status --short packages/trading-lab-floor/public
```
Expected: **no changes** reported — the generators (now location-relative to the package) reproduce the committed tiles/maps exactly. (The LPC sprites under `public/assets/third-party/lpc/` are committed and not regenerated here.)

- [ ] **Step 6: Commit**

```bash
git add -A packages/trading-lab-floor examples/trading-lab-research-floor
git commit -m "refactor(floor): move scene+tools+assets into trading-lab-floor package"
```

### Task 1.3: Floor asset-sync script with verification

**Files:**
- Create: `tools/sync-floor-public.mjs`

- [ ] **Step 1: Create `tools/sync-floor-public.mjs`**

```js
#!/usr/bin/env node
/**
 * Syncs the canonical floor servable files from the trading-lab-floor package
 * into a consumer's public/ directory. The synced subpaths (maps/, assets/
 * generated/, assets/third-party/) are GENERATED COPY ARTIFACTS: they are
 * git-ignored in consumers and must never be edited by hand — edit the
 * canonical files under packages/trading-lab-floor/public/ instead.
 *
 * Usage:
 *   node tools/sync-floor-public.mjs <consumer-public-dir>
 *   node tools/sync-floor-public.mjs <consumer-public-dir> --check
 *
 * --check exits non-zero if any synced file is missing, differs from, or is a
 * stale extra not present in the canonical source (CI / prebuild drift guard).
 * A missing canonical source dir is always an error (never a silent skip).
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = join(repoRoot, 'packages', 'trading-lab-floor', 'public');
const SYNCED = ['maps', join('assets', 'generated'), join('assets', 'third-party')];

const [, , targetPublicArg, flag] = process.argv;
if (!targetPublicArg) {
  console.error('usage: node tools/sync-floor-public.mjs <consumer-public-dir> [--check]');
  process.exit(2);
}
const targetRoot = join(repoRoot, targetPublicArg);
const check = flag === '--check';

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

let problems = 0;
for (const sub of SYNCED) {
  const src = join(sourceRoot, sub);
  const dst = join(targetRoot, sub);

  // A missing canonical source dir is a setup error, never a silent skip.
  if (!existsSync(src)) {
    console.error(`missing canonical source dir: packages/trading-lab-floor/public/${sub}`);
    problems++;
    continue;
  }

  if (check) {
    // source → target: every canonical file must exist and match byte-for-byte.
    for (const srcFile of walk(src)) {
      const rel = relative(sourceRoot, srcFile);
      const dstFile = join(targetRoot, rel);
      if (!existsSync(dstFile) || !readFileSync(srcFile).equals(readFileSync(dstFile))) {
        console.error(`drift (missing/different): ${rel}`);
        problems++;
      }
    }
    // target → source: no stale extras allowed in the synced dir.
    if (existsSync(dst)) {
      for (const dstFile of walk(dst)) {
        const rel = relative(targetRoot, dstFile);
        if (!existsSync(join(sourceRoot, rel))) {
          console.error(`drift (extra in target): ${rel}`);
          problems++;
        }
      }
    }
  } else {
    // Strict mirror: wipe the target subdir first so deletions propagate.
    rmSync(dst, { recursive: true, force: true });
    mkdirSync(dirname(dst), { recursive: true });
    cpSync(src, dst, { recursive: true });
  }
}

if (problems > 0) {
  console.error(
    check
      ? `floor assets out of sync (${problems} problem(s)). Run the predev/prebuild sync.`
      : `cannot sync: ${problems} missing canonical source dir(s).`,
  );
  process.exit(1);
}
console.log(check ? 'floor assets in sync ✓' : `synced floor assets → ${targetPublicArg}`);
```

- [ ] **Step 2: Make it runnable and smoke it (dry target)**

```bash
node tools/sync-floor-public.mjs examples/trading-lab-research-floor/public
ls examples/trading-lab-research-floor/public/maps
```
Expected: prints `synced floor assets …`; `maps/` now contains the two `.tmj` files.

- [ ] **Step 3: Verify the --check guard passes after a sync**

```bash
node tools/sync-floor-public.mjs examples/trading-lab-research-floor/public --check
```
Expected: `floor assets in sync ✓` (exit 0).

- [ ] **Step 4: Commit**

```bash
git add tools/sync-floor-public.mjs
git commit -m "feat(floor): add sync-floor-public script with --check drift guard"
```

### Task 1.4: Refactor the example into a thin consumer + gitignore synced copies

**Files:**
- Modify: `examples/trading-lab-research-floor/package.json`
- Modify: `examples/trading-lab-research-floor/src/TradingLabResearchFloorPreview.tsx:1-12` (import path)
- Create: `examples/trading-lab-research-floor/.gitignore`
- Remove from git: `examples/trading-lab-research-floor/public/{maps,assets}` (now synced artifacts)

- [ ] **Step 1: Point the preview import at the package**

In `examples/trading-lab-research-floor/src/TradingLabResearchFloorPreview.tsx`, change the scene import from:

```ts
import {
  createTradingLabResearchFloorScene,
  FLOOR_THEMES,
  type FloorThemeName,
} from './scene/tradingLabResearchFloor.scene';
```
to:

```ts
import {
  createTradingLabResearchFloorScene,
  FLOOR_THEMES,
  type FloorThemeName,
} from '@trading-office/trading-lab-floor';
```

- [ ] **Step 2: Update the example `package.json`**

Replace the example `package.json` `dependencies` and `scripts` blocks so it consumes the floor package and syncs assets before dev/build (remove the old `generate*`/`compose` scripts — generation now lives in the floor package):

```json
  "scripts": {
    "predev": "node ../../tools/sync-floor-public.mjs examples/trading-lab-research-floor/public",
    "dev": "vite",
    "prebuild": "node ../../tools/sync-floor-public.mjs examples/trading-lab-research-floor/public",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@pixi/react": "^8.0.0",
    "@trading-office/office-visual-kit": "*",
    "@trading-office/trading-lab-floor": "*",
    "pixi-viewport": "^6.0.3",
    "pixi.js": "^8.6.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
```
(Leave `devDependencies`, `name`, `version`, `type`, etc. unchanged.)

- [ ] **Step 3: Stop tracking the synced copies and ignore them**

Create `examples/trading-lab-research-floor/.gitignore`:

```gitignore
# Synced from packages/trading-lab-floor/public by tools/sync-floor-public.mjs.
# Generated copy artifacts — do NOT edit here; edit the canonical package files.
/public/maps/
/public/assets/
```

Then untrack the now-synced files (they remain on disk):

```bash
git rm -r --cached examples/trading-lab-research-floor/public/maps examples/trading-lab-research-floor/public/assets
```

- [ ] **Step 4: Install, sync, typecheck, and verify the preview still builds**

```bash
npm install
npm run typecheck -w trading-lab-research-floor
npm run build -w trading-lab-research-floor
```
Expected: typecheck clean; build succeeds (the `prebuild` sync populates `public/` first).

- [ ] **Step 5: Manual verify the preview still runs**

```bash
npm run dev -w trading-lab-research-floor
```
Open http://localhost:5173 — the Day Office floor renders, theme toggle works, DebugCard still shows on hover/click. Stop the server (Ctrl-C).

- [ ] **Step 6: Commit**

```bash
git add -A examples/trading-lab-research-floor
git commit -m "refactor(example): consume trading-lab-floor package; ignore synced public assets"
```

---

## Milestone 2 — apps/web scaffold, router, session, outside + login

### Task 2.1: App package, Vite, tsconfig, Vitest, index.html, gitignore

**Files:**
- Create: `apps/web/package.json`, `apps/web/vite.config.ts`, `apps/web/tsconfig.json`, `apps/web/index.html`, `apps/web/.gitignore`

- [ ] **Step 1: Create `apps/web/package.json`**

```json
{
  "name": "@trading-office/web",
  "version": "0.1.0",
  "license": "MIT",
  "private": true,
  "type": "module",
  "description": "Trading Office — production application shell (Phase 1)",
  "scripts": {
    "predev": "node ../../tools/sync-floor-public.mjs apps/web/public",
    "dev": "vite",
    "prebuild": "node ../../tools/sync-floor-public.mjs apps/web/public",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "verify:assets": "node ../../tools/sync-floor-public.mjs apps/web/public --check"
  },
  "dependencies": {
    "@pixi/react": "^8.0.0",
    "@trading-office/office-visual-kit": "*",
    "@trading-office/trading-lab-floor": "*",
    "pixi-viewport": "^6.0.3",
    "pixi.js": "^8.6.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "react-router-dom": "^7.1.0"
  },
  "devDependencies": {
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "@vitejs/plugin-react": "^5.0.0",
    "typescript": "^5.8.3",
    "vite": "^7.0.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create `apps/web/vite.config.ts`**

```ts
/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
  optimizeDeps: {
    exclude: [
      '@trading-office/office-visual-kit',
      '@trading-office/trading-lab-floor',
    ],
  },
  resolve: {
    dedupe: ['pixi.js', 'pixi-viewport', 'react', 'react-dom'],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: Create `apps/web/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 4: Create `apps/web/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Trading Office</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `apps/web/.gitignore`**

```gitignore
# Floor assets synced from packages/trading-lab-floor/public — generated copy
# artifacts, do NOT edit here. The app's own art (assets/office/**) is committed.
/public/maps/
/public/assets/generated/
/public/assets/third-party/
```

- [ ] **Step 6: Install**

```bash
npm install
```
Expected: installs `react-router-dom`, `vitest`, links workspaces.

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json apps/web/vite.config.ts apps/web/tsconfig.json apps/web/index.html apps/web/.gitignore package-lock.json
git commit -m "feat(web): scaffold apps/web (vite, vitest, router deps)"
```

### Task 2.2: Session logic (pure) — TDD

**Files:**
- Create: `apps/web/src/session/session.ts`
- Test: `apps/web/src/session/session.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/session/session.test.ts
import { describe, expect, it } from 'vitest';
import { initialSession, sessionReducer, shouldRedirect } from './session';

describe('sessionReducer', () => {
  it('logs in with the given name', () => {
    const s = sessionReducer(initialSession, { type: 'login', name: 'Alex' });
    expect(s.user).toEqual({ name: 'Alex' });
  });

  it('falls back to a default name when empty', () => {
    const s = sessionReducer(initialSession, { type: 'login', name: '' });
    expect(s.user?.name).toBe('Trader');
  });

  it('logs out', () => {
    const loggedIn = { user: { name: 'Alex' } };
    expect(sessionReducer(loggedIn, { type: 'logout' }).user).toBeNull();
  });
});

describe('shouldRedirect', () => {
  it('redirects floor routes when logged out', () => {
    expect(shouldRedirect(initialSession, '/floor/trading-lab')).toBe(true);
  });
  it('allows floor routes when logged in', () => {
    expect(shouldRedirect({ user: { name: 'A' } }, '/floor/trading-lab')).toBe(false);
  });
  it('never redirects the lobby', () => {
    expect(shouldRedirect(initialSession, '/')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @trading-office/web`
Expected: FAIL — cannot find module `./session`.

- [ ] **Step 3: Implement `apps/web/src/session/session.ts`**

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -w @trading-office/web`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/session/session.ts apps/web/src/session/session.test.ts
git commit -m "feat(web): pure session reducer + route guard predicate"
```

### Task 2.3: Session context + provider (localStorage persistence)

**Files:**
- Create: `apps/web/src/session/SessionContext.tsx`

- [ ] **Step 1: Create `apps/web/src/session/SessionContext.tsx`**

```tsx
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
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck -w @trading-office/web`
Expected: clean (file is not imported yet; this just compiles it once wired in Task 2.5 — if typecheck ignores unreferenced files, defer the check to Task 2.5).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/session/SessionContext.tsx
git commit -m "feat(web): session context with localStorage persistence"
```

### Task 2.4: Outside screen + login modal

**Files:**
- Create: `apps/web/src/outside/OutsideScreen.tsx`
- Create: `apps/web/src/outside/LoginModal.tsx`

- [ ] **Step 1: Create `apps/web/src/outside/LoginModal.tsx`**

```tsx
import { useState, type FormEvent } from 'react';

export function LoginModal({
  onSubmit,
  onCancel,
}: {
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit(name);
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <form
        className="modal login"
        role="dialog"
        aria-label="Sign in"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2 className="login__title">Trading Lab</h2>
        <p className="login__hint">Mock sign-in — no real auth in Phase 1.</p>
        <input
          className="login__input"
          placeholder="Your name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <div className="login__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary">
            Enter the Lab
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/web/src/outside/OutsideScreen.tsx`**

The building facade is an inline SVG (pixel-art aesthetic — sharp rects, limited palette). The door is an absolutely-positioned `<button>` hotspot. This refines spec §4 (inline SVG instead of a generated PNG) to stay fully in the DOM layer with zero new asset pipeline; revisit if a richer facade is wanted later.

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../session/SessionContext';
import { LoginModal } from './LoginModal';

const FLOOR_PATH = '/floor/trading-lab';

export function OutsideScreen() {
  const navigate = useNavigate();
  const { session, login } = useSession();
  const [loginOpen, setLoginOpen] = useState(false);

  function handleDoor() {
    if (session.user) {
      navigate(FLOOR_PATH);
    } else {
      setLoginOpen(true);
    }
  }

  function handleLogin(name: string) {
    login(name);
    setLoginOpen(false);
    navigate(FLOOR_PATH);
  }

  return (
    <div className="outside">
      <div className="outside__scene">
        <svg
          className="outside__facade"
          viewBox="0 0 200 160"
          preserveAspectRatio="xMidYMax meet"
          shapeRendering="crispEdges"
          aria-hidden="true"
        >
          <rect x="0" y="0" width="200" height="160" fill="#7fa9d6" />
          <rect x="0" y="120" width="200" height="40" fill="#3c4a3a" />
          <rect x="34" y="20" width="132" height="108" fill="#3b4358" />
          <rect x="34" y="20" width="132" height="108" fill="none" stroke="#23283a" strokeWidth="2" />
          {Array.from({ length: 4 }).flatMap((_, row) =>
            Array.from({ length: 5 }).map((__, col) => (
              <rect
                key={`${row}-${col}`}
                x={44 + col * 24}
                y={28 + row * 20}
                width="14"
                height="12"
                fill={(row + col) % 3 === 0 ? '#ffd27f' : '#9fb6d8'}
              />
            )),
          )}
          <rect x="86" y="104" width="28" height="24" fill="#5a3b22" />
          <rect x="86" y="104" width="28" height="24" fill="none" stroke="#2f1d10" strokeWidth="2" />
          <text x="100" y="16" textAnchor="middle" fontSize="9" fill="#1d2233" fontFamily="monospace">
            TRADING LAB
          </text>
        </svg>
        <button
          type="button"
          className="outside__door"
          onClick={handleDoor}
          aria-label={session.user ? 'Enter the Trading Lab floor' : 'Open sign-in'}
        >
          <span className="outside__door-hint">
            {session.user ? 'Enter →' : 'Knock'}
          </span>
        </button>
      </div>
      <p className="outside__caption">Click the door to enter.</p>
      {loginOpen && (
        <LoginModal onSubmit={handleLogin} onCancel={() => setLoginOpen(false)} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/outside
git commit -m "feat(web): outside establishing screen + mock login modal"
```

### Task 2.5: Router, guard, AppShell, main entry, base styles

**Files:**
- Create: `apps/web/src/app/RequireSession.tsx`
- Create: `apps/web/src/app/AppShell.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/styles.css`

- [ ] **Step 1: Create `apps/web/src/app/RequireSession.tsx`**

```tsx
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
```

- [ ] **Step 2: Create `apps/web/src/app/AppShell.tsx`**

`themeName` and the sim toggle live here (topbar). The floor is rendered by children; the topbar carries theme/sim/logout. (Theme + sim state is lifted here and passed to `FloorScreen` via props in Task 4.1; for now AppShell renders an outlet-style children prop.)

```tsx
import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../session/SessionContext';
import { FLOOR_THEMES, type FloorThemeName } from '@trading-office/trading-lab-floor';

const THEME_ORDER: FloorThemeName[] = ['day', 'night'];

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
```

- [ ] **Step 3: Create `apps/web/src/App.tsx`** (placeholder FloorScreen wired fully in Milestone 4)

```tsx
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RequireSession } from './app/RequireSession';
import { OutsideScreen } from './outside/OutsideScreen';
import { SessionProvider } from './session/SessionContext';
import { RuntimeProvider } from './runtime/RuntimeContext';
import { FloorScreen } from './floor/FloorScreen';

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
                  <FloorScreen />
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
```

> `RuntimeProvider` and `FloorScreen` are created in Milestones 3–4. If you are executing strictly top-to-bottom, temporarily stub them (a `RuntimeProvider` that renders `children`, a `FloorScreen` returning `<div>floor</div>`) so the app compiles after this task, then replace them. The stubs are removed by Tasks 3.6 and 4.1.

- [ ] **Step 4: Create `apps/web/src/main.tsx`** (no StrictMode — mirror the example's async-Pixi caveat)

```tsx
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const host = document.getElementById('root');
if (!host) throw new Error('#root not found');
createRoot(host).render(<App />);
```

- [ ] **Step 5: Create `apps/web/src/styles.css`**

```css
:root {
  --bg: #0f1118;
  --panel-bg: #171b27;
  --panel-edge: #2a3142;
  --ink: #e7ecf6;
  --muted: #9fb0cc;
  --accent: #59f7d4;
  --warn: #ffd166;
  --danger: #ff6b6b;
  --dock-w: 380px;
}

* { box-sizing: border-box; }
html, body, #root { height: 100%; margin: 0; }
body {
  font-family: ui-sans-serif, system-ui, sans-serif;
  background: var(--bg);
  color: var(--ink);
}

/* shell */
.shell { display: flex; flex-direction: column; height: 100%; }
.shell__topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 14px; background: #0b0e16; border-bottom: 1px solid var(--panel-edge);
}
.shell__brand { display: flex; flex-direction: column; }
.shell__floor { font-size: 11px; color: var(--muted); }
.shell__controls { display: flex; align-items: center; gap: 12px; }
.shell__user { font-size: 12px; color: var(--muted); }
.shell__stage { position: relative; flex: 1; min-height: 0; }

.theme-toggle { display: inline-flex; border: 1px solid var(--panel-edge); border-radius: 6px; overflow: hidden; }
.theme-btn { background: transparent; color: var(--muted); border: 0; padding: 4px 8px; cursor: pointer; font-size: 12px; }
.theme-btn[data-active='true'] { background: var(--panel-edge); color: var(--ink); }
.sim-toggle { font-size: 12px; color: var(--muted); display: inline-flex; gap: 4px; align-items: center; }

.btn { border-radius: 6px; padding: 5px 10px; font-size: 12px; cursor: pointer; border: 1px solid var(--panel-edge); }
.btn--ghost { background: transparent; color: var(--muted); }
.btn--primary { background: var(--accent); color: #04201a; border-color: var(--accent); font-weight: 600; }

/* outside */
.outside { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 12px; background: radial-gradient(circle at 50% 30%, #28344a, #0f1118); }
.outside__scene { position: relative; width: min(560px, 80vw); }
.outside__facade { width: 100%; height: auto; image-rendering: pixelated; display: block; }
.outside__door {
  position: absolute; left: 43%; top: 65%; width: 14%; height: 15%;
  background: transparent; border: 2px solid transparent; cursor: pointer; border-radius: 2px;
}
.outside__door:hover, .outside__door:focus-visible { border-color: var(--accent); outline: none; }
.outside__door-hint { position: absolute; left: 50%; bottom: -22px; transform: translateX(-50%); font-size: 11px; color: var(--accent); white-space: nowrap; }
.outside__caption { color: var(--muted); font-size: 13px; }

/* modal */
.modal-backdrop { position: fixed; inset: 0; background: rgba(4, 6, 12, 0.6); display: flex; align-items: center; justify-content: center; z-index: 50; }
.modal { background: var(--panel-bg); border: 1px solid var(--panel-edge); border-radius: 10px; padding: 18px; width: 320px; }
.login__title { margin: 0 0 4px; }
.login__hint { margin: 0 0 12px; color: var(--muted); font-size: 12px; }
.login__input { width: 100%; padding: 8px; border-radius: 6px; border: 1px solid var(--panel-edge); background: #0e1119; color: var(--ink); }
.login__actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }

/* floor + dock */
.floor { position: absolute; inset: 0; }
.floor__canvas { position: absolute; inset: 0; }
.dock {
  position: absolute; top: 0; right: 0; height: 100%; width: var(--dock-w);
  background: var(--panel-bg); border-left: 1px solid var(--panel-edge);
  transform: translateX(100%); transition: transform 180ms ease; z-index: 10;
  display: flex; flex-direction: column;
}
.dock[data-open='true'] { transform: translateX(0); }

/* panels */
.panel { display: flex; flex-direction: column; height: 100%; }
.panel__head { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-bottom: 1px solid var(--panel-edge); }
.panel__title { font-size: 14px; margin: 0; flex: 1; }
.panel__badge { font-size: 10px; color: var(--warn); border: 1px solid var(--warn); border-radius: 4px; padding: 1px 5px; text-transform: uppercase; letter-spacing: 0.04em; }
.panel__close { background: transparent; border: 0; color: var(--muted); font-size: 18px; cursor: pointer; line-height: 1; }
.panel__body { padding: 12px 14px; overflow: auto; flex: 1; font-size: 13px; }
.panel__state { color: var(--muted); font-size: 12px; }

.row { display: flex; justify-content: space-between; gap: 8px; padding: 6px 0; border-bottom: 1px solid #20263500; }
.tag { font-size: 11px; padding: 1px 6px; border-radius: 4px; background: var(--panel-edge); color: var(--ink); }
.status-pill { font-size: 11px; padding: 1px 7px; border-radius: 9px; background: #10131d; border: 1px solid var(--panel-edge); }
.trace { font-family: ui-monospace, monospace; font-size: 11px; line-height: 1.5; white-space: pre-wrap; }

/* chat */
.chat { display: flex; flex-direction: column; gap: 8px; }
.chat__msg { padding: 6px 8px; border-radius: 8px; max-width: 90%; }
.chat__msg--user { align-self: flex-end; background: var(--panel-edge); }
.chat__msg--assistant { align-self: flex-start; background: #0e1119; border: 1px solid var(--panel-edge); }
.chat__form { display: flex; gap: 6px; padding: 10px 14px; border-top: 1px solid var(--panel-edge); }
.chat__input { flex: 1; padding: 7px; border-radius: 6px; border: 1px solid var(--panel-edge); background: #0e1119; color: var(--ink); }

/* exit confirm */
.exit-confirm { width: 300px; text-align: center; }
.exit-confirm__actions { display: flex; justify-content: center; gap: 10px; margin-top: 14px; }
```

- [ ] **Step 6: Typecheck (with temporary stubs for RuntimeProvider/FloorScreen)**

Run: `npm run typecheck -w @trading-office/web`
Expected: clean once stubs exist.

- [ ] **Step 7: Manual verify outside + login + guard**

```bash
npm run dev -w @trading-office/web
```
Open http://localhost:5174. Verify: outside screen renders; clicking the door opens the login modal; "Enter the Lab" navigates to `/floor/trading-lab` (placeholder floor); manually visiting `/floor/trading-lab` in a fresh/incognito tab (no session) redirects to `/`. Stop the server.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app apps/web/src/App.tsx apps/web/src/main.tsx apps/web/src/styles.css
git commit -m "feat(web): router, session guard, AppShell topbar, base styles"
```

---

## Milestone 3 — Runtime data layer (gateway + store + bridge)

### Task 3.1: Shared runtime types

**Files:**
- Create: `apps/web/src/runtime/types.ts`

- [ ] **Step 1: Create `apps/web/src/runtime/types.ts`**

```ts
// Single source of truth for the status union lives in the kit; re-export it
// here so panels/store/gateway share exactly what scene.setAgentStatus expects.
import type { AgentStatus } from '@trading-office/office-visual-kit';

export type { AgentStatus };
export type AgentStatusMap = Record<string, AgentStatus>;

export interface TraceLine {
  ts: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  text: string;
}

export interface AgentActivity {
  agentId: string;
  status: AgentStatus;
  currentTask: string | null;
  logs: TraceLine[];
}

export interface Hypothesis {
  id: string;
  title: string;
  stage: 'proposed' | 'testing' | 'validated' | 'rejected';
  summary: string;
}

export interface BacktestSummary {
  id: string;
  strategy: string;
  symbol: string;
  period: string;
  pnlPct: number;
  sharpe: number;
  winRatePct: number;
  maxDrawdownPct: number;
}

export interface BotHealth {
  id: string;
  name: string;
  state: 'running' | 'paused' | 'error';
  uptime: string;
  lastHeartbeat: string;
}

export interface KnowledgeEntry {
  id: string;
  title: string;
  kind: 'doc' | 'experiment' | 'note';
  updated: string;
  tags: string[];
}

export interface InfraService {
  name: string;
  up: boolean;
  detail: string;
}

export interface InfraStatus {
  services: InfraService[];
  queues: { name: string; depth: number }[];
  lastSync: string;
}

export interface BossMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  ts: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/runtime/types.ts
git commit -m "feat(web): runtime data types"
```

### Task 3.2: OfficeGateway interface

**Files:**
- Create: `apps/web/src/runtime/OfficeGateway.ts`

- [ ] **Step 1: Create `apps/web/src/runtime/OfficeGateway.ts`**

```ts
import type {
  AgentActivity,
  AgentStatusMap,
  BacktestSummary,
  BossMessage,
  BotHealth,
  Hypothesis,
  InfraStatus,
  KnowledgeEntry,
} from './types';

/**
 * The single boundary the browser crosses for office data. Read-only except
 * sendBossCommand, which in Phase 1 is INERT (mock transcript only — no side
 * effects, no trading/platform actions). Phase 2 swaps the implementation for
 * a real office-gateway client; no panel changes required.
 */
export interface OfficeGateway {
  getAgentActivity(agentId: string): Promise<AgentActivity>;
  getHypotheses(): Promise<Hypothesis[]>;
  getBacktests(): Promise<BacktestSummary[]>;
  getBotHealth(): Promise<BotHealth[]>;
  getKnowledge(): Promise<KnowledgeEntry[]>;
  getInfraStatus(): Promise<InfraStatus>;
  sendBossCommand(text: string): Promise<BossMessage>;
  subscribeAgentStatuses?(cb: (statuses: AgentStatusMap) => void): () => void;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/runtime/OfficeGateway.ts
git commit -m "feat(web): read-only OfficeGateway interface"
```

### Task 3.3: Fixtures

**Files:**
- Create: `apps/web/src/runtime/fixtures.ts`

- [ ] **Step 1: Create `apps/web/src/runtime/fixtures.ts`**

```ts
import type {
  AgentActivity,
  AgentStatus,
  BacktestSummary,
  BotHealth,
  Hypothesis,
  InfraStatus,
  KnowledgeEntry,
} from './types';

export const INITIAL_STATUSES: Record<string, AgentStatus> = {
  boss: 'thinking',
  analyst: 'idle',
  researcher: 'thinking',
  critic: 'reviewing',
  builder: 'running',
  evaluator: 'backtesting',
  'perf-monitor': 'idle',
};

/** Plausible status loops per agent for the "simulate activity" toggle. */
export const STATUS_POOLS: Record<string, AgentStatus[]> = {
  boss: ['thinking', 'running', 'waiting', 'thinking'],
  analyst: ['thinking', 'reviewing', 'idle', 'success'],
  researcher: ['thinking', 'running', 'idle', 'thinking'],
  critic: ['reviewing', 'blocked', 'reviewing', 'idle'],
  builder: ['running', 'idle', 'success', 'running'],
  evaluator: ['backtesting', 'success', 'backtesting', 'failed'],
  'perf-monitor': ['idle', 'running', 'failed', 'running'],
};

const TASKS: Record<string, string> = {
  boss: 'Coordinating the BTC mean-reversion research sprint',
  analyst: 'Scoring 12 candidate features for regime detection',
  researcher: 'Sweeping lookback windows on the momentum signal',
  critic: 'Auditing risk on the latest strategy proposal',
  builder: 'Compiling strategy v0.4 into the backtest harness',
  evaluator: 'Running walk-forward backtest on ETH 4h',
  'perf-monitor': 'Watching live paper-trading drawdown',
};

export function agentActivity(agentId: string): AgentActivity {
  const status = INITIAL_STATUSES[agentId] ?? 'idle';
  return {
    agentId,
    status,
    currentTask: status === 'idle' ? null : (TASKS[agentId] ?? 'Working'),
    logs: [
      { ts: '09:41:02', level: 'info', text: `agent ${agentId} picked up task` },
      { ts: '09:41:08', level: 'debug', text: 'loaded dataset shard 3/8' },
      { ts: '09:41:15', level: 'info', text: 'evaluating candidate parameters' },
      { ts: '09:41:21', level: 'warn', text: 'sharpe below threshold on fold 2' },
      { ts: '09:41:30', level: 'info', text: 'continuing sweep' },
    ],
  };
}

export const HYPOTHESES: Hypothesis[] = [
  { id: 'h1', title: 'BTC funding-rate reversion', stage: 'testing', summary: 'Negative funding precedes short-horizon mean reversion.' },
  { id: 'h2', title: 'ETH volatility breakout', stage: 'proposed', summary: 'ATR expansion predicts trend continuation on 4h.' },
  { id: 'h3', title: 'Cross-asset lead-lag', stage: 'validated', summary: 'BTC moves lead alts by ~15m in high-vol regimes.' },
  { id: 'h4', title: 'Weekend liquidity fade', stage: 'rejected', summary: 'No durable edge after fees; drawdown too high.' },
];

export const BACKTESTS: BacktestSummary[] = [
  { id: 'b1', strategy: 'mr-funding', symbol: 'BTCUSDT', period: '2024-Q4', pnlPct: 12.4, sharpe: 1.8, winRatePct: 57, maxDrawdownPct: 6.2 },
  { id: 'b2', strategy: 'vol-breakout', symbol: 'ETHUSDT', period: '2024-Q4', pnlPct: 8.1, sharpe: 1.1, winRatePct: 49, maxDrawdownPct: 9.7 },
  { id: 'b3', strategy: 'lead-lag', symbol: 'SOLUSDT', period: '2024-Q4', pnlPct: -2.3, sharpe: -0.3, winRatePct: 44, maxDrawdownPct: 11.5 },
];

export const BOTS: BotHealth[] = [
  { id: 'bot1', name: 'paper-mr-funding', state: 'running', uptime: '3d 4h', lastHeartbeat: '2s ago' },
  { id: 'bot2', name: 'paper-vol-breakout', state: 'paused', uptime: '—', lastHeartbeat: '12m ago' },
  { id: 'bot3', name: 'shadow-lead-lag', state: 'error', uptime: '0m', lastHeartbeat: '4m ago' },
];

export const KNOWLEDGE: KnowledgeEntry[] = [
  { id: 'k1', title: 'Funding-rate reversion writeup', kind: 'doc', updated: '2026-06-10', tags: ['btc', 'reversion'] },
  { id: 'k2', title: 'Walk-forward harness notes', kind: 'note', updated: '2026-06-09', tags: ['backtest'] },
  { id: 'k3', title: 'Experiment 2026-06-08 vol breakout', kind: 'experiment', updated: '2026-06-08', tags: ['eth', 'breakout'] },
];

export const INFRA: InfraStatus = {
  services: [
    { name: 'office-gateway (mock)', up: true, detail: 'serving fixtures' },
    { name: 'market-data feed', up: true, detail: 'lag 120ms' },
    { name: 'backtest workers', up: true, detail: '3/3 healthy' },
    { name: 'archive store', up: false, detail: 'read-only snapshot' },
  ],
  queues: [
    { name: 'backtest-jobs', depth: 2 },
    { name: 'ingest', depth: 0 },
  ],
  lastSync: '09:41:30',
};

export function cannedBossReply(text: string): string {
  const t = text.toLowerCase();
  if (t.includes('status')) return 'All seven agents are active. Evaluator hit a failed fold; researcher is re-sweeping. (mock)';
  if (t.includes('pause') || t.includes('stop')) return 'No execution authority in Phase 1 — I can only report. Nothing was paused. (mock)';
  return `Acknowledged: "${text}". This is a mock office shell — no trading actions are taken. (mock)`;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/runtime/fixtures.ts
git commit -m "feat(web): mock fixtures for panels + status sim"
```

### Task 3.4: MockOfficeGateway — TDD

**Files:**
- Create: `apps/web/src/runtime/MockOfficeGateway.ts`
- Test: `apps/web/src/runtime/MockOfficeGateway.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/runtime/MockOfficeGateway.test.ts
import { describe, expect, it } from 'vitest';
import { MockOfficeGateway } from './MockOfficeGateway';

const gw = new MockOfficeGateway({ latencyMs: 0 });

describe('MockOfficeGateway', () => {
  it('returns agent activity with logs', async () => {
    const a = await gw.getAgentActivity('researcher');
    expect(a.agentId).toBe('researcher');
    expect(a.logs.length).toBeGreaterThan(0);
  });

  it('returns non-empty backtests with the right shape', async () => {
    const rows = await gw.getBacktests();
    expect(rows.length).toBeGreaterThan(0);
    expect(typeof rows[0]!.sharpe).toBe('number');
  });

  it('sendBossCommand returns an assistant message and is inert', async () => {
    const msg = await gw.sendBossCommand('pause all bots');
    expect(msg.role).toBe('assistant');
    expect(msg.text.toLowerCase()).toContain('no execution authority');
  });

  it('subscribeAgentStatuses can be unsubscribed', () => {
    const off = gw.subscribeAgentStatuses(() => {});
    expect(typeof off).toBe('function');
    off();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @trading-office/web`
Expected: FAIL — cannot find module `./MockOfficeGateway`.

- [ ] **Step 3: Implement `apps/web/src/runtime/MockOfficeGateway.ts`**

```ts
import type { OfficeGateway } from './OfficeGateway';
import type {
  AgentActivity,
  AgentStatusMap,
  BacktestSummary,
  BossMessage,
  BotHealth,
  Hypothesis,
  InfraStatus,
  KnowledgeEntry,
} from './types';
import {
  agentActivity,
  BACKTESTS,
  BOTS,
  cannedBossReply,
  HYPOTHESES,
  INFRA,
  INITIAL_STATUSES,
  KNOWLEDGE,
  STATUS_POOLS,
} from './fixtures';

let messageSeq = 0;

export class MockOfficeGateway implements OfficeGateway {
  private readonly latencyMs: number;
  private readonly tickMs: number;

  constructor(opts: { latencyMs?: number; tickMs?: number } = {}) {
    this.latencyMs = opts.latencyMs ?? 220;
    this.tickMs = opts.tickMs ?? 2600;
  }

  private delay<T>(value: T): Promise<T> {
    if (this.latencyMs <= 0) return Promise.resolve(value);
    return new Promise((resolve) => setTimeout(() => resolve(value), this.latencyMs));
  }

  getAgentActivity(agentId: string): Promise<AgentActivity> {
    return this.delay(agentActivity(agentId));
  }
  getHypotheses(): Promise<Hypothesis[]> {
    return this.delay(HYPOTHESES);
  }
  getBacktests(): Promise<BacktestSummary[]> {
    return this.delay(BACKTESTS);
  }
  getBotHealth(): Promise<BotHealth[]> {
    return this.delay(BOTS);
  }
  getKnowledge(): Promise<KnowledgeEntry[]> {
    return this.delay(KNOWLEDGE);
  }
  getInfraStatus(): Promise<InfraStatus> {
    return this.delay(INFRA);
  }

  sendBossCommand(text: string): Promise<BossMessage> {
    // INERT: returns a canned transcript reply only. No side effects.
    messageSeq += 1;
    const msg: BossMessage = {
      id: `m${messageSeq}`,
      role: 'assistant',
      text: cannedBossReply(text),
      ts: '09:42:00',
    };
    return this.delay(msg);
  }

  subscribeAgentStatuses(cb: (statuses: AgentStatusMap) => void): () => void {
    const ids = Object.keys(STATUS_POOLS);
    let tick = 0;
    const timer = setInterval(() => {
      tick += 1;
      const next: AgentStatusMap = { ...INITIAL_STATUSES };
      for (const id of ids) {
        const pool = STATUS_POOLS[id]!;
        next[id] = pool[tick % pool.length]!;
      }
      cb(next);
    }, this.tickMs);
    return () => clearInterval(timer);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -w @trading-office/web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/runtime/MockOfficeGateway.ts apps/web/src/runtime/MockOfficeGateway.test.ts
git commit -m "feat(web): MockOfficeGateway (fixtures + inert sendBossCommand + status sim)"
```

### Task 3.5: OfficeRuntimeStore — TDD

**Files:**
- Create: `apps/web/src/runtime/OfficeRuntimeStore.ts`
- Test: `apps/web/src/runtime/OfficeRuntimeStore.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/runtime/OfficeRuntimeStore.test.ts
import { describe, expect, it, vi } from 'vitest';
import { OfficeRuntimeStore } from './OfficeRuntimeStore';

describe('OfficeRuntimeStore', () => {
  it('starts empty and accepts a status map', () => {
    const s = new OfficeRuntimeStore();
    expect(s.getSnapshot().statuses).toEqual({});
    s.setStatuses({ boss: 'running' });
    expect(s.getSnapshot().statuses).toEqual({ boss: 'running' });
  });

  it('notifies subscribers on change and returns a stable snapshot otherwise', () => {
    const s = new OfficeRuntimeStore();
    const spy = vi.fn();
    const off = s.subscribe(spy);
    const before = s.getSnapshot();
    s.setStatus('boss', 'running');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(s.getSnapshot()).not.toBe(before);
    // same value → no new snapshot, no notify
    const after = s.getSnapshot();
    s.setStatus('boss', 'running');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(s.getSnapshot()).toBe(after);
    off();
  });

  it('stops notifying after unsubscribe', () => {
    const s = new OfficeRuntimeStore();
    const spy = vi.fn();
    s.subscribe(spy)();
    s.setStatus('boss', 'idle');
    expect(spy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @trading-office/web`
Expected: FAIL — cannot find module `./OfficeRuntimeStore`.

- [ ] **Step 3: Implement `apps/web/src/runtime/OfficeRuntimeStore.ts`**

```ts
import type { AgentStatus, AgentStatusMap } from './types';

export interface RuntimeState {
  statuses: AgentStatusMap;
}

export class OfficeRuntimeStore {
  private state: RuntimeState = { statuses: {} };
  private readonly listeners = new Set<() => void>();

  getSnapshot = (): RuntimeState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  setStatus(agentId: string, status: AgentStatus): void {
    if (this.state.statuses[agentId] === status) return;
    this.state = { statuses: { ...this.state.statuses, [agentId]: status } };
    this.emit();
  }

  setStatuses(statuses: AgentStatusMap): void {
    this.state = { statuses: { ...statuses } };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -w @trading-office/web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/runtime/OfficeRuntimeStore.ts apps/web/src/runtime/OfficeRuntimeStore.test.ts
git commit -m "feat(web): OfficeRuntimeStore (subscribable status source of truth)"
```

### Task 3.6: Bridge-seam + RuntimeContext provider

**Files:**
- Create: `apps/web/src/runtime/sceneBridge.ts`
- Create: `apps/web/src/runtime/RuntimeContext.tsx`

- [ ] **Step 1: Create `apps/web/src/runtime/sceneBridge.ts`**

```ts
import type { OfficeScene } from '@trading-office/office-visual-kit';
import type { OfficeRuntimeStore } from './OfficeRuntimeStore';

/**
 * The embryo of the future RuntimeSceneBridge: subscribes the scene to the
 * store and pushes every status into scene.setAgentStatus. React panels never
 * touch the scene — this seam does. Returns an unsubscribe.
 */
export function applyStatusToScene(
  scene: OfficeScene,
  store: OfficeRuntimeStore,
): () => void {
  const sync = () => {
    const { statuses } = store.getSnapshot();
    for (const [id, status] of Object.entries(statuses)) {
      scene.setAgentStatus(id, status);
    }
  };
  sync();
  return store.subscribe(sync);
}
```

- [ ] **Step 2: Create `apps/web/src/runtime/RuntimeContext.tsx`**

```tsx
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
```

- [ ] **Step 3: Remove the temporary `RuntimeProvider` stub** from Task 2.5 (App.tsx already imports the real one). Typecheck:

Run: `npm run typecheck -w @trading-office/web`
Expected: clean (FloorScreen stub may still exist until Milestone 4).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/runtime/sceneBridge.ts apps/web/src/runtime/RuntimeContext.tsx
git commit -m "feat(web): bridge-seam + runtime context (gateway + store + hooks)"
```

---

## Milestone 4 — Floor screen, canvas, loop-free reconciliation

### Task 4.1: Floor config + selection helpers (pure)

**Files:**
- Create: `apps/web/src/floor/floorConfig.ts`
- Create: `apps/web/src/floor/floorSelection.ts`

- [ ] **Step 1: Create `apps/web/src/floor/floorConfig.ts`**

```ts
import type { OfficeSceneConfig } from '@trading-office/office-visual-kit';
import {
  createTradingLabResearchFloorScene,
  type FloorThemeName,
} from '@trading-office/trading-lab-floor';

export const FLOOR_BASE_PATH = '/floor/trading-lab';

export function buildFloorConfig(theme: FloorThemeName): OfficeSceneConfig {
  return createTradingLabResearchFloorScene(theme);
}

/** Map panelTarget → object entity id, derived from the floor config objects. */
export function panelTargetToObjectId(config: OfficeSceneConfig): Record<string, string> {
  const map: Record<string, string> = {};
  for (const obj of config.objects) {
    if (obj.panelTarget) map[obj.panelTarget] = obj.id;
  }
  return map;
}
```

- [ ] **Step 2: Create `apps/web/src/floor/floorSelection.ts`**

```ts
export interface RouteSelection {
  agentId?: string;
  panelTarget?: string;
}

/** Stable string key for effect deps. */
export function selectionKey(sel: RouteSelection): string {
  return `${sel.agentId ?? ''}|${sel.panelTarget ?? ''}`;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/floor/floorConfig.ts apps/web/src/floor/floorSelection.ts
git commit -m "feat(web): floor config wrapper + route-selection helpers"
```

### Task 4.2: Panel registry — TDD

**Files:**
- Create: `apps/web/src/floor/panelRegistry.ts`
- Test: `apps/web/src/floor/panelRegistry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/floor/panelRegistry.test.ts
import { describe, expect, it } from 'vitest';
import { resolvePanel, selectedEntityId, type FloorAgentInfo } from './panelRegistry';

const agents: FloorAgentInfo[] = [
  { id: 'boss', role: 'boss' },
  { id: 'researcher', role: 'researcher' },
];
const targetToObject = { 'backtest-summary': 'wall-monitor', 'infra-status': 'server-rack' };

describe('resolvePanel', () => {
  it('routes the boss to the command panel', () => {
    expect(resolvePanel({ agentId: 'boss' }, agents)).toEqual({ kind: 'boss-command' });
  });
  it('routes other agents to the activity panel', () => {
    expect(resolvePanel({ agentId: 'researcher' }, agents)).toEqual({ kind: 'agent-activity', agentId: 'researcher' });
  });
  it('flags unknown agents', () => {
    expect(resolvePanel({ agentId: 'ghost' }, agents)).toEqual({ kind: 'unknown', key: 'agent:ghost' });
  });
  it('routes known object targets', () => {
    expect(resolvePanel({ panelTarget: 'backtest-summary' }, agents)).toEqual({ kind: 'object', panelTarget: 'backtest-summary' });
  });
  it('routes exit specially', () => {
    expect(resolvePanel({ panelTarget: 'exit' }, agents)).toEqual({ kind: 'exit' });
  });
  it('flags unknown object targets', () => {
    expect(resolvePanel({ panelTarget: 'nope' }, agents)).toEqual({ kind: 'unknown', key: 'panel:nope' });
  });
  it('returns none with no selection', () => {
    expect(resolvePanel({}, agents)).toEqual({ kind: 'none' });
  });
});

describe('selectedEntityId', () => {
  it('selects the boss agent', () => {
    expect(selectedEntityId({ kind: 'boss-command' }, targetToObject)).toBe('boss');
  });
  it('selects an agent', () => {
    expect(selectedEntityId({ kind: 'agent-activity', agentId: 'researcher' }, targetToObject)).toBe('researcher');
  });
  it('maps an object panel target to its entity id', () => {
    expect(selectedEntityId({ kind: 'object', panelTarget: 'infra-status' }, targetToObject)).toBe('server-rack');
  });
  it('selects nothing for exit / none / unknown', () => {
    expect(selectedEntityId({ kind: 'exit' }, targetToObject)).toBeNull();
    expect(selectedEntityId({ kind: 'none' }, targetToObject)).toBeNull();
    expect(selectedEntityId({ kind: 'unknown', key: 'x' }, targetToObject)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @trading-office/web`
Expected: FAIL — cannot find module `./panelRegistry`.

- [ ] **Step 3: Implement `apps/web/src/floor/panelRegistry.ts`**

```ts
import type { RouteSelection } from './floorSelection';

export interface FloorAgentInfo {
  id: string;
  role: string;
}

export type PanelKind =
  | { kind: 'boss-command' }
  | { kind: 'agent-activity'; agentId: string }
  | { kind: 'object'; panelTarget: string }
  | { kind: 'exit' }
  | { kind: 'none' }
  | { kind: 'unknown'; key: string };

const KNOWN_OBJECT_PANELS = new Set([
  'hypothesis-pipeline',
  'backtest-summary',
  'bot-health',
  'knowledge-base',
  'infra-status',
]);

export function resolvePanel(
  sel: RouteSelection,
  agents: FloorAgentInfo[],
): PanelKind {
  if (sel.agentId) {
    const agent = agents.find((a) => a.id === sel.agentId);
    if (!agent) return { kind: 'unknown', key: `agent:${sel.agentId}` };
    if (agent.role === 'boss') return { kind: 'boss-command' };
    return { kind: 'agent-activity', agentId: agent.id };
  }
  if (sel.panelTarget) {
    if (sel.panelTarget === 'exit') return { kind: 'exit' };
    if (KNOWN_OBJECT_PANELS.has(sel.panelTarget)) {
      return { kind: 'object', panelTarget: sel.panelTarget };
    }
    return { kind: 'unknown', key: `panel:${sel.panelTarget}` };
  }
  return { kind: 'none' };
}

/** The entity the scene should select/focus for a given panel (null = clear). */
export function selectedEntityId(
  kind: PanelKind,
  panelTargetToObjectId: Record<string, string>,
): string | null {
  switch (kind.kind) {
    case 'boss-command':
      return 'boss';
    case 'agent-activity':
      return kind.agentId;
    case 'object':
      return panelTargetToObjectId[kind.panelTarget] ?? null;
    default:
      return null;
  }
}

/** Panel kinds that occupy the right dock (exit/none never open the dock). */
export function opensDock(kind: PanelKind): boolean {
  return (
    kind.kind === 'boss-command' ||
    kind.kind === 'agent-activity' ||
    kind.kind === 'object' ||
    kind.kind === 'unknown'
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -w @trading-office/web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/floor/panelRegistry.ts apps/web/src/floor/panelRegistry.test.ts
git commit -m "feat(web): panel registry (route → panel; entity selection; dock predicate)"
```

### Task 4.3: FloorScreen — canvas mount + loop-free reconcile + camera

**Files:**
- Create: `apps/web/src/floor/FloorScreen.tsx`

This is the loop-free core. The scene emits user-intent events that only `navigate`; an effect reconciles the scene to the route inside a synchronous `reconciling` guard so the kit's echo events (`selectEntity` re-emits `agent:click`/`object:click`/`entity:select`) are ignored.

- [ ] **Step 1: Create `apps/web/src/floor/FloorScreen.tsx`**

```tsx
import type {
  AgentEntity,
  ObjectEntity,
  OfficeEntity,
  OfficeScene,
} from '@trading-office/office-visual-kit';
import { OfficeSceneCanvas } from '@trading-office/office-visual-kit/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMatch, useNavigate } from 'react-router-dom';
import { type FloorThemeName } from '@trading-office/trading-lab-floor';
import { useGateway, useRuntimeStore } from '../runtime/RuntimeContext';
import { applyStatusToScene } from '../runtime/sceneBridge';
import { INITIAL_STATUSES } from '../runtime/fixtures';
import { buildFloorConfig, FLOOR_BASE_PATH, panelTargetToObjectId } from './floorConfig';
import { selectionKey, type RouteSelection } from './floorSelection';
import {
  opensDock,
  resolvePanel,
  selectedEntityId,
  type FloorAgentInfo,
} from './panelRegistry';
import { PanelDock } from './PanelDock';
import { ExitConfirm } from './ExitConfirm';

export function FloorScreen({
  themeName = 'day',
  simulate = false,
}: {
  themeName?: FloorThemeName;
  simulate?: boolean;
}) {
  const navigate = useNavigate();
  const store = useRuntimeStore();
  const gateway = useGateway();

  const config = useMemo(() => buildFloorConfig(themeName), [themeName]);
  const targetToObject = useMemo(() => panelTargetToObjectId(config), [config]);
  const agentInfos = useMemo<FloorAgentInfo[]>(
    () => config.agents.map((a) => ({ id: a.id, role: a.role })),
    [config],
  );

  const [scene, setScene] = useState<OfficeScene | null>(null);
  const reconciling = useRef(false);
  const [error, setError] = useState<Error | null>(null);

  // Route → selection
  const agentMatch = useMatch(`${FLOOR_BASE_PATH}/agent/:agentId`);
  const panelMatch = useMatch(`${FLOOR_BASE_PATH}/panel/:panelTarget`);
  const sel: RouteSelection = {
    agentId: agentMatch?.params.agentId,
    panelTarget: panelMatch?.params.panelTarget,
  };
  const panelKind = resolvePanel(sel, agentInfos);
  const selKey = selectionKey(sel);

  // Intent handlers — ONLY navigate; ignored while reconciling (echo guard).
  const onAgentClick = useCallback(
    (agent: AgentEntity) => {
      if (reconciling.current) return;
      navigate(`${FLOOR_BASE_PATH}/agent/${agent.id}`);
    },
    [navigate],
  );
  const onObjectClick = useCallback(
    (object: ObjectEntity) => {
      if (reconciling.current) return;
      if (!object.panelTarget) return;
      navigate(`${FLOOR_BASE_PATH}/panel/${object.panelTarget}`);
    },
    [navigate],
  );
  const onEntitySelect = useCallback(
    (entity: OfficeEntity | null) => {
      if (reconciling.current) return;
      if (entity === null) navigate(FLOOR_BASE_PATH);
    },
    [navigate],
  );

  // Theme switch remounts the canvas (key={themeName}) → a NEW OfficeScene.
  // Hold the scene in STATE (not a ref): updating it re-runs the bridge +
  // reconcile effects against the new instance and tears down the old ones.
  const handleSceneReady = useCallback((next: OfficeScene) => {
    setScene(next);
  }, []);

  // Bridge-seam: store → scene. Re-binds whenever the scene INSTANCE changes
  // (e.g. after a Day/Night remount); the cleanup unsubscribes the old scene.
  useEffect(() => {
    if (!scene) return;
    return applyStatusToScene(scene, store);
  }, [scene, store]);

  // Reconcile the scene to the route. Depends on the scene INSTANCE, so a
  // Day/Night remount re-applies the current route selection to the new scene.
  // The reconciling guard makes the kit's synchronous echo events
  // (agent:click/object:click/entity:select fired from selectEntity) no-ops,
  // so route → scene never loops back into navigate.
  useEffect(() => {
    if (!scene) return;
    const id = selectedEntityId(resolvePanel(sel, agentInfos), targetToObject);
    reconciling.current = true;
    try {
      scene.selectEntity(id);
      if (id) scene.focusEntity(id);
    } finally {
      reconciling.current = false;
    }
    // selKey captures sel; agentInfos/targetToObject are config-stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, selKey]);

  // Status simulation toggle (topbar). On → gateway pushes statuses into the
  // store (which the bridge-seam propagates to the scene + panels). Off → reset.
  useEffect(() => {
    if (!simulate) {
      store.setStatuses(INITIAL_STATUSES);
      return;
    }
    if (!gateway.subscribeAgentStatuses) return;
    const off = gateway.subscribeAgentStatuses((statuses) => store.setStatuses(statuses));
    return off;
  }, [simulate, gateway, store]);

  return (
    <div className="floor">
      <div className="floor__canvas">
        <OfficeSceneCanvas
          key={themeName}
          config={config}
          onSceneReady={handleSceneReady}
          onSceneError={setError}
          onAgentClick={onAgentClick}
          onObjectClick={onObjectClick}
          onEntitySelect={onEntitySelect}
        />
      </div>

      <PanelDock
        open={opensDock(panelKind)}
        panelKind={panelKind}
        onClose={() => navigate(FLOOR_BASE_PATH)}
      />

      {panelKind.kind === 'exit' && (
        <ExitConfirm
          onConfirm={() => navigate('/')}
          onCancel={() => navigate(FLOOR_BASE_PATH)}
        />
      )}

      {error && (
        <div className="scene-error">
          <strong>Scene failed to load</strong>
          <pre>{error.message}</pre>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire theme + sim from AppShell into the route**

Update `apps/web/src/App.tsx` to lift `themeName`/`simulate` and wrap the floor route in `AppShell`. Replace the floor `<Route element>` with a small inline component:

```tsx
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
```

- [ ] **Step 3: Typecheck** (PanelDock/ExitConfirm created next task — expect missing-module errors until Task 5.1–5.2, then re-run)

Run: `npm run typecheck -w @trading-office/web`
Expected after Milestone 5: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/floor/FloorScreen.tsx apps/web/src/App.tsx
git commit -m "feat(web): FloorScreen with loop-free route↔scene reconcile + camera + bridge"
```

---

## Milestone 5 — Panel dock, panels, exit-flow (no flicker)

### Task 5.1: PanelChrome + useResource hook

**Files:**
- Create: `apps/web/src/floor/panels/PanelChrome.tsx`
- Create: `apps/web/src/floor/panels/useResource.ts`

- [ ] **Step 1: Create `apps/web/src/floor/panels/useResource.ts`**

```ts
import { useEffect, useState } from 'react';

export interface ResourceState<T> {
  loading: boolean;
  error: Error | null;
  data: T | null;
}

export function useResource<T>(
  fetcher: () => Promise<T>,
  deps: readonly unknown[],
): ResourceState<T> {
  const [state, setState] = useState<ResourceState<T>>({
    loading: true,
    error: null,
    data: null,
  });

  useEffect(() => {
    let alive = true;
    setState({ loading: true, error: null, data: null });
    fetcher().then(
      (data) => alive && setState({ loading: false, error: null, data }),
      (error: Error) => alive && setState({ loading: false, error, data: null }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
```

- [ ] **Step 2: Create `apps/web/src/floor/panels/PanelChrome.tsx`**

```tsx
import { type ReactNode } from 'react';

export function PanelChrome({
  title,
  badge,
  onClose,
  children,
}: {
  title: string;
  badge?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <header className="panel__head">
        <h2 className="panel__title">{title}</h2>
        {badge && <span className="panel__badge">{badge}</span>}
        <button className="panel__close" onClick={onClose} aria-label="Close panel">
          ×
        </button>
      </header>
      <div className="panel__body">{children}</div>
    </section>
  );
}

export function PanelState({ resource }: { resource: { loading: boolean; error: Error | null } }) {
  if (resource.loading) return <p className="panel__state">Loading…</p>;
  if (resource.error) return <p className="panel__state">Failed: {resource.error.message}</p>;
  return null;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/floor/panels/PanelChrome.tsx apps/web/src/floor/panels/useResource.ts
git commit -m "feat(web): shared panel chrome + resource-fetch hook"
```

### Task 5.2: The object/agent panels

**Files:**
- Create: `apps/web/src/floor/panels/AgentActivityPanel.tsx`
- Create: `apps/web/src/floor/panels/BossCommandPanel.tsx`
- Create: `apps/web/src/floor/panels/HypothesisPanel.tsx`
- Create: `apps/web/src/floor/panels/BacktestPanel.tsx`
- Create: `apps/web/src/floor/panels/BotHealthPanel.tsx`
- Create: `apps/web/src/floor/panels/KnowledgePanel.tsx`
- Create: `apps/web/src/floor/panels/InfraStatusPanel.tsx`
- Create: `apps/web/src/floor/panels/UnknownPanel.tsx`

- [ ] **Step 1: `AgentActivityPanel.tsx`** (status pill from the store; activity from the gateway)

```tsx
import { useGateway, useAgentStatuses } from '../../runtime/RuntimeContext';
import { PanelChrome, PanelState } from './PanelChrome';
import { useResource } from './useResource';

export function AgentActivityPanel({ agentId, onClose }: { agentId: string; onClose: () => void }) {
  const gateway = useGateway();
  const statuses = useAgentStatuses();
  const res = useResource(() => gateway.getAgentActivity(agentId), [agentId]);
  const status = statuses[agentId] ?? res.data?.status ?? 'idle';

  return (
    <PanelChrome title={`Agent · ${agentId}`} onClose={onClose}>
      <div className="row">
        <span>Status</span>
        <span className="status-pill">{status}</span>
      </div>
      <PanelState resource={res} />
      {res.data && (
        <>
          <p className="row"><span>Task</span><span>{res.data.currentTask ?? '—'}</span></p>
          <h3>Logs / traces</h3>
          <div className="trace">
            {res.data.logs.map((l, i) => (
              <div key={i}>{l.ts} [{l.level}] {l.text}</div>
            ))}
          </div>
        </>
      )}
    </PanelChrome>
  );
}
```

- [ ] **Step 2: `BossCommandPanel.tsx`** (mock chat; the required no-execution badge)

```tsx
import { useState, type FormEvent } from 'react';
import { useGateway } from '../../runtime/RuntimeContext';
import type { BossMessage } from '../../runtime/types';
import { PanelChrome } from './PanelChrome';

export function BossCommandPanel({ onClose }: { onClose: () => void }) {
  const gateway = useGateway();
  const [messages, setMessages] = useState<BossMessage[]>([]);
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);

  async function send(e: FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    const user: BossMessage = { id: `u${messages.length}`, role: 'user', text: trimmed, ts: '' };
    setMessages((m) => [...m, user]);
    setText('');
    setPending(true);
    const reply = await gateway.sendBossCommand(trimmed);
    setMessages((m) => [...m, reply]);
    setPending(false);
  }

  return (
    <PanelChrome title="Boss · Orchestrator" badge="mock · no execution authority" onClose={onClose}>
      <div className="chat">
        {messages.length === 0 && <p className="panel__state">Ask for a status report. Commands are mock-only.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`chat__msg chat__msg--${m.role}`}>{m.text}</div>
        ))}
        {pending && <div className="chat__msg chat__msg--assistant">…</div>}
      </div>
      <form className="chat__form" onSubmit={send}>
        <input className="chat__input" value={text} placeholder="Message the orchestrator…" onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="btn btn--primary" disabled={pending}>Send</button>
      </form>
    </PanelChrome>
  );
}
```

- [ ] **Step 3: `HypothesisPanel.tsx`**

```tsx
import { useGateway } from '../../runtime/RuntimeContext';
import { PanelChrome, PanelState } from './PanelChrome';
import { useResource } from './useResource';

export function HypothesisPanel({ onClose }: { onClose: () => void }) {
  const gateway = useGateway();
  const res = useResource(() => gateway.getHypotheses(), []);
  return (
    <PanelChrome title="Hypotheses" onClose={onClose}>
      <PanelState resource={res} />
      {res.data?.map((h) => (
        <div key={h.id} className="row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <div className="row"><strong>{h.title}</strong><span className="tag">{h.stage}</span></div>
          <span className="panel__state">{h.summary}</span>
        </div>
      ))}
    </PanelChrome>
  );
}
```

- [ ] **Step 4: `BacktestPanel.tsx`**

```tsx
import { useGateway } from '../../runtime/RuntimeContext';
import { PanelChrome, PanelState } from './PanelChrome';
import { useResource } from './useResource';

export function BacktestPanel({ onClose }: { onClose: () => void }) {
  const gateway = useGateway();
  const res = useResource(() => gateway.getBacktests(), []);
  return (
    <PanelChrome title="Backtests" onClose={onClose}>
      <PanelState resource={res} />
      {res.data?.map((b) => (
        <div key={b.id} className="row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <div className="row"><strong>{b.strategy}</strong><span className="tag">{b.symbol} · {b.period}</span></div>
          <span className="panel__state">
            PnL {b.pnlPct}% · Sharpe {b.sharpe} · Win {b.winRatePct}% · MaxDD {b.maxDrawdownPct}%
          </span>
        </div>
      ))}
    </PanelChrome>
  );
}
```

- [ ] **Step 5: `BotHealthPanel.tsx`**

```tsx
import { useGateway } from '../../runtime/RuntimeContext';
import { PanelChrome, PanelState } from './PanelChrome';
import { useResource } from './useResource';

export function BotHealthPanel({ onClose }: { onClose: () => void }) {
  const gateway = useGateway();
  const res = useResource(() => gateway.getBotHealth(), []);
  return (
    <PanelChrome title="Bot status" onClose={onClose}>
      <PanelState resource={res} />
      {res.data?.map((bot) => (
        <div key={bot.id} className="row">
          <span>{bot.name}</span>
          <span className="tag">{bot.state} · up {bot.uptime} · {bot.lastHeartbeat}</span>
        </div>
      ))}
    </PanelChrome>
  );
}
```

- [ ] **Step 6: `KnowledgePanel.tsx`** (with a simple filter)

```tsx
import { useState } from 'react';
import { useGateway } from '../../runtime/RuntimeContext';
import { PanelChrome, PanelState } from './PanelChrome';
import { useResource } from './useResource';

export function KnowledgePanel({ onClose }: { onClose: () => void }) {
  const gateway = useGateway();
  const res = useResource(() => gateway.getKnowledge(), []);
  const [q, setQ] = useState('');
  const rows = (res.data ?? []).filter((k) => k.title.toLowerCase().includes(q.toLowerCase()));
  return (
    <PanelChrome title="Archive / Knowledge" onClose={onClose}>
      <input className="login__input" placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />
      <PanelState resource={res} />
      {rows.map((k) => (
        <div key={k.id} className="row">
          <span>{k.title}</span>
          <span className="tag">{k.kind} · {k.updated}</span>
        </div>
      ))}
    </PanelChrome>
  );
}
```

- [ ] **Step 7: `InfraStatusPanel.tsx`**

```tsx
import { useGateway } from '../../runtime/RuntimeContext';
import { PanelChrome, PanelState } from './PanelChrome';
import { useResource } from './useResource';

export function InfraStatusPanel({ onClose }: { onClose: () => void }) {
  const gateway = useGateway();
  const res = useResource(() => gateway.getInfraStatus(), []);
  return (
    <PanelChrome title="Data node / Infra" onClose={onClose}>
      <PanelState resource={res} />
      {res.data && (
        <>
          <h3>Services</h3>
          {res.data.services.map((s) => (
            <div key={s.name} className="row">
              <span>{s.up ? '🟢' : '🔴'} {s.name}</span>
              <span className="panel__state">{s.detail}</span>
            </div>
          ))}
          <h3>Queues</h3>
          {res.data.queues.map((qd) => (
            <div key={qd.name} className="row"><span>{qd.name}</span><span className="tag">{qd.depth}</span></div>
          ))}
          <p className="panel__state">last sync {res.data.lastSync}</p>
        </>
      )}
    </PanelChrome>
  );
}
```

- [ ] **Step 8: `UnknownPanel.tsx`**

```tsx
import { PanelChrome } from './PanelChrome';

export function UnknownPanel({ panelKey, onClose }: { panelKey: string; onClose: () => void }) {
  return (
    <PanelChrome title="Not available" onClose={onClose}>
      <p className="panel__state">No panel is registered for “{panelKey}”.</p>
    </PanelChrome>
  );
}
```

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/floor/panels
git commit -m "feat(web): agent/boss + object panels (mock-first) with loading/error states"
```

### Task 5.3: PanelDock host (no-flicker open derivation)

**Files:**
- Create: `apps/web/src/floor/PanelDock.tsx`

The dock's `data-open` is derived **synchronously** from the panel kind (exit/none never open it), so routing the door through to the exit overlay never momentarily opens the dock — no flicker. The dock element stays mounted and slides via CSS transform; its content is keyed by panel kind.

- [ ] **Step 1: Create `apps/web/src/floor/PanelDock.tsx`**

```tsx
import { type ReactElement } from 'react';
import { type PanelKind } from './panelRegistry';
import { AgentActivityPanel } from './panels/AgentActivityPanel';
import { BossCommandPanel } from './panels/BossCommandPanel';
import { HypothesisPanel } from './panels/HypothesisPanel';
import { BacktestPanel } from './panels/BacktestPanel';
import { BotHealthPanel } from './panels/BotHealthPanel';
import { KnowledgePanel } from './panels/KnowledgePanel';
import { InfraStatusPanel } from './panels/InfraStatusPanel';
import { UnknownPanel } from './panels/UnknownPanel';

const OBJECT_PANELS: Record<string, (onClose: () => void) => ReactElement> = {
  'hypothesis-pipeline': (onClose) => <HypothesisPanel onClose={onClose} />,
  'backtest-summary': (onClose) => <BacktestPanel onClose={onClose} />,
  'bot-health': (onClose) => <BotHealthPanel onClose={onClose} />,
  'knowledge-base': (onClose) => <KnowledgePanel onClose={onClose} />,
  'infra-status': (onClose) => <InfraStatusPanel onClose={onClose} />,
};

function renderPanel(panelKind: PanelKind, onClose: () => void) {
  switch (panelKind.kind) {
    case 'boss-command':
      return <BossCommandPanel onClose={onClose} />;
    case 'agent-activity':
      return <AgentActivityPanel agentId={panelKind.agentId} onClose={onClose} />;
    case 'object':
      return (OBJECT_PANELS[panelKind.panelTarget] ?? ((c: () => void) => (
        <UnknownPanel panelKey={panelKind.panelTarget} onClose={c} />
      )))(onClose);
    case 'unknown':
      return <UnknownPanel panelKey={panelKind.key} onClose={onClose} />;
    default:
      return null;
  }
}

/** Stable key so dock content remounts per distinct panel (not on every render). */
function panelContentKey(panelKind: PanelKind): string {
  switch (panelKind.kind) {
    case 'boss-command': return 'boss';
    case 'agent-activity': return `agent:${panelKind.agentId}`;
    case 'object': return `obj:${panelKind.panelTarget}`;
    case 'unknown': return `unknown:${panelKind.key}`;
    default: return 'none';
  }
}

export function PanelDock({
  open,
  panelKind,
  onClose,
}: {
  open: boolean;
  panelKind: PanelKind;
  onClose: () => void;
}) {
  return (
    <aside className="dock" data-open={open} aria-hidden={!open}>
      {open && <div key={panelContentKey(panelKind)} className="dock__content">{renderPanel(panelKind, onClose)}</div>}
    </aside>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/floor/PanelDock.tsx
git commit -m "feat(web): right panel dock with synchronous no-flicker open derivation"
```

### Task 5.4: ExitConfirm overlay (separate from the dock)

**Files:**
- Create: `apps/web/src/floor/ExitConfirm.tsx`

Exit is a centered overlay, NOT a dock panel — this is what keeps the exit flow flicker-free (the dock never opens for `exit`). Confirm returns to the lobby `/` (session kept); cancel returns to the floor base route.

- [ ] **Step 1: Create `apps/web/src/floor/ExitConfirm.tsx`**

```tsx
export function ExitConfirm({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div className="modal exit-confirm" role="dialog" aria-label="Leave floor" onClick={(e) => e.stopPropagation()}>
        <h2>Return to lobby?</h2>
        <p className="panel__state">You stay signed in — re-enter through the door anytime.</p>
        <div className="exit-confirm__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>Stay</button>
          <button type="button" className="btn btn--primary" onClick={onConfirm}>Return to lobby</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck the whole app**

Run: `npm run typecheck -w @trading-office/web`
Expected: clean (apply the `ReactElement`/`useGateway` notes from Tasks 4.3/5.3 if the compiler flags them).

- [ ] **Step 3: Run all unit tests**

Run: `npm test -w @trading-office/web`
Expected: PASS — session (6) + gateway (4) + store (3) + registry (10).

- [ ] **Step 4: Manual verification of the full flow**

```bash
npm run dev -w @trading-office/web
```
At http://localhost:5174 verify, end-to-end:
1. Door → login → floor.
2. Click each agent → right dock opens with the correct panel; camera focuses the agent; the dock does not flicker.
3. Click Boss → command panel with the `mock · no execution authority` badge; send "status" → canned reply; send "pause bots" → "no execution authority" reply.
4. Click each object (Hypothesis/Backtests/Bot Status/Archive/Server Rack) → correct panel; object label/highlight follows.
5. Click the entrance Door on the floor → **centered** Return-to-lobby confirm appears, the dock does **not** open or flicker → confirm returns to `/`; you remain signed in (door → straight back to floor).
6. Click empty floor → dock closes (route returns to base).
7. Toggle "simulate activity" → badges animate; agent panel status pill updates live.
8. Toggle Day/Night → canvas remounts cleanly; theme applies.
9. "Log out" → returns to `/`; door now requires login again.
Stop the server.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/floor/ExitConfirm.tsx
git commit -m "feat(web): flicker-free exit-flow overlay (return to lobby, session kept)"
```

---

## Milestone 6 — Wiring polish, README, final verification

### Task 6.1: Root scripts + README updates

**Files:**
- Modify: `package.json` (root scripts)
- Modify: `README.md`
- Create: `apps/web/README.md`

- [ ] **Step 1: Update root `package.json` scripts**

Replace the root `scripts` block with:

```json
  "scripts": {
    "dev": "npm run dev -w @trading-office/web",
    "dev:preview": "npm run dev -w trading-lab-research-floor",
    "build": "npm run build --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "test": "npm test -w @trading-office/web",
    "generate": "npm run generate -w @trading-office/trading-lab-floor",
    "verify:assets": "node tools/sync-floor-public.mjs apps/web/public --check && node tools/sync-floor-public.mjs examples/trading-lab-research-floor/public --check"
  },
```

- [ ] **Step 2: Update root `README.md`**

Replace the "Phase 0 — Office Visual Builder Kit" intro paragraph's scope and the path table + quick start so they describe Phase 1. Apply these edits:

Change the opening under the title to:

```markdown
`trading-office` is a visual frontend / control-room layer. It has **no execution
authority**: `trading-platform` stays the execution/data authority, `trading-lab`
is the first connected agent system ("first floor").

## Phases

- **Phase 0 — Office Visual Builder Kit** (frozen): a reusable visual constructor
  for pixel-art office floors, plus one reviewable example floor.
- **Phase 1 — Application Shell** (current): a production-facing app
  (`apps/web`) around the kit — an outside establishing screen, mock login, and
  the Trading Lab floor with a real panel router. Mock-first, no backend, no
  execution authority. See
  `docs/superpowers/specs/2026-06-13-trading-office-phase-1-app-shell-design.md`.
```

Replace the path table with:

```markdown
| Path | What it is |
| --- | --- |
| `apps/web/` | Phase 1 application shell: outside scene, mock login, floor + panel router (consumes the kit + floor package) |
| `packages/office-visual-kit/` | The kit: PixiJS v8 renderer core, Tiled loader, scene schema, asset registry, interaction, camera, React wrapper |
| `packages/trading-lab-floor/` | Single source of truth for the Trading Lab floor: scene config, Tiled maps, assets, generators |
| `examples/trading-lab-research-floor/` | Technical preview of the floor (DebugCard overlay) — consumes `packages/trading-lab-floor` |
| `packages/office-visual-kit/docs/` | Kit documentation incl. Tiled conventions and the Superpowers handoff |
| `docs/superpowers/` | Phase specs and implementation plans |
```

Replace the "Quick start" body with:

```markdown
## Quick start

```bash
npm install
npm run dev          # the app shell (apps/web) → http://localhost:5174
npm run dev:preview  # the kit floor preview → http://localhost:5173
```

Open the app at http://localhost:5174: click the building door to sign in
(mock), then explore the Trading Lab floor — click agents and objects to open
panels in the right dock; the entrance door returns you to the lobby.

Other commands:

```bash
npm run build         # typecheck + build all workspaces
npm test              # unit tests for the app's runtime/session/registry logic
npm run generate      # regenerate the floor's pixel assets + Tiled maps
npm run verify:assets # fail if any consumer's synced floor assets drifted
```
```

Update the "What is intentionally NOT here" section heading + body to reflect Phase 1 (frontend-only, mock gateway, no real auth/backend):

```markdown
## What is intentionally NOT here (Phase 1)

No backend (Hono), no Postgres, no real auth, no real `trading-lab` API, no
SSE/WebSocket, no execution authority, no direct `trading-platform` access. The
app talks only to a mock `OfficeGateway`; live data and a real gateway are a
later phase. See the Phase 1 spec under `docs/superpowers/`.
```

- [ ] **Step 3: Create `apps/web/README.md`**

```markdown
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
- `sendBossCommand` is **inert** in Phase 1 (mock transcript only).

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
                          floorConfig/floorSelection, panels/*
```

Floor maps/assets are synced from `@trading-office/trading-lab-floor` into
`public/` on `predev`/`prebuild` (`tools/sync-floor-public.mjs`); those copies
are git-ignored generated artifacts.
```

- [ ] **Step 4: Commit**

```bash
git add package.json README.md apps/web/README.md
git commit -m "docs: document Phase 1 app shell; root scripts for app + asset verify"
```

### Task 6.2: Final full-repo verification

- [ ] **Step 1: Asset-sync drift guard**

```bash
npm run verify:assets
```
Expected: `floor assets in sync ✓` for both consumers (exit 0).

- [ ] **Step 2: Typecheck + tests + builds across the repo**

```bash
npm run typecheck
npm test
npm run build
```
Expected: typecheck clean for every workspace; all unit tests pass; both the app and the example build.

- [ ] **Step 3: Confirm the example preview is intact**

```bash
npm run dev:preview
```
Open http://localhost:5173 — the floor renders with the DebugCard (the technical preview is unchanged in behavior). Stop the server.

- [ ] **Step 4: Confirm no synced artifacts were committed**

```bash
git status --porcelain
git ls-files apps/web/public/maps examples/trading-lab-research-floor/public/maps
```
Expected: working tree clean; the `ls-files` returns **nothing** (synced maps/assets are git-ignored, not tracked).

- [ ] **Step 5: Final commit (if anything pending) and branch summary**

```bash
git add -A
git commit -m "chore(phase-1): final verification pass" --allow-empty
git log --oneline main..HEAD
```

---

## Self-review notes (author → executor)

**Spec coverage** — every spec section maps to a task:
- §1 repo structure → M1 (package extract) + M2.1 (app scaffold).
- §1 floor-reuse ownership rules → Tasks 1.2–1.4 (single source of truth, consumers, no import-from-examples, git-ignored synced artifacts).
- §1 asset-sync → Task 1.3 + the `.gitignore`s + `verify:assets` (Tasks 2.1, 6.1, 6.2). **(explicit user add: asset-sync verification/gitignore)**
- §2 data layer → M3 (types, gateway, mock, fixtures, store, bridge, context).
- §3 navigation & session → 2.2/2.3 (session), 2.5 (router + guard).
- §4 outside + login → 2.4.
- §5 door/exit table → OutsideScreen (2.4), FloorScreen exit route (4.3), ExitConfirm (5.4), logout (AppShell 2.5).
- §6 floor + reconcile + dock + registry → 4.1–4.3, 5.1–5.3.
- §6 production-not-preview chrome → AppShell + FloorScreen (no DebugCard/hintbar); example keeps its preview chrome (1.4).
- §7 panel inventory → 5.2 (eight panels) + 5.3 dock mapping.
- §7 sendBossCommand inert + badge → MockOfficeGateway (3.4) + BossCommandPanel badge (5.2).
- §8 no execution authority → gateway read-only; no trading-* imports anywhere.
- §10 tests → TDD tasks 2.2, 3.4, 3.5, 4.2 (the four units only); manual verification 5.4/6.2. **(no heavy Pixi tests)**
- **README update** → Task 6.1. **(explicit user add)**
- **Exit-flow without dock flicker** → Task 5.3 (synchronous `opensDock` excludes exit) + Task 5.4 (separate overlay). **(explicit user add)**

**Type consistency** — names used consistently across tasks: `OfficeGateway`, `MockOfficeGateway`, `OfficeRuntimeStore` (`getSnapshot`/`subscribe`/`setStatus`/`setStatuses`), `applyStatusToScene`, `resolvePanel`/`selectedEntityId`/`opensDock`/`PanelKind`/`FloorAgentInfo`, `RouteSelection`/`selectionKey`, `buildFloorConfig`/`panelTargetToObjectId`/`FLOOR_BASE_PATH`, `useGateway`/`useRuntimeStore`/`useAgentStatuses`, `INITIAL_STATUSES`/`STATUS_POOLS`. Panel components share the `{ onClose }` prop shape (+ `agentId`/`panelKey` where noted).

**Cross-file ordering:** `App.tsx` is created in Task 2.5 (importing not-yet-existing `RuntimeProvider`/`FloorScreen` — stub them per the note) and finalized in Task 4.3 Step 2; `FloorScreen` references `PanelDock`/`ExitConfirm` created in Milestone 5, so the full app typecheck (Task 5.4 Step 2) is the first point everything resolves. Each milestone is independently committable; intermediate typecheck failures from forward references are expected and called out where they occur.
