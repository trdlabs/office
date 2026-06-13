import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = dirname(fileURLToPath(import.meta.url));
const ALLOWED = new Set(['@trading-office/office-gateway']);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.ts$/.test(p) ? [p] : [];
  });
}
function specifiers(src: string): string[] {
  return [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);
}

describe('office-fixtures is pure data', () => {
  it.each(walk(SRC).filter((f) => !/\.test\.ts$/.test(f)))('%s imports only the contract', (file) => {
    for (const spec of specifiers(readFileSync(file, 'utf8'))) {
      if (spec.startsWith('.')) continue;
      expect(ALLOWED.has(spec), `forbidden import: ${spec}`).toBe(true);
    }
  });
});
