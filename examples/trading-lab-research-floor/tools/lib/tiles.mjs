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
 * Workstations face the viewer (Iteration 3/4): the desk is a 2×1-tile
 * block with a slim aluminum desktop monitor on it whose screen faces the
 * agent — the viewer sees the monitor's BACK with a single glowing mark
 * (generic, no real-world logo, no fake charts). The agent sits BEHIND the
 * desk (one row up), front-facing. The floor is ONE shared plank texture —
 * no zone carpets; desks contrast through dark espresso wood + the light
 * aluminum monitor.
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

/**
 * Edge tile for the server-room side walls: plank (common floor) on the outer
 * half, raised tech floor on the room half. The centered glass-wall band hides
 * the seam, so the tech floor reads flush to the wall and never spills outside
 * the room. `side` = 'l' (left wall → tech on the EAST half) | 'r' (right wall
 * → tech on the WEST half).
 */
function techFloorEdge(img, side) {
  plankFloor(img, seedFromString('floor_tech_edge'), PAL.floorB);
  const techWest = side === 'r';
  const tx0 = techWest ? 0 : 8;
  for (let y = 0; y < 16; y++) {
    for (let x = tx0; x < tx0 + 8; x++) img.px(x, y, PAL.techFloor);
  }
  img.hline(tx0, tx0 + 7, 7, PAL.techSeam);
  img.hline(tx0, tx0 + 7, 15, PAL.techSeam);
  img.vline(techWest ? 0 : 15, 0, 15, PAL.techSeam); // outer edge seam
  img.vline(techWest ? 7 : 8, 0, 15, PAL.techSeam); // boundary seam (under the band)
  img.px(tx0 + 3, 4, PAL.techFloorHi);
  img.px(tx0 + 5, 11, PAL.techFloorHi);
  img.px(techWest ? 2 : 13, 10, PAL.cyan);
}

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
// workstation desks (2×1 tiles: dark espresso desk + a slim aluminum
// desktop monitor whose SCREEN faces the agent — the viewer sees its back
// with a single glowing mark (generic, no real-world logo). The agent sits
// BEHIND the desk, one row up, facing the viewer.
// ---------------------------------------------------------------------------

const _desks = new Map();

function deskBig(variant) {
  const cached = _desks.get(variant);
  if (cached) return cached;
  const img = new Img(32, 16); // logical 32×16 → 64×32 px (2×1 tiles)

  // --- desk body: surface + front face, outlined near-black -----------------
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

  // --- slim aluminum monitor, back to the viewer -----------------------------
  // The slab rises above the desk edge so it overlaps the agent's chest.
  // Rounded by construction: the top row is one px narrower on each side.
  img.rect(10, 1, 12, 7, PAL.alu);
  img.hline(11, 20, 0, PAL.aluHi);
  img.hline(11, 20, 1, PAL.aluHi);
  img.vline(10, 1, 6, PAL.aluEdge);
  img.vline(21, 1, 6, PAL.aluEdge);
  img.hline(10, 21, 7, PAL.aluDark);
  // glowing mark centred on the back — generic, no real-world logo
  img.rect(15, 3, 2, 2, PAL.markGlow);
  img.px(16, 2, PAL.markGlow);
  // stand: neck + foot on the desk
  img.rect(15, 8, 2, 2, PAL.aluDark);
  img.rect(13, 10, 6, 1, PAL.aluEdge);

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
// boss command console (4×2 tiles, mahogany). Drawn as tiles — not a sprite
// object — so the Boss's nameplate chip (rendered in the entity layer)
// always draws above it. The Boss sits BEHIND it facing the viewer: the
// three aluminum monitors show their BACKS (screens face the Boss), each
// with the same glowing generic mark as the workstation monitors.
// ---------------------------------------------------------------------------

let _console = null;

function consoleBig() {
  if (_console) return _console;
  const img = new Img(64, 32); // logical 64×32 → 128×64 px (4×2 tiles)

  // --- deep mahogany executive desk -----------------------------------------
  // The top surface fills from the console's back edge (just under the Boss)
  // down to the front face, so the monitors stand on ONE continuous desktop —
  // no floor strip showing above the surface, no desk edge crossing them.
  img.rect(1, 1, 62, 20, PAL.mahogany); // top surface y1..21
  img.hline(2, 61, 1, PAL.mahoganyHi); // back edge (hidden behind the Boss)
  img.hline(3, 60, 6, PAL.mahoganyGrain);
  img.hline(3, 60, 17, PAL.mahoganyGrain);

  // --- three aluminum monitors standing ON the surface (back to viewer) ------
  const back = (x, y, w, h) => {
    img.rect(x, y + 1, w, h - 1, PAL.alu);
    img.hline(x + 1, x + w - 2, y, PAL.aluHi);
    img.hline(x + 1, x + w - 2, y + 1, PAL.aluHi);
    img.vline(x, y + 1, y + h - 2, PAL.aluEdge);
    img.vline(x + w - 1, y + 1, y + h - 2, PAL.aluEdge);
    img.hline(x, x + w - 1, y + h - 1, PAL.aluDark);
    // glowing mark on the back
    const cx = x + Math.floor(w / 2) - 1;
    const cy = y + Math.floor(h / 2) - 1;
    img.rect(cx, cy, 2, 2, PAL.markGlow);
    img.px(cx + 1, cy - 1, PAL.markGlow);
    // stand: neck + a wide foot plate resting on the desk surface
    const nx = x + Math.floor(w / 2) - 1;
    img.rect(nx, y + h, 2, 3, PAL.aluDark); // neck
    img.rect(nx - 3, y + h + 3, 8, 1, PAL.aluEdge); // foot plate
    img.hline(nx - 3, nx + 4, y + h + 4, PAL.mahoganyGrain); // contact shadow
  };
  // three identical monitors, aligned on one line
  back(6, 2, 14, 9);
  back(25, 2, 14, 9);
  back(44, 2, 14, 9);

  // --- front face with raised panels + a gold inlay line under the desktop ---
  img.rect(2, 21, 60, 9, PAL.mahoganyFace);
  img.hline(2, 61, 21, PAL.gold);
  for (const px of [6, 26, 46]) {
    img.outline(px, 23, 12, 5, PAL.mahoganyDark);
    img.hline(px + 1, px + 10, 24, PAL.mahoganyHi);
  }
  img.outline(1, 1, 62, 29, PAL.mahoganyOutline);
  // legs + floor shadow
  img.rect(3, 30, 4, 2, PAL.mahoganyLeg);
  img.rect(57, 30, 4, 2, PAL.mahoganyLeg);
  img.hline(4, 59, 31, '#00000033');

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

/**
 * Sliding glass door leaf; `side` = 'l' | 'r'. Reads as a DOOR, not a wall
 * segment: a header track on top, a tall pane running down to the floor (no
 * base rail), a dark frame post on the outer edge and a handle bar + sensor
 * LED on the meeting edge.
 */
function glassDoor(img, side) {
  // header track
  img.rect(0, 2, 16, 2, PAL.glassFrame);
  img.hline(0, 15, 2, PAL.glassFrameHi);
  img.hline(0, 15, 3, PAL.glassFrameDark);
  // tall pane to the floor — the open path under it sells the doorway
  img.rect(1, 4, 14, 11, PAL.glassPane);
  img.px(3, 6, PAL.glassPaneHi);
  img.px(4, 7, PAL.glassPaneHi);
  img.px(10, 11, PAL.glassPaneHi);
  // outer frame post + meeting-edge stile with handle and sensor
  const outer = side === 'l' ? 0 : 15;
  const inner = side === 'l' ? 14 : 1;
  img.vline(outer, 2, 14, PAL.glassFrameDark);
  img.vline(side === 'l' ? 15 : 0, 4, 14, PAL.glassFrameHi);
  img.vline(inner, 5, 12, PAL.glassFrameDark);
  img.vline(inner, 7, 10, PAL.glassFrameHi);
  img.px(inner, 6, PAL.cyan);
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

/**
 * Corner tile: the horizontal run stops AT the vertical band instead of
 * crossing the whole tile, so the partition meets the side wall in a clean
 * right angle. `side` = 'l' (room's top-left corner) | 'r' (top-right).
 */
function glassCorner(img, side) {
  const x0 = side === 'l' ? 6 : 0;
  const x1 = side === 'l' ? 15 : 9;
  // clipped horizontal run: cap, pane, base rail
  img.rect(x0, 2, x1 - x0 + 1, 2, PAL.glassFrame);
  img.hline(x0, x1, 2, PAL.glassFrameHi);
  img.rect(x0 + 1, 4, x1 - x0 - 1, 8, PAL.glassPane);
  img.px(x0 + 3, 5, PAL.glassPaneHi);
  img.px(x0 + 5, 8, PAL.glassPaneHi);
  img.rect(x0, 12, x1 - x0 + 1, 2, PAL.glassFrame);
  img.hline(x0, x1, 13, PAL.glassFrameDark);
  // vertical band continuing south to meet the wall in the tile below
  img.rect(6, 2, 4, 14, PAL.glassPane);
  img.vline(6, 2, 15, PAL.glassFrameDark);
  img.vline(9, 2, 15, PAL.glassFrameHi);
  // corner post
  img.rect(6, 2, 4, 2, PAL.glassFrame);
  img.hline(6, 9, 2, PAL.glassFrameHi);
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
// leather lounge sofa (1×3 tiles) — vertical isometric 3-seater (after the
// sofa1.png reference): a padded backrest down the far side, a column of three
// puffy cushions seen from a top-3/4 angle, rounded arms capping the ends,
// and feet. `face` = 'e' (backrest west, seat opens east) | 'w' (mirror), so
// two face each other across the Boss's lounge.
// ---------------------------------------------------------------------------

/** Vertical iso sofa facing east, drawn in a logical 16×48 canvas. */
function sofaVertEast() {
  const img = new Img(16, 48);
  const FR = PAL.leatherDark; // frame body (backrest + arms)
  const OUT = PAL.leatherSeam; // seams / outline
  const FRH = PAL.leather; // frame highlight
  const CT = PAL.leatherHi; // cushion top
  const CS = PAL.leatherSheen; // cushion top sheen
  const CB = PAL.leather; // cushion front face
  const PIP = PAL.leatherPiping; // seat-edge piping

  // floor contact shadow
  img.rect(2, 46, 13, 2, '#00000026');

  // rolled arm caps (north + south)
  img.rect(1, 1, 14, 7, FR);
  img.outline(1, 1, 14, 7, OUT);
  img.hline(3, 12, 1, FRH);
  img.px(1, 1, OUT);
  img.px(14, 1, OUT);
  img.rect(1, 40, 14, 7, FR);
  img.outline(1, 40, 14, 7, OUT);
  img.hline(3, 12, 41, FRH);

  // backrest down the west (far) side
  img.rect(1, 8, 4, 32, FR);
  img.outline(1, 8, 4, 32, OUT);
  img.vline(2, 9, 38, FRH);

  // three stacked cushions (top surface + front face = iso look)
  for (let c = 0; c < 3; c++) {
    const y0 = 8 + c * 11; // 8, 19, 30
    const h = c === 2 ? 10 : 11;
    img.rect(5, y0, 9, h, CB); // front-face color (fills block)
    img.outline(5, y0, 9, h, OUT);
    img.rect(6, y0 + 1, 7, 5, CT); // seat top surface
    img.hline(6, 12, y0 + 1, CS); // bright front rim of the top
    img.px(6, y0 + 2, CS);
    img.hline(5, 13, y0 + h - 1, OUT); // seam to the next cushion
    img.px(3, y0 + 4, PAL.gold); // gold tuft button on the backrest
  }

  // light piping along the open (east) seat edge
  img.vline(14, 8, 39, PIP);

  // feet
  img.rect(2, 46, 2, 2, PAL.leatherFoot);
  img.rect(11, 46, 2, 2, PAL.leatherFoot);
  return img;
}

const _sofas = new Map();

function sofaBig(face) {
  let cached = _sofas.get(face);
  if (cached) return cached;
  let logical = sofaVertEast();
  if (face === 'w') {
    const m = new Img(16, 48);
    for (let y = 0; y < 48; y++) {
      for (let x = 0; x < 16; x++) {
        const si = (y * 16 + (15 - x)) * 4;
        const di = (y * 16 + x) * 4;
        m.data[di] = logical.data[si];
        m.data[di + 1] = logical.data[si + 1];
        m.data[di + 2] = logical.data[si + 2];
        m.data[di + 3] = logical.data[si + 3];
      }
    }
    logical = m;
  }
  cached = upscale(logical, 2);
  _sofas.set(face, cached);
  return cached;
}

// ---------------------------------------------------------------------------
// lounge coffee table (2×1 tiles) — low oval wooden table between the sofas,
// a magazine + a cup on top (after the coffe-table.png reference).
// ---------------------------------------------------------------------------

let _coffeeTable = null;

function coffeeTableBig() {
  if (_coffeeTable) return _coffeeTable;
  const img = new Img(32, 16); // logical 32×16 → 64×32 px (2×1 tiles)
  // floor contact shadow
  img.rect(6, 14, 20, 2, '#00000026');
  // splayed legs below the top
  img.rect(7, 9, 2, 5, PAL.cofLeg);
  img.rect(23, 9, 2, 5, PAL.cofLeg);
  img.rect(13, 10, 2, 4, PAL.cofLeg);
  img.rect(17, 10, 2, 4, PAL.cofLeg);
  // oval wooden top
  img.rect(4, 3, 24, 6, PAL.cofTop);
  img.hline(6, 25, 2, PAL.cofTop); // rounded back edge
  img.outline(4, 3, 24, 6, PAL.cofDark);
  img.hline(6, 25, 3, PAL.cofHi); // top sheen
  img.hline(7, 24, 4, PAL.cofHi);
  img.hline(8, 23, 6, PAL.cofDark); // grain
  img.hline(5, 26, 8, PAL.cofDark); // front lip shadow
  // a magazine + a cup on top
  img.rect(9, 4, 6, 2, PAL.blue);
  img.px(9, 4, PAL.blueHi);
  img.rect(19, 4, 3, 2, PAL.mug);
  img.px(19, 4, PAL.mugHi);
  return (_coffeeTable = upscale(img, 2));
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
  // raised tech floor inside the glass server room
  { name: 'floor_tech', draw: chunky(techFloor) },
  // half-tech edge tiles under the glass side walls (plank outside, tech inside)
  { name: 'floor_tech_edge_l', draw: chunky((img) => techFloorEdge(img, 'l')) },
  { name: 'floor_tech_edge_r', draw: chunky((img) => techFloorEdge(img, 'r')) },
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
      // bigger round wall clock
      img.rect(4, 2, 8, 8, PAL.clockRim);
      img.px(4, 2, PAL.wallFace);
      img.px(11, 2, PAL.wallFace);
      img.px(4, 9, PAL.wallFace);
      img.px(11, 9, PAL.wallFace);
      img.rect(5, 3, 6, 6, PAL.clockFace);
      // hour ticks at 12 / 3 / 6 / 9
      img.px(8, 3, '#3a414e');
      img.px(8, 8, '#3a414e');
      img.px(5, 6, '#3a414e');
      img.px(10, 6, '#3a414e');
      // hands from the center (hour up, minute to the right in red)
      img.vline(8, 4, 6, '#3a414e');
      img.px(9, 6, '#b8554f');
      img.px(10, 6, '#b8554f');
      img.px(8, 6, '#2b303c');
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
  {
    // wall calendar: red month header over a paper grid, hung from a nail —
    // sits on the wall above the trash bin next to the water cooler.
    name: 'calendar',
    draw: chunky((img) => {
      wallFaceUpper(img);
      // nail + cord
      img.px(8, 1, PAL.calRing);
      // paper sheet
      img.rect(4, 2, 9, 11, PAL.calPaper);
      img.outline(4, 2, 9, 11, PAL.corkDark);
      img.hline(5, 11, 12, PAL.calPaperShade);
      // red month header + binding rings
      img.rect(4, 2, 9, 3, PAL.calHeader);
      img.hline(5, 11, 2, PAL.calHeaderHi);
      img.px(6, 2, PAL.calRing);
      img.px(10, 2, PAL.calRing);
      // day grid dots
      for (let gy = 0; gy < 3; gy++) {
        for (let gx = 0; gx < 4; gx++) {
          img.px(5 + gx * 2, 6 + gy * 2, PAL.calGrid);
        }
      }
      // today's marker
      img.rect(7, 8, 2, 2, PAL.calMark);
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
  // 4×2 boss command console (mahogany, monitor backs toward the viewer)
  ...['l', 'ml', 'mr', 'r'].flatMap((part, i) =>
    ['t', 'b'].map((row, j) => ({
      name: `console_${part}_${row}`,
      draw(img) {
        copyRegion(img, consoleBig(), i * 32, j * 32);
      },
    })),
  ),
  // glass partition of the infra/server room
  { name: 'glass_h', draw: chunky(glassWallH) },
  { name: 'glass_door_l', draw: chunky((img) => glassDoor(img, 'l')) },
  { name: 'glass_door_r', draw: chunky((img) => glassDoor(img, 'r')) },
  { name: 'glass_v', draw: chunky(glassWallV) },
  { name: 'glass_corner_l', draw: chunky((img) => glassCorner(img, 'l')) },
  { name: 'glass_corner_r', draw: chunky((img) => glassCorner(img, 'r')) },
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
      img.rect(6, 13, 4, 3, PAL.pot);
      img.hline(5, 10, 13, PAL.potRim);
      img.rect(6, 8, 4, 5, PAL.leafDark);
      img.rect(7, 7, 2, 4, PAL.leaf);
      img.px(7, 6, PAL.leafHi);
      img.px(6, 9, PAL.leafHi);
    }),
  },
  {
    // office bin: wide ribbed body, dark rim with a swing slot. Drawn at
    // the BOTTOM of the tile so a bin placed on the wall row stands flush
    // against the baseboard.
    name: 'trash_bin',
    draw: chunky((img) => {
      img.rect(4, 7, 8, 8, PAL.bin);
      img.outline(4, 7, 8, 8, PAL.binDark);
      for (let x = 6; x <= 10; x += 2) img.vline(x, 8, 13, PAL.binDark);
      img.vline(5, 8, 13, PAL.binHi);
      // rim + swing slot
      img.rect(3, 5, 10, 2, PAL.binDark);
      img.hline(3, 12, 5, PAL.binHi);
      img.rect(6, 6, 4, 1, '#10131f');
      // base shadow
      img.hline(5, 10, 15, PAL.binDark);
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
  // leather lounge sofas (1×3), vertical isometric, facing east / west
  ...['e', 'w'].flatMap((face) =>
    ['t', 'm', 'b'].map((row, j) => ({
      name: `sofa_${face}_${row}`,
      draw(img) {
        copyRegion(img, sofaBig(face), 0, j * 32);
      },
    })),
  ),
  // lounge coffee table (2×1)
  ...['l', 'r'].map((side, i) => ({
    name: `coffee_table_${side}`,
    draw(img) {
      copyRegion(img, coffeeTableBig(), i * 32, 0);
    },
  })),
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
