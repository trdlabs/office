#!/usr/bin/env node
/**
 * Generates every placeholder pixel asset for the Trading Lab Research Floor
 * example. Zero npm dependencies; output is deterministic, so committed PNGs
 * can always be reproduced byte-for-byte.
 *
 * Usage: node tools/generate-assets.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strip } from './lib/img.mjs';
import { encodePng } from './lib/png.mjs';
import { PROP_DEFS } from './lib/props.mjs';
import { renderTileset, THEMES, TILE_DEFS, TILESET_COLUMNS, TILE_SIZE } from './lib/tiles.mjs';

const exampleRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outRoot = join(exampleRoot, 'public', 'assets', 'generated');

function writePng(relPath, img) {
  const file = join(outRoot, relPath);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, encodePng(img.width, img.height, img.data));
  console.log(
    `  ${relPath.padEnd(40)} ${String(img.width).padStart(3)}×${img.height}`,
  );
}

console.log('Generating placeholder pixel assets…');

// 1. Environment / furniture tilesets (Day Office + Night Control Room)
for (const theme of THEMES) {
  writePng(join('tiles', `office-tileset-${theme}.png`), renderTileset(theme));
}
console.log(
  `  tileset: ${TILE_DEFS.length} tiles, ${TILESET_COLUMNS} columns, tile ${TILE_SIZE}px, themes: ${THEMES.join(', ')}`,
);

// 2. Agents are NOT generated here — they are composed from real Universal
//    LPC Spritesheet Character Generator layers by tools/compose-lpc-agents.mjs
//    into public/assets/third-party/lpc/ (committed, with attribution docs).

// 3. Interactive object props (2-frame strips)
for (const prop of PROP_DEFS) {
  writePng(
    join('props', `${prop.name}.png`),
    strip([prop.draw(0), prop.draw(1)]),
  );
}

console.log('Done.');
