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
// Only runtime-served subtrees are mirrored. assets/ASSETS.md (licensing docs)
// sits outside these and is deliberately NOT synced.
const SYNCED = ['maps', join('assets', 'generated'), join('assets', 'third-party')];

const args = process.argv.slice(2);
const check = args.includes('--check');
const targetPublicArg = args.find((a) => !a.startsWith('--'));
if (!targetPublicArg) {
  console.error('usage: node tools/sync-floor-public.mjs <consumer-public-dir> [--check]');
  process.exit(2);
}
const targetRoot = join(repoRoot, targetPublicArg);

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
