import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..'); // apps/web/src

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) ? [p] : [];
  });
}
const prod = walk(SRC).filter((f) => !/\.test\.(ts|tsx)$/.test(f));

describe('apps/web production import boundary', () => {
  it.each(prod)('%s stays within the boundary', (file) => {
    const src = readFileSync(file, 'utf8');
    expect(src).not.toMatch(/from\s+['"]@trading-office\/server['"]/);
    expect(src).not.toMatch(/from\s+['"][^'"]*trading-lab(?!-floor)[^'"]*['"]/); // trading-lab-floor is allowed
    expect(src).not.toMatch(/from\s+['"][^'"]*trading-platform[^'"]*['"]/);
  });
});
