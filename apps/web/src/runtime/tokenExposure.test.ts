import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const SRC = fileURLToPath(new URL('..', import.meta.url)); // apps/web/src

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('no trading-lab token/url exposure in the web app', () => {
  it('web source never references TRADING_LAB_* (tokens/urls are server-only)', () => {
    const offenders = walk(SRC)
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .filter((f) => !/\.test\.(ts|tsx)$/.test(f))
      .filter((f) => /TRADING_LAB/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
