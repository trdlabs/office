import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENV_SPECS } from './env';

// Гейт «Полнота схемы» (env-catalog item 5): env.ts — единственная точка чтения
// process.env в репо; всё, что читает переменные окружения, обязано быть
// объявлено в схеме. Красный тест = красный CI.

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..'); // apps/server/src -> repo root

const SCAN_DIRS = ['apps', 'packages', 'tools'];
const SOURCE_RE = /\.(ts|tsx|mts|cts|mjs|cjs|js|jsx)$/;

// Единственная легальная точка чтения process.env.
const ENV_TS = 'apps/server/src/env.ts';
// Осознанные исключения (каждое — объявлено в схеме как declaration-only):
// - compose-lpc-agents.mjs: build-тул пакета floor (ULPC_DIR), node-скрипт вне
//   TS-графа сервера; переменная объявлена в схеме, точка чтения остаётся тулом.
const ALLOWLIST = new Set(['packages/trading-lab-floor/tools/compose-lpc-agents.mjs']);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) return [];
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : SOURCE_RE.test(p) ? [p] : [];
  });
}

const allSources = SCAN_DIRS.flatMap((d) => {
  try {
    return walk(join(REPO_ROOT, d));
  } catch {
    return [];
  }
});

describe('полнота env-схемы (единственная точка чтения)', () => {
  it('process.env не читается нигде, кроме env.ts (+ явный allowlist)', () => {
    const offenders: string[] = [];
    for (const file of allSources) {
      const rel = relative(REPO_ROOT, file).replaceAll('\\', '/');
      if (rel === ENV_TS || ALLOWLIST.has(rel) || /\.test\.(ts|tsx)$/.test(rel)) continue;
      // комментарии не считаются чтением — вырезаем их перед матчем
      const src = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
      if (/process\.env\b/.test(src)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it('каждая VITE_*-переменная, встречающаяся в web-исходниках, объявлена в схеме', () => {
    const declared = new Set(ENV_SPECS.map((s) => s.name));
    const used = new Set<string>();
    for (const file of allSources) {
      if (!/apps\/web\//.test(file.replaceAll('\\', '/'))) continue;
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/VITE_[A-Z0-9_]+/g)) used.add(m[0]);
    }
    expect(used.size).toBeGreaterThan(0);
    for (const name of used) {
      expect(declared.has(name), `${name} используется в web, но не объявлена в env-схеме`).toBe(true);
    }
  });

  it('в allowlist нет мёртвых записей', () => {
    for (const rel of ALLOWLIST) {
      const src = readFileSync(join(REPO_ROOT, rel), 'utf8');
      expect(/process\.env\b/.test(src), `${rel} больше не читает process.env — убери из allowlist`).toBe(true);
    }
  });
});
