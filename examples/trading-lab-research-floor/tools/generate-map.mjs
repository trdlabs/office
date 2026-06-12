#!/usr/bin/env node
/**
 * Generates the Trading Lab Research Floor as valid Tiled JSON maps (.tmj) —
 * one per theme (Day Office / Night Control Room). Both share the same
 * geometry; only the tileset image and background color differ. The files
 * open in the Tiled editor; this script only exists so the example layout is
 * reproducible and reviewable in code.
 *
 * Visual Iteration 4 layout (20×17 tiles, 640×544 world). Workstations face
 * the viewer: the agent sits BEHIND its desk (one tile row above it),
 * front-facing, with the monitor's back toward the camera; the nameplate
 * chip is rendered by the kit over the desk's front edge.
 *
 * - one shared plank floor (no zone carpets) — desks contrast through dark
 *   espresso wood + light aluminum monitors;
 * - top wall: window, hypothesis board and backtests monitor symmetric
 *   around the centered door, vent/clock/poster/notice in the gaps;
 * - entrance flanks FLUSH against the wall: vending machine + trash bin
 *   left of the door, trash bin + the big water cooler right of it;
 * - left wing: Analyst / Researcher / Critic at x=2..3, rows 5/9/13
 *   (4-row pitch keeps status badges clear of the next nameplate);
 * - right wing: Builder / Evaluator / Performance Monitor;
 * - center: the Boss behind a deep 4×2 mahogany command console, screen
 *   center, one row above the server room (console = furniture tiles;
 *   `boss-console` object is a pure hit-area);
 * - behind the Boss: an executive lounge — two leather sofas facing each
 *   other, framed by big plants (central door walkway kept clear);
 * - below the Boss: a glass-walled infra/server room (tech floor, full
 *   width to the glass walls) with square corners and a sliding glass door,
 *   holding the server rack, archive shelf and bot status monitor;
 * - big plants in the four corner seams.
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

// floor: ONE shared warm plank texture inside the walls (no zone carpets)
for (let y = 3; y <= 15; y++) {
  for (let x = 1; x <= 18; x++) {
    set(floor, x, y, (x + y) % 2 === 0 ? 'floor_a' : 'floor_b');
  }
}
// shadow under the top wall + doormat in front of the door
for (let x = 1; x <= 18; x++) set(floor, x, 3, 'floor_shadow');
set(floor, 9, 3, 'doormat_l');
set(floor, 10, 3, 'doormat_r');

// raised tech floor inside the glass server room. The side-wall columns
// (x=6/x=13) use half-tech edge tiles (plank outside, tech inside) so the
// floor reads flush to the glass walls and never spills outside the room.
for (let y = 13; y <= 15; y++) {
  set(floor, 6, y, 'floor_tech_edge_l');
  for (let x = 7; x <= 12; x++) set(floor, x, y, 'floor_tech');
  set(floor, 13, y, 'floor_tech_edge_r');
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
// calendar on the wall directly above the trash bin next to the cooler
set(walls, 11, 1, 'calendar');

// entrance flanks, FLUSH against the wall: the tall units span wall rows
// 1-2 (feet land exactly on the wall base line), the bins sit on row 2.
// Left of the door: vending machine + bin. Right of it: bin + the big
// water cooler (cooler on the outside, bin next to the door).
set(furniture, 7, 1, 'vending_top');
set(furniture, 7, 2, 'vending_bottom');
set(furniture, 8, 2, 'trash_bin');
set(furniture, 11, 2, 'trash_bin');
set(furniture, 12, 1, 'water_cooler_top');
set(furniture, 12, 2, 'water_cooler_bottom');

// workstations: 2×1 desk block with the monitor (back to the viewer),
// agent seated BEHIND it (one row up, front-facing); nameplate chip lands
// on the desk front. 4-row pitch — statuses stay clear of neighbours.
const DESKS = [
  // [x, deskY, variant]
  [2, 5, 'desk_a'],
  [2, 9, 'desk_b'],
  [2, 13, 'desk_a'],
  [16, 5, 'desk_b'],
  [16, 9, 'desk_a'],
  [16, 13, 'desk_b'],
];
for (const [x, y, base] of DESKS) {
  set(furniture, x, y, `${base}_l`);
  set(furniture, x + 1, y, `${base}_r`);
}

// boss command console: deep 4×2 mahogany desk, three monitor backs toward
// the viewer; screen center, one clear row above the server room
for (const [i, part] of ['l', 'ml', 'mr', 'r'].entries()) {
  set(furniture, 8 + i, 9, `console_${part}_t`);
  set(furniture, 8 + i, 10, `console_${part}_b`);
}

// executive lounge behind the Boss: two vertical leather sofas (1×3) facing
// each other — left opens east, right opens west — drawn close together. A
// big plant bookends each sofa above and below (one higher, one lower) so the
// greenery sits beside the sofas, not behind their backrests.
set(furniture, 7, 5, 'sofa_e_t');
set(furniture, 7, 6, 'sofa_e_m');
set(furniture, 7, 7, 'sofa_e_b');
set(furniture, 12, 5, 'sofa_w_t');
set(furniture, 12, 6, 'sofa_w_m');
set(furniture, 12, 7, 'sofa_w_b');
set(furniture, 7, 4, 'plant_big');
set(furniture, 7, 8, 'plant_big');
set(furniture, 12, 4, 'plant_big');
set(furniture, 12, 8, 'plant_big');
// coffee table centered between the two facing sofas
set(furniture, 9, 6, 'coffee_table_l');
set(furniture, 10, 6, 'coffee_table_r');

// glass-walled infra/server room below the Boss: square corners (the
// horizontal run stops at the vertical band) + a sliding glass door
// aligned with the main entrance axis
set(furniture, 6, 12, 'glass_corner_l');
set(furniture, 7, 12, 'glass_h');
set(furniture, 8, 12, 'glass_h');
set(furniture, 9, 12, 'glass_door_l');
set(furniture, 10, 12, 'glass_door_r');
set(furniture, 11, 12, 'glass_h');
set(furniture, 12, 12, 'glass_h');
set(furniture, 13, 12, 'glass_corner_r');
for (const gy of [13, 14, 15]) {
  set(furniture, 6, gy, 'glass_v');
  set(furniture, 13, gy, 'glass_v');
}

// big plants in the corner seams only (top plants sit on the wall row,
// flush against it) — bottom row otherwise left clear.
set(furniture, 1, 2, 'plant_big');
set(furniture, 18, 2, 'plant_big');
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
  // monitor cover the lap and the seated bust stays fully visible.
  const spawns = [
    spawnPoint('boss', 320, 288, {
      role: 'boss',
      displayName: 'Boss / Orchestrator',
      label: 'Boss',
    }),
    spawnPoint('analyst', 96, 160, {
      role: 'strategy_analyst',
      displayName: 'Strategy Analyst',
      label: 'Analyst',
    }),
    spawnPoint('researcher', 96, 288, {
      role: 'researcher',
      displayName: 'Researcher',
      label: 'Researcher',
    }),
    spawnPoint('critic', 96, 416, {
      role: 'critic',
      displayName: 'Critic / Risk Reviewer',
      label: 'Critic',
    }),
    spawnPoint('builder', 544, 160, {
      role: 'builder',
      displayName: 'Builder',
      label: 'Builder',
    }),
    spawnPoint('evaluator', 544, 288, {
      role: 'evaluator',
      displayName: 'Evaluator',
      label: 'Evaluator',
    }),
    spawnPoint('perf-monitor', 544, 416, {
      role: 'performance_monitor',
      displayName: 'Performance Monitor',
      label: 'Monitor',
    }),
  ];

  const objects = [
    // the entrance door — interactive so the floor can later "exit" through it
    interactiveRect('door', 288, 32, 64, 64, {
      objectType: 'door',
      label: 'Exit',
      panelTarget: 'exit',
    }),
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
