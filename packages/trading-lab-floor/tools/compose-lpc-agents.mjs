#!/usr/bin/env node
/**
 * Composes the agent sprites from REAL Universal LPC Spritesheet Character
 * Generator layers (https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator).
 *
 * For every role this script:
 *   1. loads the `sit` sheet of each chosen layer (body, legs, clothes, tie,
 *      head, eyes, glasses, hair) from a local checkout of the generator,
 *   2. recolors it with the generator's own palette ramps
 *      (palette_definitions/{body,hair,cloth,eye}),
 *   3. composites the layers in zPos order on the south-facing chair-sit
 *      frame (row 2, column 2 of the sit sheet),
 *   4. draws an office chair BEHIND the figure (original pixels, not LPC),
 *   5. crops the seated bust at the desk cut line (the workstation desk tile
 *      covers the lap), and
 *   6. writes a 4-frame strip: frame 0 is the still idle pose, frames 1-3 are
 *      a typing loop that animates only the hands at the desk line. The kit
 *      holds frame 0 while the agent is idle and plays 1-3 while it works
 *      (see the scene's sprite `states`).
 *
 * It also regenerates ATTRIBUTIONS.md next to the sprites from the
 * generator's CREDITS.csv, listing every source file actually used with its
 * authors, licenses and URLs. Run it after changing LOOKS.
 *
 * Usage:
 *   ULPC_DIR=~/tmp/ulpc node tools/compose-lpc-agents.mjs
 *
 * ULPC_DIR must point at a checkout of the generator repo (see SOURCE.md in
 * the output directory for the exact commit). The composed PNGs are
 * committed, so running this is only needed to change the characters.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Img, hexToRgba, strip } from './lib/img.mjs';
import { decodePng } from './lib/png-decode.mjs';
import { encodePng } from './lib/png.mjs';
import { PAL } from './lib/palette.mjs';

const exampleRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const ULPC_DIR =
  process.env.ULPC_DIR ?? join(homedir(), 'tmp', 'ulpc');
const OUT_DIR = join(exampleRoot, 'public', 'assets', 'third-party', 'lpc');

if (!existsSync(join(ULPC_DIR, 'spritesheets'))) {
  console.error(
    `ULPC checkout not found at ${ULPC_DIR}.\n` +
      'Clone https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator\n' +
      'and pass its path via ULPC_DIR. The composed PNGs are committed, so\n' +
      'this is only needed to change the characters.',
  );
  process.exit(1);
}

const FRAME = 64;
/** South-facing chair-sit pose: sit.png row 2 (down), column 2 (upright). */
const SIT_ROW = 2;
const SIT_COL = 2;
/**
 * Desk cut line inside the 64px frame: everything below is covered by the
 * workstation desk tile, so the sprite ends here (sprite bottom = spawn
 * point = desk top edge).
 */
const CUT_Y = 52;

// ---------------------------------------------------------------------------
// palette ramps from the generator itself
// ---------------------------------------------------------------------------

function loadJson(rel) {
  return JSON.parse(readFileSync(join(ULPC_DIR, rel), 'utf8'));
}

const RAMPS = {
  body: loadJson('palette_definitions/body/body_ulpc.json'), // base: light
  hair: loadJson('palette_definitions/hair/hair_ulpc.json'), // base: orange
  cloth: loadJson('palette_definitions/cloth/cloth_ulpc.json'), // base: white
  eye: loadJson('palette_definitions/eye/eye_ulpc.json'), // base: blue
};
const BASE_RAMP = { body: 'light', hair: 'orange', cloth: 'white', eye: 'blue' };

/**
 * Ramp remap built on the generator's palette ramps. Pixels are matched to
 * the base ramp by nearest color (some sheets are a couple of units off the
 * canonical ramp) and replaced with the same index of the target ramp.
 * Fully grayscale sheets (e.g. the necktie) get a rank mapping instead:
 * distinct gray levels, dark to light, spread over the ramp.
 */
function recolor(img, material, target) {
  if (!target || target === BASE_RAMP[material]) return img;
  const from = RAMPS[material][BASE_RAMP[material]].map((h) =>
    hexToRgba(h).slice(0, 3),
  );
  const to = RAMPS[material][target];
  if (!to) throw new Error(`Unknown ${material} ramp "${target}"`);
  const toRgb = to.map((h) => hexToRgba(h).slice(0, 3));
  const d = img.data;

  // detect a fully grayscale sheet
  let grayOnly = true;
  const grays = new Set();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    if (d[i] !== d[i + 1] || d[i] !== d[i + 2]) {
      grayOnly = false;
      break;
    }
    grays.add(d[i]);
  }

  if (grayOnly && grays.size > 0) {
    // rank the gray levels over the mid range of the ramp (keeps contrast
    // without crushing to the near-black ramp ends)
    const sorted = [...grays].sort((a, b) => a - b);
    const lo = sorted.length >= to.length ? 0 : 1;
    const hi = sorted.length >= to.length ? to.length - 1 : to.length - 2;
    const map = new Map(
      sorted.map((g, i) => [
        g,
        toRgb[lo + Math.round((i * (hi - lo)) / Math.max(1, sorted.length - 1))],
      ]),
    );
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const hit = map.get(d[i]);
      if (hit) {
        d[i] = hit[0];
        d[i + 1] = hit[1];
        d[i + 2] = hit[2];
      }
    }
    return img;
  }

  const cache = new Map();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    let hit = cache.get(key);
    if (hit === undefined) {
      let best = -1;
      let bestDist = Infinity;
      for (let r = 0; r < from.length; r++) {
        const dr = d[i] - from[r][0];
        const dg = d[i + 1] - from[r][1];
        const db = d[i + 2] - from[r][2];
        const dist = dr * dr + dg * dg + db * db;
        if (dist < bestDist) {
          bestDist = dist;
          best = r;
        }
      }
      // only remap close matches; foreign colors (outlines, skin on a cloth
      // sheet) stay untouched
      hit = bestDist <= 32 * 32 ? toRgb[best] : null;
      cache.set(key, hit);
    }
    if (hit) {
      d[i] = hit[0];
      d[i + 1] = hit[1];
      d[i + 2] = hit[2];
    }
  }
  return img;
}

// ---------------------------------------------------------------------------
// characters: every layer is a real ULPC sheet (path relative to
// spritesheets/), recolored with the generator's ramps. zPos values follow
// the generator's sheet_definitions.
// ---------------------------------------------------------------------------

/** layer: [zPos, 'sheet dir under spritesheets/', material, ramp] */
const LOOKS = {
  boss: {
    bodyRamp: 'light',
    executive: true,
    layers: [
      [10, 'body/bodies/male', 'body'],
      [20, 'legs/formal/male', 'cloth', 'black'],
      [35, 'torso/clothes/longsleeve/longsleeve2_buttoned/male', 'cloth', 'charcoal'],
      [90, 'neck/tie/necktie/male', 'cloth', 'yellow'],
      [100, 'head/heads/human/male', 'body'],
      [105, 'eyes/human/adult/default', 'eye', 'brown'],
      [120, 'hair/parted/adult', 'hair', 'raven'],
    ],
  },
  strategy_analyst: {
    bodyRamp: 'amber',
    layers: [
      [10, 'body/bodies/female', 'body'],
      [20, 'legs/pants/thin', 'cloth', 'navy'],
      [35, 'torso/clothes/longsleeve/longsleeve2_cardigan/female', 'cloth', 'teal'],
      [100, 'head/heads/human/female', 'body'],
      [105, 'eyes/human/adult/default', 'eye', 'brown'],
      [115, 'facial/glasses/secretary/adult', null],
      [120, 'hair/curtains_long/adult', 'hair', 'navy'],
    ],
  },
  researcher: {
    bodyRamp: 'light',
    layers: [
      [10, 'body/bodies/female', 'body'],
      [20, 'legs/pants/thin', 'cloth', 'charcoal'],
      [35, 'torso/clothes/longsleeve/longsleeve2_scoop/female', 'cloth', 'forest'],
      [100, 'head/heads/human/female', 'body'],
      [105, 'eyes/human/adult/default', 'eye'],
      [120, 'hair/bangs_bun/adult', 'hair', 'light_brown'],
    ],
  },
  critic: {
    bodyRamp: 'taupe',
    layers: [
      [10, 'body/bodies/male', 'body'],
      [20, 'legs/formal/male', 'cloth', 'navy'],
      [35, 'torso/clothes/longsleeve/longsleeve2_buttoned/male', 'cloth', 'white'],
      [90, 'neck/tie/necktie/male', 'cloth', 'red'],
      [100, 'head/heads/human/male', 'body'],
      [105, 'eyes/human/adult/default', 'eye', 'gray'],
      [120, 'hair/swoop/adult', 'hair', 'chestnut'],
    ],
  },
  builder: {
    bodyRamp: 'brown',
    layers: [
      [10, 'body/bodies/male', 'body'],
      [20, 'legs/pants/male', 'cloth', 'blue'],
      [35, 'torso/clothes/shortsleeve/tshirt/male', 'cloth', 'orange'],
      [100, 'head/heads/human/male', 'body'],
      [105, 'eyes/human/adult/default', 'eye', 'brown'],
      [120, 'hair/messy2/adult', 'hair', 'dark_brown'],
    ],
  },
  evaluator: {
    bodyRamp: 'light',
    layers: [
      [9, 'hair/high_ponytail/adult/bg', 'hair', 'blonde'],
      [10, 'body/bodies/female', 'body'],
      [20, 'legs/pants/thin', 'cloth', 'gray'],
      [35, 'torso/clothes/shortsleeve/tshirt_vneck/female', 'cloth', 'purple'],
      [100, 'head/heads/human/female', 'body'],
      [105, 'eyes/human/adult/default', 'eye', 'green'],
      [120, 'hair/high_ponytail/adult/fg', 'hair', 'blonde'],
    ],
  },
  performance_monitor: {
    bodyRamp: 'olive',
    layers: [
      [10, 'body/bodies/male', 'body'],
      [20, 'legs/pants/male', 'cloth', 'charcoal'],
      [35, 'torso/clothes/shortsleeve/shortsleeve_polo/male', 'cloth', 'green'],
      [100, 'head/heads/human/male', 'body'],
      [105, 'eyes/human/adult/default', 'eye', 'brown'],
      [120, 'hair/flat_top_fade/adult', 'hair', 'black'],
    ],
  },
  knowledge_curator: {
    bodyRamp: 'bronze',
    layers: [
      [10, 'body/bodies/female', 'body'],
      [20, 'legs/pants/thin', 'cloth', 'slate'],
      [35, 'torso/clothes/shortsleeve/shortsleeve_cardigan/female', 'cloth', 'lavender'],
      [100, 'head/heads/human/female', 'body'],
      [105, 'eyes/human/adult/default', 'eye', 'purple'],
      [120, 'hair/curly_short2/adult', 'hair', 'purple'],
    ],
  },
};

export const AGENT_ROLES = Object.keys(LOOKS);

// ---------------------------------------------------------------------------
// compositing
// ---------------------------------------------------------------------------

const sheetCache = new Map();

function loadSheet(dir) {
  let img = sheetCache.get(dir);
  if (!img) {
    img = decodePng(readFileSync(join(ULPC_DIR, 'spritesheets', dir, 'sit.png')));
    sheetCache.set(dir, img);
  }
  return img;
}

/** Copy one 64×64 frame of `src` onto `dst` (alpha-aware). */
function blitFrame(dst, src, col, row, dx, dy) {
  for (let y = 0; y < FRAME; y++) {
    for (let x = 0; x < FRAME; x++) {
      const si = ((row * FRAME + y) * src.width + (col * FRAME + x)) * 4;
      const a = src.data[si + 3];
      if (a === 0) continue;
      const hex =
        '#' +
        [src.data[si], src.data[si + 1], src.data[si + 2], a]
          .map((v) => v.toString(16).padStart(2, '0'))
          .join('');
      dst.px(dx + x, dy + y, hex);
    }
  }
}

/** Plain office task chair behind the figure (original pixels, not LPC). */
function drawChair(img) {
  // backrest sticking out left/right of the torso
  img.rect(20, 22, 24, 26, PAL.chair);
  img.outline(20, 22, 24, 26, PAL.chairDark);
  img.hline(21, 42, 23, PAL.chairHi);
  img.vline(21, 23, 46, PAL.chairHi);
  // armrests
  img.rect(16, 38, 4, 10, PAL.chairDark);
  img.rect(44, 38, 4, 10, PAL.chairDark);
  img.hline(16, 19, 38, PAL.chairHi);
  img.hline(44, 47, 38, PAL.chairHi);
}

/** Tall winged executive chair for the Boss. */
function drawExecChair(img) {
  img.rect(18, 10, 28, 38, PAL.execChair);
  img.outline(18, 10, 28, 38, PAL.execChairDark);
  img.hline(19, 44, 11, PAL.execChairHi);
  img.vline(19, 11, 46, PAL.execChairHi);
  // winged top corners
  img.rect(14, 10, 4, 10, PAL.execChair);
  img.rect(46, 10, 4, 10, PAL.execChair);
  img.outline(14, 10, 4, 10, PAL.execChairDark);
  img.outline(46, 10, 4, 10, PAL.execChairDark);
  // gold studs down the visible edges
  for (const y of [14, 22, 30, 38]) {
    img.px(19, y, PAL.gold);
    img.px(44, y, PAL.gold);
  }
  // armrests
  img.rect(14, 40, 4, 8, PAL.execChairDark);
  img.rect(46, 40, 4, 8, PAL.execChairDark);
}

function composeRole(role) {
  const look = LOOKS[role];
  const frame = new Img(FRAME, CUT_Y);
  if (look.executive) drawExecChair(frame);
  else drawChair(frame);
  const layers = [...look.layers].sort((a, b) => a[0] - b[0]);
  for (const [, dir, material, ramp] of layers) {
    const sheet = loadSheet(dir).clone();
    if (material === 'body') recolor(sheet, 'body', look.bodyRamp);
    else if (material) recolor(sheet, material, ramp);
    blitFrame(frame, sheet, SIT_COL, SIT_ROW, 0, 0);
  }
  return frame;
}

// ---------------------------------------------------------------------------
// typing animation: synthesize a few frames that animate ONLY the hands at
// the desk line, so a busy agent visibly types (no head/torso/chair bob).
// The hands are drawn over the seated pose in the agent's own skin tone.
// ---------------------------------------------------------------------------

const clamp8 = (v) => Math.max(0, Math.min(255, Math.round(v)));
const rgbHex = ([r, g, b], a = 255) =>
  '#' + [r, g, b, a].map((v) => clamp8(v).toString(16).padStart(2, '0')).join('');
const scaleRgb = ([r, g, b], k) => [r * k, g * k, b * k];

/** Most common warm (skin) color in the cheeks + resting-hands regions. */
function sampleSkin(img) {
  const counts = new Map();
  // [x, y, w, h] — both cheeks and the clasped hands are reliably skin
  for (const [rx, ry, rw, rh] of [
    [25, 22, 14, 6],
    [26, 44, 12, 7],
  ]) {
    for (let y = ry; y < ry + rh; y++) {
      for (let x = rx; x < rx + rw; x++) {
        const i = (y * img.width + x) * 4;
        if (img.data[i + 3] < 200) continue;
        const r = img.data[i];
        const g = img.data[i + 1];
        const b = img.data[i + 2];
        if (r < 80 || b > r) continue; // skip hair/outline (dark) and cloth (blue)
        const key = (r << 16) | (g << 8) | b;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
  let best = 0;
  let bestKey = null;
  for (const [key, count] of counts) {
    if (count > best) {
      best = count;
      bestKey = key;
    }
  }
  if (bestKey == null) return null;
  return [(bestKey >> 16) & 255, (bestKey >> 8) & 255, bestKey & 255];
}

/** One hand (with a short wrist) at (hx, hy); `pressed` extends a finger. */
function drawHand(img, hx, hy, w, skinHex, hiHex, darkHex, pressed) {
  img.rect(hx, hy, w, 3, skinHex);
  img.hline(hx, hx + w - 1, hy, hiHex); // knuckle highlight
  img.px(hx + Math.floor(w / 2), hy + 1, darkHex); // finger split
  img.px(hx, hy + 2, darkHex);
  img.px(hx + w - 1, hy + 2, darkHex);
  // short wrist/forearm up toward the sleeve
  img.rect(hx + 1, hy - 2, w - 2, 2, skinHex);
  img.px(hx + 1, hy - 3, darkHex);
  if (pressed) {
    // fingers reaching down onto the keys
    img.px(hx + 1, hy + 3, darkHex);
    img.px(hx + w - 2, hy + 3, darkHex);
  }
}

/**
 * Repaint the hand zone for one typing phase. The two hands seesaw — one
 * raised, the other pressing a key — looping raised-left → neutral →
 * raised-right.
 */
function drawTypingHands(img, skin, phase) {
  const skinHex = rgbHex(skin);
  const hiHex = rgbHex(scaleRgb(skin, 1.14));
  const darkHex = rgbHex(scaleRgb(skin, 0.74));
  const baseY = 46;
  const W = 5;
  const [leftRaised, rightRaised] = [
    [true, false],
    [false, false],
    [false, true],
  ][phase % 3];
  drawHand(img, 34, baseY - (rightRaised ? 3 : 0), W, skinHex, hiHex, darkHex, !rightRaised && leftRaised);
  drawHand(img, 27, baseY - (leftRaised ? 3 : 0), W, skinHex, hiHex, darkHex, !leftRaised && rightRaised);
}

// ---------------------------------------------------------------------------
// attribution from the generator's CREDITS.csv
// ---------------------------------------------------------------------------

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') cell += ch;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/**
 * The human eye sheets ship with the LPC modular heads and have no row of
 * their own in the upstream CREDITS.csv — credit them like the heads.
 */
const CREDIT_FALLBACKS = {
  'eyes/human/adult/default/sit.png': [
    'eyes/human/adult/default/sit.png',
    'part of the LPC modular heads (no individual CREDITS.csv row upstream)',
    'bluecarrot16,Benjamin K. Smith (BenCreating),Stephen Challener (Redshrike)',
    'OGA-BY 3.0,CC-BY-SA 3.0,GPL 3.0',
    'https://opengameart.org/content/liberated-pixel-cup-lpc-base-assets-sprites-map-tiles,https://opengameart.org/content/lpc-character-bases',
  ],
};

function buildAttributions(usedDirs) {
  const csv = parseCsv(readFileSync(join(ULPC_DIR, 'CREDITS.csv'), 'utf8'));
  const byFile = new Map(csv.slice(1).map((r) => [r[0].trim(), r]));
  for (const [file, row] of Object.entries(CREDIT_FALLBACKS)) {
    if (!byFile.has(file)) byFile.set(file, row);
  }
  const lines = [
    '# Attributions',
    '',
    'The agent sprites in this directory are composed from layers of the',
    '[Universal LPC Spritesheet Character Generator](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator).',
    'Per-file credits below are copied verbatim from the generator’s CREDITS.csv.',
    'See SOURCE.md for the exact upstream commit and LICENSES.md for the licenses.',
    '',
  ];
  const missing = [];
  for (const dir of [...usedDirs].sort()) {
    const file = `${dir}/sit.png`.replace(/^/, '');
    const row = byFile.get(file);
    lines.push(`## \`spritesheets/${file}\``, '');
    if (!row) {
      missing.push(file);
      lines.push('- credits: see CREDITS.csv in the upstream repository', '');
      continue;
    }
    const [, notes, authors, licenses, urls] = row;
    lines.push(`- **Authors:** ${authors.trim()}`);
    lines.push(`- **Licenses:** ${licenses.trim()}`);
    if (notes.trim()) lines.push(`- **Notes:** ${notes.trim()}`);
    for (const url of urls.split(',').map((u) => u.trim()).filter(Boolean)) {
      lines.push(`- ${url}`);
    }
    lines.push('');
  }
  if (missing.length) {
    console.warn('  WARNING: no CREDITS.csv row for:', missing.join(', '));
  }
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true });
const usedDirs = new Set();

for (const role of AGENT_ROLES) {
  for (const [, dir] of LOOKS[role].layers) usedDirs.add(dir);
  const idle = composeRole(role);
  const skin = sampleSkin(idle) ?? [224, 178, 140];
  // frame 0 = still idle pose; frames 1-3 = typing loop (hands only)
  const frames = [idle];
  for (let phase = 0; phase < 3; phase++) {
    const f = idle.clone();
    drawTypingHands(f, skin, phase);
    frames.push(f);
  }
  const sheet = strip(frames);
  const file = join(OUT_DIR, `agent-${role}.png`);
  writeFileSync(file, encodePng(sheet.width, sheet.height, sheet.data));
  console.log(`  agent-${role}.png ${sheet.width}×${sheet.height} (${frames.length} frames)`);
}

writeFileSync(join(OUT_DIR, 'ATTRIBUTIONS.md'), buildAttributions(usedDirs));
console.log(`  ATTRIBUTIONS.md (${usedDirs.size} source sheets)`);
console.log('Done.');
