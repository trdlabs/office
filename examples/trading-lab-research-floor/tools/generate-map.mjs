#!/usr/bin/env node
/**
 * Generates the Trading Lab Research Floor as valid Tiled JSON maps (.tmj) —
 * one per theme (Day Office / Night Control Room). Both share the same
 * geometry; only the tileset image and background color differ. The files
 * open in the Tiled editor; this script only exists so the example layout is
 * reproducible and reviewable in code.
 *
 * Visual Iteration 3 layout (20×17 tiles, 640×544 world). Workstations face
 * the viewer: the agent sits BEHIND its desk (one tile row above it),
 * front-facing, with the laptop lid back toward the camera; the nameplate
 * chip is rendered by the kit over the desk's front edge.
 *
 * - top wall: window, hypothesis board and backtests monitor symmetric
 *   around the centered door, vent/clock/poster/notice in the gaps;
 * - entrance flanks: vending machine + trash bin left of the door, the big
 *   water cooler + trash bin right of it;
 * - left wing on carpet: Analyst / Researcher / Critic, desks at x=2..3;
 * - right wing on carpet: Builder / Evaluator / Performance Monitor;
 * - center: the Boss behind a 4-tile command console on the boss rug
 *   (console = furniture tiles; `boss-console` object is a pure hit-area);
 * - below the Boss: a glass-walled infra/server room (tech floor) holding
 *   the server rack, archive shelf and bot status monitor;
 * - bottom-left: bookshelves against the wall; bottom-right: coffee corner;
 * - plants fill the seams. No decorative floor text.
 *
 * Usage: node tools/generate-map.mjs   (run generate-assets.mjs first)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { THEMES, TILE_DEFS, TILE_SIZE, TILESET_COLUMNS, tileGid } from './lib/tiles.mjs';

const W = 20;
const H = 17;

const THEME_COLORS = {
  day: { background: '#6f7886' },
  night: { background: '#0b0e1a' },
};

const exampleRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function grid() {
  return Array.from({ length: H }, () => new Array(W).fill(0));
}

function set(layer, x, y, tile) {
  layer[y][x] = tileGid(tile);
}

/** Paint a bordered 9-slice rug (`prefix` = 'brug' | 'crug'). */
function rugZone(layer, x, y, w, h, prefix) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const v = yy === y ? 't' : yy === y + h - 1 ? 'b' : '';
      const u = xx === x ? 'l' : xx === x + w - 1 ? 'r' : '';
      const key = `${v}${u}` || 'c';
      set(layer, xx, yy, `${prefix}_${key}`);
    }
  }
}

/** Place a 2×2 block whose tiles are named `<base>_tl/tr/bl/br`. */
function block2x2(layer, x, y, base) {
  set(layer, x, y, `${base}_tl`);
  set(layer, x + 1, y, `${base}_tr`);
  set(layer, x, y + 1, `${base}_bl`);
  set(layer, x + 1, y + 1, `${base}_br`);
}

function flatten(layer) {
  return layer.flat();
}

// ---------------------------------------------------------------------------
// tile layers (shared geometry)
// ---------------------------------------------------------------------------

const floor = grid();
const walls = grid();
const furniture = grid();
const decor = grid();

// floor: warm plank checkerboard inside the walls
for (let y = 3; y <= 15; y++) {
  for (let x = 1; x <= 18; x++) {
    set(floor, x, y, (x + y) % 2 === 0 ? 'floor_a' : 'floor_b');
  }
}
// shadow under the top wall + doormat in front of the door
for (let x = 1; x <= 18; x++) set(floor, x, 3, 'floor_shadow');
set(floor, 9, 3, 'doormat_l');
set(floor, 10, 3, 'doormat_r');

// cool carpet under each desk wing (contrast against the planks)
rugZone(floor, 1, 4, 4, 10, 'crug');
rugZone(floor, 15, 4, 4, 10, 'crug');

// command rug under the Boss console
rugZone(floor, 7, 4, 6, 5, 'brug');

// raised tech floor inside the glass server room
for (let y = 13; y <= 15; y++) {
  for (let x = 7; x <= 12; x++) {
    set(floor, x, y, 'floor_tech');
  }
}

// walls: full perimeter cap, two face rows along the top wall
for (let x = 0; x < W; x++) {
  set(walls, x, 0, 'wall_top');
  set(walls, x, H - 1, 'wall_top');
}
for (let y = 0; y < H; y++) {
  set(walls, 0, y, 'wall_top');
  set(walls, W - 1, y, 'wall_top');
}
for (let x = 1; x <= 18; x++) {
  set(walls, x, 1, 'wall_face_u');
  set(walls, x, 2, 'wall_face_l');
}
// 2×2 windows + 2×2 double door (door centered: boards hang symmetric)
block2x2(walls, 2, 1, 'window');
block2x2(walls, 16, 1, 'window');
block2x2(walls, 9, 1, 'door');
// wall dressing (cols 4-6 and 13-15 stay plain: the boards hang there)
set(walls, 1, 1, 'wall_vent');
set(walls, 8, 1, 'wall_clock');
set(walls, 12, 1, 'poster');
set(walls, 18, 1, 'notice_board');

// entrance flanks: vending machine + bin left of the door, the big water
// cooler + bin right of it (1×2-tall units lean on the wall like shelves)
set(furniture, 7, 2, 'vending_top');
set(furniture, 7, 3, 'vending_bottom');
set(furniture, 8, 3, 'trash_bin');
set(furniture, 11, 2, 'water_cooler_top');
set(furniture, 11, 3, 'water_cooler_bottom');
set(furniture, 12, 3, 'trash_bin');

// workstations: 2×1 desk block with the laptop, agent seated BEHIND it
// (one row up, front-facing); nameplate chip lands on the desk front
const DESKS = [
  // [x, deskY, variant]
  [2, 6, 'desk_a'],
  [2, 9, 'desk_b'],
  [2, 12, 'desk_a'],
  [16, 6, 'desk_b'],
  [16, 9, 'desk_a'],
  [16, 12, 'desk_b'],
];
for (const [x, y, base] of DESKS) {
  set(furniture, x, y, `${base}_l`);
  set(furniture, x + 1, y, `${base}_r`);
}

// boss command console: 4 furniture tiles, monitors' backs to the viewer
set(furniture, 8, 7, 'console_l');
set(furniture, 9, 7, 'console_ml');
set(furniture, 10, 7, 'console_mr');
set(furniture, 11, 7, 'console_r');

// glass-walled infra/server room below the Boss (door aligned with the
// main entrance axis)
set(furniture, 6, 12, 'glass_corner');
set(furniture, 7, 12, 'glass_h');
set(furniture, 8, 12, 'glass_h');
set(furniture, 9, 12, 'glass_door_l');
set(furniture, 10, 12, 'glass_door_r');
set(furniture, 11, 12, 'glass_h');
set(furniture, 12, 12, 'glass_h');
set(furniture, 13, 12, 'glass_corner');
for (const gy of [13, 14, 15]) {
  set(furniture, 6, gy, 'glass_v');
  set(furniture, 13, gy, 'glass_v');
}

// bottom-left: bookshelves against the wall
for (const bx of [2, 3]) {
  set(furniture, bx, 14, 'bookshelf_top');
  set(furniture, bx, 15, 'bookshelf_bottom');
}

// bottom-right: small coffee corner
set(furniture, 16, 15, 'cabinet_coffee');
set(furniture, 15, 15, 'plant_small');

// plants in the seams
set(furniture, 1, 3, 'plant_big');
set(furniture, 18, 3, 'plant_big');
set(furniture, 5, 3, 'plant_small');
set(furniture, 14, 3, 'plant_small');
set(furniture, 1, 15, 'plant_big');
set(furniture, 18, 15, 'plant_big');

// decor layer kept (empty) for the canonical layer contract; desk items are
// baked into the desk tiles.
void decor;

// ---------------------------------------------------------------------------
// object layers (shared geometry)
// ---------------------------------------------------------------------------

function buildObjects() {
  let nextObjectId = 1;

  function spawnPoint(name, x, y, props) {
    return {
      id: nextObjectId++,
      name,
      type: 'agent_spawn',
      point: true,
      x,
      y,
      width: 0,
      height: 0,
      rotation: 0,
      visible: true,
      properties: Object.entries(props).map(([key, value]) => ({
        name: key,
        type: typeof value === 'boolean' ? 'bool' : 'string',
        value,
      })),
    };
  }

  function interactiveRect(name, x, y, width, height, props) {
    return {
      id: nextObjectId++,
      name,
      type: 'interactive_object',
      x,
      y,
      width,
      height,
      rotation: 0,
      visible: true,
      properties: Object.entries(props).map(([key, value]) => ({
        name: key,
        type: typeof value === 'boolean' ? 'bool' : 'string',
        value,
      })),
    };
  }

  // Agents face the viewer from BEHIND their desks: the spawn point (feet
  // anchor) sits exactly on the desk block's top edge, so the desk +
  // laptop cover the lap and the bust stays fully visible.
  const spawns = [
    spawnPoint('boss', 320, 224, {
      role: 'boss',
      displayName: 'Boss / Orchestrator',
      label: 'Boss',
    }),
    spawnPoint('analyst', 96, 192, {
      role: 'strategy_analyst',
      displayName: 'Strategy Analyst',
      label: 'Analyst',
    }),
    spawnPoint('researcher', 96, 288, {
      role: 'researcher',
      displayName: 'Researcher',
      label: 'Researcher',
    }),
    spawnPoint('critic', 96, 384, {
      role: 'critic',
      displayName: 'Critic / Risk Reviewer',
      label: 'Critic',
    }),
    spawnPoint('builder', 544, 192, {
      role: 'builder',
      displayName: 'Builder',
      label: 'Builder',
    }),
    spawnPoint('evaluator', 544, 288, {
      role: 'evaluator',
      displayName: 'Evaluator',
      label: 'Evaluator',
    }),
    spawnPoint('perf-monitor', 544, 384, {
      role: 'performance_monitor',
      displayName: 'Performance Monitor',
      label: 'Monitor',
    }),
  ];

  const objects = [
    // wall boards, symmetric around the door (door center = x 320)
    interactiveRect('hypothesis-board', 128, 34, 96, 48, {
      objectType: 'hypothesis_board',
      label: 'Hypothesis Board',
      panelTarget: 'hypothesis-pipeline',
    }),
    interactiveRect('wall-monitor', 416, 34, 96, 48, {
      objectType: 'wall_monitor',
      label: 'Backtests',
      panelTarget: 'backtest-summary',
    }),
    // infra/server room contents (inside the glass partition)
    interactiveRect('server-rack', 232, 418, 56, 88, {
      objectType: 'server_rack',
      label: 'Data Node',
      panelTarget: 'infra-status',
    }),
    interactiveRect('archive', 296, 442, 64, 64, {
      objectType: 'archive_shelf',
      label: 'Archive',
      panelTarget: 'knowledge-base',
    }),
    interactiveRect('bot-status', 368, 442, 48, 64, {
      objectType: 'bot_status_monitor',
      label: 'Bot Status',
      panelTarget: 'bot-health',
    }),
    // pure hit-area over the console furniture tiles (no sprite). Height
    // 40 (tile + leg row) keeps the hover label clear of the Boss chip.
    interactiveRect('boss-console', 256, 224, 128, 40, {
      objectType: 'boss_console',
      label: 'Console',
      panelTarget: 'boss-commands',
    }),
  ];

  return { spawns, objects, nextId: () => nextObjectId };
}

// ---------------------------------------------------------------------------
// assemble one .tmj per theme
// ---------------------------------------------------------------------------

function buildMap(theme) {
  const colors = THEME_COLORS[theme];
  const { spawns, objects, nextId } = buildObjects();

  let nextLayerId = 1;

  function tileLayer(name, layer) {
    return {
      id: nextLayerId++,
      name,
      type: 'tilelayer',
      width: W,
      height: H,
      x: 0,
      y: 0,
      opacity: 1,
      visible: true,
      data: flatten(layer),
    };
  }

  function objectLayer(name, objs) {
    return {
      id: nextLayerId++,
      name,
      type: 'objectgroup',
      x: 0,
      y: 0,
      opacity: 1,
      visible: true,
      draworder: 'topdown',
      objects: objs,
    };
  }

  const rows = Math.ceil(TILE_DEFS.length / TILESET_COLUMNS);
  const map = {
    type: 'map',
    version: '1.10',
    tiledversion: '1.11.0',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    infinite: false,
    width: W,
    height: H,
    tilewidth: TILE_SIZE,
    tileheight: TILE_SIZE,
    backgroundcolor: colors.background,
    nextlayerid: 0, // patched below
    nextobjectid: nextId(),
    tilesets: [
      {
        firstgid: 1,
        name: `office-tileset-${theme}`,
        image: `../assets/generated/tiles/office-tileset-${theme}.png`,
        imagewidth: TILESET_COLUMNS * TILE_SIZE,
        imageheight: rows * TILE_SIZE,
        tilewidth: TILE_SIZE,
        tileheight: TILE_SIZE,
        tilecount: TILE_DEFS.length,
        columns: TILESET_COLUMNS,
        margin: 0,
        spacing: 0,
      },
    ],
    layers: [
      tileLayer('floor', floor),
      tileLayer('walls', walls),
      tileLayer('furniture', furniture),
      tileLayer('decor', decor),
      objectLayer('agent_spawn_points', spawns),
      objectLayer('interactive_objects', objects),
      // No decorative floor text — zones read through layout and furniture.
      // The layer stays for the canonical layer contract.
      objectLayer('labels', []),
    ],
  };
  map.nextlayerid = nextLayerId;
  return map;
}

for (const theme of THEMES) {
  const map = buildMap(theme);
  const outFile = join(
    exampleRoot,
    'public',
    'maps',
    `trading-lab-research-floor-${theme}.tmj`,
  );
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(map, null, 2) + '\n');
  console.log(`Wrote ${outFile}`);
}
console.log(
  `  ${W}×${H} tiles @ ${TILE_SIZE}px — ${W * TILE_SIZE}×${H * TILE_SIZE}px world`,
);
