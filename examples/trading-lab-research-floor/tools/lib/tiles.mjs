import { Img, makeRng, seedFromString, upscale } from './img.mjs';
import { nightify, PAL } from './palette.mjs';

/**
 * Environment + furniture tiles (32×32). The array order is the tileset
 * order: local tile id = index, gid = index + 1 (firstgid = 1).
 * `generate-map.mjs` imports the same module, so map and image never drift.
 *
 * Visual Iteration 2: all art is drawn on a logical 16-px grid and upscaled
 * ×2 onto the 32-px tiles ("chunky" classic pixel-art — large shapes, no
 * micro-detail). Drawn once in the Day Office palette; the night tileset is
 * derived via `nightify()` (see palette.mjs). Tiles that need real night art
 * (windows) are `themed` and draw per theme.
 *
 * Workstations face the viewer (Iteration 3): the desk is a 2×1-tile block
 * with a laptop on it, lid back toward the viewer, and the agent sits
 * BEHIND it (one row up), front-facing. The laptop lid carries a single
 * glowing glyph — a generic mark, no real-world logo, no fake charts.
 */

export const TILE_SIZE = 32;
export const TILESET_COLUMNS = 8;
export const THEMES = ['day', 'night'];

/** Copy a TILE_SIZE×TILE_SIZE region of `src` into tile `img`. */
function copyRegion(img, src, sx, sy) {
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const si = ((sy + y) * src.width + (sx + x)) * 4;
      const di = (y * img.width + x) * 4;
      img.data[di] = src.data[si];
      img.data[di + 1] = src.data[si + 1];
      img.data[di + 2] = src.data[si + 2];
      img.data[di + 3] = src.data[si + 3];
    }
  }
}

/** Wrap a logical-16 draw function into a 32-px tile draw. */
function chunky(draw) {
  return (img, theme) => {
    const logical = new Img(img.width / 2, img.height / 2);
    draw(logical, theme);
    img.blit(upscale(logical, 2), 0, 0);
  };
}

// ---------------------------------------------------------------------------
// floors (logical 16×16)
// ---------------------------------------------------------------------------

function plankFloor(img, seed, base) {
  const rng = makeRng(seed);
  img.rect(0, 0, 16, 16, base);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const r = rng();
      if (r < 0.03) img.px(x, y, PAL.plankHi);
      else if (r > 0.97) img.px(x, y, PAL.plank);
    }
  }
  // plank seams every 4 logical px + staggered butt joints
  for (let band = 0; band < 4; band++) {
    const y = band * 4 + 3;
    img.hline(0, 15, y, PAL.floorSeam);
    const joint = (band * 7 + Math.floor(rng() * 4) * 4) % 16;
    img.vline(joint, band * 4, y - 1, PAL.plank);
  }
}

function rugTile(img, edges, colors) {
  img.rect(0, 0, 16, 16, colors.base);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      if ((x * 7 + y * 5) % 13 < 2) img.px(x, y, colors.dot);
    }
  }
  if (edges.top) {
    img.hline(0, 15, 0, colors.edge);
    img.hline(0, 15, 1, colors.border);
  }
  if (edges.bottom) {
    img.hline(0, 15, 15, colors.edge);
    img.hline(0, 15, 14, colors.border);
  }
  if (edges.left) {
    img.vline(0, 0, 15, colors.edge);
    img.vline(1, 0, 15, colors.border);
  }
  if (edges.right) {
    img.vline(15, 0, 15, colors.edge);
    img.vline(14, 0, 15, colors.border);
  }
  if (colors.corner && edges.top && edges.left) img.px(3, 3, colors.corner);
  if (colors.corner && edges.top && edges.right) img.px(12, 3, colors.corner);
  if (colors.corner && edges.bottom && edges.left) img.px(3, 12, colors.corner);
  if (colors.corner && edges.bottom && edges.right) img.px(12, 12, colors.corner);
}

const BOSS_RUG_COLORS = {
  base: PAL.brug,
  dot: PAL.brugDot,
  border: PAL.brugBorder,
  edge: PAL.brugEdge,
  corner: PAL.brugGold,
};

/** Cool office carpet under the desk wings — contrast against the planks. */
const WORK_CARPET_COLORS = {
  base: PAL.crug,
  dot: PAL.crugDot,
  border: PAL.crugBorder,
  edge: PAL.crugEdge,
};

/** Raised tech floor inside the glass server room. */
function techFloor(img) {
  img.rect(0, 0, 16, 16, PAL.techFloor);
  for (let i = 0; i < 16; i += 8) {
    img.hline(0, 15, i + 7, PAL.techSeam);
    img.vline(i + 7, 0, 15, PAL.techSeam);
  }
  img.px(2, 2, PAL.techFloorHi);
  img.px(11, 5, PAL.techFloorHi);
  img.px(5, 12, PAL.techFloorHi);
  // one status LED per tile — glows at night via the emissive pass
  img.px(13, 10, PAL.cyan);
}

const RUG_EDGES = {
  tl: { top: true, left: true },
  t: { top: true },
  tr: { top: true, right: true },
  l: { left: true },
  c: {},
  r: { right: true },
  bl: { bottom: true, left: true },
  b: { bottom: true },
  br: { bottom: true, right: true },
};

// ---------------------------------------------------------------------------
// walls (logical 16×16)
// ---------------------------------------------------------------------------

function wallCap(img) {
  img.rect(0, 0, 16, 16, PAL.wallTop);
  img.hline(0, 15, 0, PAL.wallTopHi);
  img.hline(0, 15, 15, PAL.wallTopLo);
  img.vline(7, 1, 14, PAL.wallTopLo);
}

function wallFaceUpper(img) {
  img.rect(0, 0, 16, 16, PAL.wallFace);
  img.hline(0, 15, 0, PAL.wallFaceHi);
  img.vline(15, 1, 15, PAL.wallSeam);
}

function wallFaceLower(img) {
  img.rect(0, 0, 16, 6, PAL.wallFace);
  img.vline(15, 0, 5, PAL.wallSeam);
  img.hline(0, 15, 6, PAL.wainscotLine);
  img.rect(0, 7, 16, 6, PAL.wainscot);
  img.vline(3, 8, 12, PAL.wainscotLine);
  img.vline(11, 8, 12, PAL.wainscotLine);
  img.rect(0, 13, 16, 3, PAL.baseboard);
  img.hline(0, 15, 15, PAL.baseboardLo);
}

// ---------------------------------------------------------------------------
// big multi-tile art (logical, cached, upscaled once)
// ---------------------------------------------------------------------------

function wallBacking32() {
  const img = new Img(32, 32);
  for (const ox of [0, 16]) {
    const u = new Img(16, 16);
    wallFaceUpper(u);
    img.blit(u, ox, 0);
    const l = new Img(16, 16);
    wallFaceLower(l);
    img.blit(l, ox, 16);
  }
  return img;
}

let _winDay = null;
let _winNight = null;

function windowDayLogical() {
  const img = wallBacking32();
  // frame
  img.rect(2, 1, 28, 21, PAL.frame);
  img.outline(2, 1, 28, 21, PAL.frameDark);
  img.hline(3, 28, 2, PAL.frameHi);
  // glass
  img.rect(4, 3, 24, 17, PAL.sky);
  img.rect(4, 3, 24, 5, PAL.skyHi);
  // sun + clouds
  img.rect(6, 4, 4, 3, PAL.sun);
  img.px(7, 3, PAL.sun);
  img.rect(12, 6, 6, 2, PAL.cloud);
  img.rect(20, 11, 5, 2, PAL.cloud);
  img.rect(7, 13, 4, 2, PAL.cloud);
  // mullions
  img.rect(15, 3, 2, 17, PAL.frame);
  img.rect(4, 11, 24, 1, PAL.frame);
  // sill
  img.rect(1, 22, 30, 2, PAL.sill);
  img.hline(1, 30, 23, PAL.frameDark);
  return img;
}

function windowBig() {
  if (_winDay) return _winDay;
  return (_winDay = upscale(windowDayLogical(), 2));
}

function windowNightBig() {
  if (_winNight) return _winNight;
  const img = nightify(windowDayLogical());
  const glass = (x, y, w, h) => {
    img.rect(x, y, w, h, PAL.nightSky);
    img.rect(x, y, w, 2, PAL.nightSkyHi);
  };
  glass(4, 3, 11, 8);
  glass(17, 3, 11, 8);
  glass(4, 12, 11, 8);
  glass(17, 12, 11, 8);
  // moon + stars
  img.rect(22, 4, 3, 3, PAL.moon);
  img.px(22, 4, PAL.nightSkyHi);
  for (const [x, y, dim] of [
    [6, 5, false],
    [10, 4, true],
    [13, 7, false],
    [19, 6, true],
    [26, 8, false],
    [6, 13, true],
    [12, 14, false],
    [25, 14, true],
  ]) {
    img.px(x, y, dim ? PAL.starDim : PAL.star);
  }
  // city skyline at the bottom of the glass
  for (const [x, w, h] of [
    [5, 3, 3],
    [9, 2, 5],
    [12, 3, 2],
    [18, 2, 4],
    [21, 3, 2],
    [25, 3, 4],
  ]) {
    img.rect(x, 20 - h, w, h, PAL.city);
    img.px(x + 1, 20 - h + 1, PAL.cityLit);
  }
  return (_winNight = upscale(img, 2));
}

let _door = null;

function doorBig() {
  if (_door) return _door;
  const img = wallBacking32();
  // transom + frame + opening
  img.rect(9, 0, 14, 2, PAL.doorFrame);
  img.rect(5, 2, 22, 30, PAL.doorFrame);
  img.rect(7, 4, 18, 28, PAL.door);
  img.hline(7, 24, 4, PAL.doorHi);
  img.vline(7, 4, 31, PAL.doorHi);
  // two leaves
  img.vline(15, 5, 31, PAL.doorDark);
  img.vline(16, 5, 31, PAL.doorDark);
  // inset panels
  for (const ox of [9, 18]) {
    img.outline(ox, 7, 5, 8, PAL.doorDark);
    img.outline(ox, 19, 5, 8, PAL.doorDark);
  }
  // handles
  img.rect(13, 16, 2, 3, PAL.handle);
  img.rect(17, 16, 2, 3, PAL.handle);
  return (_door = upscale(img, 2));
}

let _shelf = null;

function bookshelfBig() {
  if (_shelf) return _shelf;
  const img = new Img(16, 32);
  img.rect(1, 1, 14, 29, PAL.shelfFrame);
  img.outline(1, 1, 14, 29, PAL.shelfDark);
  img.hline(2, 14, 2, '#a87f55');
  const spines = ['#b85a50', '#5878b8', '#58a070', '#c9a23e', '#8a6acd', '#d08848'];
  for (let shelf = 0; shelf < 3; shelf++) {
    const y = 4 + shelf * 7;
    img.rect(3, y, 10, 5, PAL.shelfDark);
    img.hline(2, 13, y + 5, PAL.shelfBoard);
    for (let i = 0; i < 5; i++) {
      const color = spines[(i + shelf * 2) % spines.length];
      const h = 4 + ((i + shelf) % 2);
      img.rect(3 + i * 2, y + 5 - h, 2, h, color);
    }
  }
  // lower cabinet
  img.rect(3, 25, 10, 4, PAL.shelfBoard);
  img.outline(3, 25, 10, 4, PAL.shelfDark);
  img.vline(8, 26, 28, PAL.shelfDark);
  img.px(6, 27, PAL.handle);
  img.px(10, 27, PAL.handle);
  // feet
  img.rect(2, 30, 3, 2, PAL.shelfDark);
  img.rect(11, 30, 3, 2, PAL.shelfDark);
  return (_shelf = upscale(img, 2));
}

let _vending = null;

function vendingBig() {
  if (_vending) return _vending;
  const img = new Img(16, 32);
  img.rect(2, 0, 12, 30, PAL.vending);
  img.outline(2, 0, 12, 30, PAL.vendingDark);
  img.vline(3, 1, 28, PAL.vendingHi);
  // header
  img.rect(4, 2, 8, 2, PAL.vendingDark);
  img.hline(5, 9, 2, PAL.cyan);
  // product window
  img.rect(4, 6, 7, 15, PAL.screenDeep);
  img.outline(4, 6, 7, 15, PAL.vendingDark);
  const snacks = ['#d08848', '#b85a50', '#58a070', '#c9a23e', '#5878b8', '#c46a9a'];
  for (let row = 0; row < 4; row++) {
    const y = 7 + row * 4;
    for (let i = 0; i < 3; i++) {
      img.rect(5 + i * 2, y, 1, 2, snacks[(row + i * 2) % snacks.length]);
    }
    img.hline(5, 10, y + 2, '#3a414e');
  }
  // coin panel
  img.rect(12, 7, 2, 6, PAL.steelPanel);
  img.px(12, 8, PAL.amber);
  // dispense slot
  img.rect(4, 23, 7, 4, PAL.steelPanel);
  img.rect(5, 24, 5, 2, '#10131f');
  // feet
  img.rect(3, 30, 3, 2, PAL.vendingDark);
  img.rect(10, 30, 3, 2, PAL.vendingDark);
  return (_vending = upscale(img, 2));
}

// ---------------------------------------------------------------------------
// workstation desks (2×1 tiles: desk surface + laptop, lid back toward the
// viewer; the agent sits BEHIND the desk, one row up, facing the viewer)
// ---------------------------------------------------------------------------

const _desks = new Map();

function deskBig(variant) {
  const cached = _desks.get(variant);
  if (cached) return cached;
  const img = new Img(32, 16); // logical 32×16 → 64×32 px (2×1 tiles)

  // --- desk body: surface + front face, outlined dark -----------------------
  img.rect(1, 4, 30, 10, PAL.deskTop);
  img.hline(2, 29, 4, PAL.deskHi);
  img.hline(2, 29, 5, PAL.deskHi);
  img.hline(3, 28, 8, PAL.deskGrain);
  img.hline(3, 28, 10, PAL.deskGrain);
  // front face
  img.rect(2, 11, 28, 3, PAL.deskFace);
  img.hline(2, 29, 11, PAL.deskDark);
  img.outline(1, 4, 30, 10, PAL.deskOutline);
  // legs
  img.rect(3, 14, 2, 2, PAL.deskLeg);
  img.rect(27, 14, 2, 2, PAL.deskLeg);

  // --- laptop centred, lid back toward the viewer ---------------------------
  // The lid rises above the desk edge so it overlaps the agent's chest.
  img.rect(12, 0, 8, 7, PAL.bezel);
  img.outline(12, 0, 8, 7, PAL.bezelDark);
  img.hline(13, 18, 1, PAL.bezelHi);
  // hinge + base peeking out at the bottom of the lid
  img.hline(11, 20, 7, PAL.bezelDark);
  img.hline(12, 19, 8, PAL.bezelHi);

  // a single glowing mark on the lid — generic, no real-world logo
  if (variant === 'a') {
    // pulse bars
    img.rect(14, 3, 1, 2, PAL.cyanDim);
    img.rect(16, 2, 1, 3, PAL.cyan);
    img.rect(18, 3, 1, 2, PAL.cyanDim);
  } else {
    // terminal chevron
    img.px(14, 2, PAL.green);
    img.px(15, 3, PAL.green);
    img.px(14, 4, PAL.green);
    img.rect(17, 4, 2, 1, PAL.greenDim);
  }

  // --- desk dressing per variant --------------------------------------------
  if (variant === 'a') {
    // mug with steam
    img.rect(24, 5, 3, 3, PAL.mug);
    img.hline(24, 26, 5, PAL.mugHi);
    img.px(27, 6, PAL.mug);
    img.px(25, 3, PAL.steam);
  } else {
    // papers + pen
    img.rect(4, 6, 5, 3, PAL.paper);
    img.px(4, 8, PAL.paperShade);
    img.hline(5, 7, 7, PAL.paperLine);
    img.rect(25, 6, 3, 1, PAL.steelPanel);
  }

  const up = upscale(img, 2);
  _desks.set(variant, up);
  return up;
}

// ---------------------------------------------------------------------------
// boss command console (4×1 tiles). Drawn as tiles — not a sprite object —
// so the Boss's nameplate chip (rendered in the entity layer) always draws
// above it. The Boss sits BEHIND it facing the viewer: the three command
// monitors show their BACKS (vents, stands, status LEDs — no fake charts).
// ---------------------------------------------------------------------------

let _console = null;

function consoleBig() {
  if (_console) return _console;
  const img = new Img(64, 16); // logical 64×16 → 128×32 px (4×1 tiles)
  // wide command desk
  img.rect(1, 8, 62, 7, PAL.consoleTop);
  img.hline(2, 61, 8, PAL.consoleTopHi);
  img.rect(2, 12, 60, 3, PAL.consoleFace);
  img.hline(2, 61, 12, PAL.gold);
  img.outline(1, 8, 62, 7, '#2b2448');
  img.rect(4, 15, 3, 1, PAL.consoleLeg);
  img.rect(57, 15, 3, 1, PAL.consoleLeg);
  // three monitor backs (center one slightly taller)
  const back = (x, y, h, led) => {
    img.rect(x, y, 14, h, PAL.bezel);
    img.outline(x, y, 14, h, '#10131c');
    img.hline(x + 1, x + 12, y + 1, PAL.bezelHi);
    img.hline(x + 3, x + 10, y + 3, PAL.bezelDark);
    img.hline(x + 3, x + 10, y + 5, PAL.bezelDark);
    img.rect(x + 6, y + h, 2, Math.max(1, 9 - (y + h)), PAL.bezelDark); // stand
    img.px(x + 11, y + h - 2, led);
  };
  back(7, 2, 6, PAL.cyan);
  back(25, 1, 7, PAL.violet);
  back(43, 2, 6, PAL.gold);
  // screen glow spilling over the top edges (screens face the Boss)
  img.hline(9, 19, 1, PAL.cyanDark);
  img.hline(27, 37, 0, '#46356e');
  img.hline(45, 55, 1, PAL.goldDim);
  return (_console = upscale(img, 2));
}

// ---------------------------------------------------------------------------
// glass partition (infra/server room) — translucent panes over the floor
// ---------------------------------------------------------------------------

/** Horizontal run of the glass partition (wall runs east-west). */
function glassWallH(img) {
  // top cap (seen from above)
  img.rect(0, 2, 16, 2, PAL.glassFrame);
  img.hline(0, 15, 2, PAL.glassFrameHi);
  // pane
  img.rect(1, 4, 14, 8, PAL.glassPane);
  img.px(3, 5, PAL.glassPaneHi);
  img.px(4, 6, PAL.glassPaneHi);
  img.px(10, 8, PAL.glassPaneHi);
  // posts at the tile edges
  img.vline(0, 2, 13, PAL.glassFrameDark);
  img.vline(15, 2, 13, PAL.glassFrameDark);
  // base rail
  img.rect(0, 12, 16, 2, PAL.glassFrame);
  img.hline(0, 15, 13, PAL.glassFrameDark);
}

/** Sliding glass door leaf; `side` = 'l' | 'r' (handle on the inner edge). */
function glassDoor(img, side) {
  glassWallH(img);
  const inner = side === 'l' ? 13 : 2;
  // handle bar + sensor LED
  img.vline(inner, 4, 11, PAL.glassFrameHi);
  img.px(inner, 6, PAL.cyan);
  // mark the leaf gap between the two door tiles
  const edge = side === 'l' ? 15 : 0;
  img.vline(edge, 3, 12, PAL.glassFrameHi);
}

/** Vertical run (wall runs north-south): a narrow framed band. */
function glassWallV(img) {
  img.rect(6, 0, 4, 16, PAL.glassPane);
  img.vline(6, 0, 15, PAL.glassFrameDark);
  img.vline(9, 0, 15, PAL.glassFrameHi);
  img.px(7, 3, PAL.glassPaneHi);
  img.px(8, 9, PAL.glassPaneHi);
  img.px(7, 13, PAL.glassPaneHi);
}

/** Corner where the horizontal partition meets a vertical side wall. */
function glassCorner(img) {
  glassWallH(img);
  // stub running south to meet the vertical wall in the tile below
  img.rect(6, 12, 4, 4, PAL.glassPane);
  img.vline(6, 12, 15, PAL.glassFrameDark);
  img.vline(9, 12, 15, PAL.glassFrameHi);
}

// ---------------------------------------------------------------------------
// big water cooler (1×2 tiles — recognizable from across the room)
// ---------------------------------------------------------------------------

function waterCoolerBig() {
  const img = new Img(16, 32);
  // big bottle
  img.rect(4, 2, 8, 10, PAL.bottle);
  img.outline(4, 2, 8, 10, '#6da8c8');
  img.rect(5, 3, 2, 6, PAL.bottleHi);
  img.hline(5, 10, 9, '#7fc2e2');
  // neck + collar
  img.rect(6, 12, 4, 2, '#6da8c8');
  // unit body
  img.rect(3, 14, 10, 14, PAL.cooler);
  img.outline(3, 14, 10, 14, PAL.coolerDark);
  img.vline(4, 15, 26, '#eef3f7');
  // dispense recess + taps
  img.rect(5, 16, 6, 4, PAL.coolerShade);
  img.px(6, 16, '#5878b8');
  img.px(9, 16, PAL.redDim);
  img.rect(7, 19, 2, 1, PAL.coolerDark); // drip tray
  // vents
  img.hline(5, 10, 23, PAL.coolerDark);
  img.hline(5, 10, 25, PAL.coolerDark);
  // feet
  img.rect(4, 28, 2, 2, PAL.coolerDark);
  img.rect(10, 28, 2, 2, PAL.coolerDark);
  return upscale(img, 2);
}

let _cooler = null;

function coolerBigCached() {
  if (!_cooler) _cooler = waterCoolerBig();
  return _cooler;
}

// ---------------------------------------------------------------------------
// tile defs
// ---------------------------------------------------------------------------

export const TILE_DEFS = [
  {
    name: 'floor_a',
    draw: chunky((img) => plankFloor(img, seedFromString('floor_a'), PAL.floorA)),
  },
  {
    name: 'floor_b',
    draw: chunky((img) => plankFloor(img, seedFromString('floor_b'), PAL.floorB)),
  },
  {
    name: 'floor_shadow',
    draw: chunky((img) => {
      plankFloor(img, seedFromString('floor_shadow'), PAL.floorB);
      img.rect(0, 0, 16, 2, '#54401f88');
      img.hline(0, 15, 2, '#54401f44');
    }),
  },
  // one wide doormat under the door, split over two tiles
  ...['l', 'r'].map((side) => ({
    name: `doormat_${side}`,
    draw: chunky((img) => {
      plankFloor(img, seedFromString(`doormat_${side}`), PAL.floorB);
      const x = side === 'l' ? 2 : 0;
      const w = side === 'l' ? 14 : 14;
      img.rect(x, 3, w, 11, PAL.matBase);
      img.hline(x, x + w - 1, 3, PAL.matLine);
      img.hline(x, x + w - 1, 13, PAL.matLine);
      img.hline(x, x + w - 1, 4, PAL.matHi);
      if (side === 'l') img.vline(2, 3, 13, PAL.matLine);
      else img.vline(13, 3, 13, PAL.matLine);
      for (let i = 0; i < 3; i++) img.hline(x + 2, x + w - 3, 6 + i * 3, PAL.matLine);
    }),
  })),
  ...Object.entries(RUG_EDGES).map(([key, edges]) => ({
    name: `brug_${key}`,
    draw: chunky((img) => rugTile(img, edges, BOSS_RUG_COLORS)),
  })),
  // work-zone carpet under the desk wings (9-slice like the boss rug)
  ...Object.entries(RUG_EDGES).map(([key, edges]) => ({
    name: `crug_${key}`,
    draw: chunky((img) => rugTile(img, edges, WORK_CARPET_COLORS)),
  })),
  // raised tech floor inside the glass server room
  { name: 'floor_tech', draw: chunky(techFloor) },
  { name: 'wall_top', draw: chunky(wallCap) },
  { name: 'wall_face_u', draw: chunky(wallFaceUpper) },
  { name: 'wall_face_l', draw: chunky(wallFaceLower) },
  {
    name: 'wall_vent',
    draw: chunky((img) => {
      wallFaceUpper(img);
      img.rect(4, 5, 8, 6, PAL.vent);
      img.outline(4, 5, 8, 6, PAL.ventDark);
      img.hline(5, 10, 7, PAL.ventDark);
      img.hline(5, 10, 9, PAL.ventDark);
    }),
  },
  {
    name: 'wall_clock',
    draw: chunky((img) => {
      wallFaceUpper(img);
      img.rect(5, 3, 6, 6, PAL.clockRim);
      img.px(5, 3, PAL.wallFace);
      img.px(10, 3, PAL.wallFace);
      img.px(5, 8, PAL.wallFace);
      img.px(10, 8, PAL.wallFace);
      img.rect(6, 4, 4, 4, PAL.clockFace);
      img.px(7, 5, '#3a414e');
      img.px(8, 6, '#b8554f');
    }),
  },
  {
    name: 'poster',
    draw: chunky((img) => {
      wallFaceUpper(img);
      img.rect(4, 2, 8, 11, PAL.paper);
      img.outline(4, 2, 8, 11, '#8a7a5e');
      img.hline(5, 10, 4, PAL.paperLine);
      img.line(5, 10, 7, 8, PAL.cyanDim);
      img.line(7, 8, 8, 9, PAL.cyanDim);
      img.line(8, 9, 10, 6, PAL.cyanDim);
    }),
  },
  {
    name: 'notice_board',
    draw: chunky((img) => {
      wallFaceUpper(img);
      img.rect(2, 3, 12, 9, PAL.cork);
      img.outline(2, 3, 12, 9, PAL.shelfDark);
      img.rect(4, 5, 3, 3, PAL.paper);
      img.rect(8, 5, 3, 2, '#e7d089');
      img.rect(5, 9, 3, 2, '#bcd8a8');
      img.rect(10, 8, 3, 3, PAL.paperShade);
      img.px(5, 5, PAL.red);
      img.px(9, 5, '#5878b8');
    }),
  },
  // 2×2 window (themed: day sky / night sky)
  ...['tl', 'tr', 'bl', 'br'].map((corner, i) => ({
    name: `window_${corner}`,
    themed: true,
    draw(img, theme) {
      const big = theme === 'night' ? windowNightBig() : windowBig();
      copyRegion(img, big, (i % 2) * 32, Math.floor(i / 2) * 32);
    },
  })),
  // 2×2 double door
  ...['tl', 'tr', 'bl', 'br'].map((corner, i) => ({
    name: `door_${corner}`,
    draw(img) {
      copyRegion(img, doorBig(), (i % 2) * 32, Math.floor(i / 2) * 32);
    },
  })),
  // 2×1 workstation desks (laptop on top), two dressing variants
  ...['a', 'b'].flatMap((variant) =>
    ['l', 'r'].map((side, i) => ({
      name: `desk_${variant}_${side}`,
      draw(img) {
        copyRegion(img, deskBig(variant), i * 32, 0);
      },
    })),
  ),
  // 4×1 boss command console (monitor backs toward the viewer)
  ...['l', 'ml', 'mr', 'r'].map((part, i) => ({
    name: `console_${part}`,
    draw(img) {
      copyRegion(img, consoleBig(), i * 32, 0);
    },
  })),
  // glass partition of the infra/server room
  { name: 'glass_h', draw: chunky(glassWallH) },
  { name: 'glass_door_l', draw: chunky((img) => glassDoor(img, 'l')) },
  { name: 'glass_door_r', draw: chunky((img) => glassDoor(img, 'r')) },
  { name: 'glass_v', draw: chunky(glassWallV) },
  { name: 'glass_corner', draw: chunky(glassCorner) },
  {
    name: 'bookshelf_top',
    draw(img) {
      copyRegion(img, bookshelfBig(), 0, 0);
    },
  },
  {
    name: 'bookshelf_bottom',
    draw(img) {
      copyRegion(img, bookshelfBig(), 0, 32);
    },
  },
  {
    name: 'plant_big',
    draw: chunky((img) => {
      img.rect(5, 11, 6, 4, PAL.pot);
      img.hline(4, 11, 11, PAL.potRim);
      img.rect(6, 15, 4, 1, PAL.shelfDark);
      img.rect(4, 3, 8, 8, PAL.leafDark);
      img.rect(5, 2, 6, 5, PAL.leaf);
      img.rect(3, 5, 3, 4, PAL.leaf);
      img.rect(10, 5, 3, 4, PAL.leafDark);
      img.px(6, 2, PAL.leafHi);
      img.px(9, 4, PAL.leafHi);
      img.px(4, 6, PAL.leafHi);
    }),
  },
  {
    name: 'plant_small',
    draw: chunky((img) => {
      img.rect(6, 11, 4, 3, PAL.pot);
      img.hline(5, 10, 11, PAL.potRim);
      img.rect(6, 6, 4, 5, PAL.leafDark);
      img.rect(7, 5, 2, 4, PAL.leaf);
      img.px(7, 4, PAL.leafHi);
      img.px(6, 7, PAL.leafHi);
    }),
  },
  {
    // office bin: wide ribbed body, dark rim with a swing slot
    name: 'trash_bin',
    draw: chunky((img) => {
      img.rect(4, 6, 8, 8, PAL.bin);
      img.outline(4, 6, 8, 8, PAL.binDark);
      for (let x = 6; x <= 10; x += 2) img.vline(x, 7, 12, PAL.binDark);
      img.vline(5, 7, 12, PAL.binHi);
      // rim + swing slot
      img.rect(3, 4, 10, 2, PAL.binDark);
      img.hline(3, 12, 4, PAL.binHi);
      img.rect(6, 5, 4, 1, '#10131f');
      // base shadow
      img.hline(5, 10, 14, PAL.binDark);
    }),
  },
  {
    name: 'water_cooler_top',
    draw(img) {
      copyRegion(img, coolerBigCached(), 0, 0);
    },
  },
  {
    name: 'water_cooler_bottom',
    draw(img) {
      copyRegion(img, coolerBigCached(), 0, 32);
    },
  },
  {
    name: 'vending_top',
    draw(img) {
      copyRegion(img, vendingBig(), 0, 0);
    },
  },
  {
    name: 'vending_bottom',
    draw(img) {
      copyRegion(img, vendingBig(), 0, 32);
    },
  },
  {
    name: 'cabinet_coffee',
    draw: chunky((img) => {
      // low cabinet
      img.rect(1, 8, 14, 7, PAL.shelfFrame);
      img.outline(1, 8, 14, 7, PAL.shelfDark);
      img.hline(2, 13, 9, '#a87f55');
      img.vline(8, 10, 14, PAL.shelfDark);
      img.px(6, 11, PAL.handle);
      img.px(10, 11, PAL.handle);
      // coffee machine on top
      img.rect(3, 2, 6, 6, PAL.steel);
      img.outline(3, 2, 6, 6, PAL.steelDark);
      img.rect(4, 3, 4, 2, PAL.steelPanel);
      img.px(7, 4, PAL.green);
      img.rect(4, 6, 2, 2, PAL.amberDim);
      img.px(4, 1, PAL.steam);
      // cups
      img.rect(11, 5, 2, 3, PAL.paper);
      img.rect(13, 6, 1, 2, PAL.paperShade);
    }),
  },
];

export const TILE_NAMES = TILE_DEFS.map((def) => def.name);

export function tileGid(name) {
  const index = TILE_NAMES.indexOf(name);
  if (index === -1) throw new Error(`Unknown tile "${name}"`);
  return index + 1;
}

/** @param {'day'|'night'} theme */
export function renderTileset(theme = 'day') {
  const rows = Math.ceil(TILE_DEFS.length / TILESET_COLUMNS);
  const sheet = new Img(TILESET_COLUMNS * TILE_SIZE, rows * TILE_SIZE);
  TILE_DEFS.forEach((def, i) => {
    let tile = new Img(TILE_SIZE, TILE_SIZE);
    if (def.themed) {
      def.draw(tile, theme);
    } else {
      def.draw(tile);
      if (theme === 'night') tile = nightify(tile);
    }
    sheet.blit(
      tile,
      (i % TILESET_COLUMNS) * TILE_SIZE,
      Math.floor(i / TILESET_COLUMNS) * TILE_SIZE,
    );
  });
  return sheet;
}
