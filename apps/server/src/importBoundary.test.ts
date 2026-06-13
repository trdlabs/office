import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = dirname(fileURLToPath(import.meta.url)); // apps/server/src

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.ts$/.test(p) ? [p] : [];
  });
}
const all = walk(SRC).filter((f) => !/\.test\.ts$/.test(f));

describe('apps/server import boundary', () => {
  it.each(all)('%s stays within the boundary', (file) => {
    const src = readFileSync(file, 'utf8');
    expect(src).not.toMatch(/from\s+['"]@trading-office\/web['"]/);
    expect(src).not.toMatch(/from\s+['"][^'"]*trading-lab(?!-floor)[^'"]*['"]/);
    expect(src).not.toMatch(/from\s+['"][^'"]*trading-platform[^'"]*['"]/);
  });
});
