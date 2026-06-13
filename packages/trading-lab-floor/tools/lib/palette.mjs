/**
 * "Retro Pixel AI Research Tower" palette. Original, not sampled from any
 * reference image.
 *
 * The base art is drawn ONCE in the warm Day Office palette below. The night
 * tileset is derived from it: `nightify()` pushes every pixel toward a dark
 * blue cast, except EMISSIVE colors (screens, LEDs, lamp light), which keep
 * glowing. Tiles that need a true redraw at night (windows) opt in via a
 * `themed` draw function in tiles.mjs.
 */

import { hexToRgba } from './img.mjs';

export const PAL = {
  // --- terminal / screen accents (emissive at night) -----------------------
  cyan: '#59f7d4',
  cyanDim: '#2c8a76',
  cyanDark: '#1f5a4e',
  green: '#69e85e',
  greenDim: '#3a9a55',
  blue: '#4f9cff',
  blueHi: '#8ec4ff',
  amber: '#ffb454',
  amberDim: '#a6702f',
  red: '#ff5d5d',
  redDim: '#a04848',
  violet: '#a06bff',
  violetDim: '#6a55a0',
  gold: '#ffd166',
  goldDim: '#c9a23e',

  // --- screens & paper -----------------------------------------------------
  bezel: '#2b303c',
  bezelDark: '#1d212b',
  bezelHi: '#3c4250',
  screen: '#0d1726',
  screenDeep: '#091020',
  screenBar: '#33445f',
  screenBarDim: '#263650',
  keyboard: '#d8d4c6',
  keyboardKeys: '#b4b0a2',
  keyboardDark: '#8e8a7e',
  paper: '#efeadb',
  paperShade: '#dcd5c2',
  paperLine: '#a89e88',
  mug: '#c25f5b',
  mugHi: '#d4736f',
  steam: '#c9d2dc',

  // --- day floors ------------------------------------------------------------
  floorA: '#cfa671',
  floorB: '#c69d68',
  plank: '#b48c5a',
  plankHi: '#dab380',
  floorSeam: '#a8814f',
  floorShadow1: '#94713f',
  floorShadow2: '#b08a58',
  matBase: '#94806a',
  matLine: '#7c6a56',
  matHi: '#a6927c',

  // --- infra room: glass partition + raised tech floor ------------------------
  glassFrame: '#7e8a96',
  glassFrameHi: '#98a4b0',
  glassFrameDark: '#5c6672',
  glassPane: '#bfe8f855',
  glassPaneHi: '#e8f7ff66',
  techFloor: '#4a5263',
  techFloorHi: '#566076',
  techSeam: '#3a4150',

  // --- day walls -------------------------------------------------------------
  wallTop: '#5e6876',
  wallTopHi: '#717c8c',
  wallTopLo: '#4c5562',
  wallFace: '#e3d9c0',
  wallFaceHi: '#efe6d0',
  wallSeam: '#cfc3a6',
  wainscot: '#c4b394',
  wainscotLine: '#ab9a7c',
  baseboard: '#857257',
  baseboardLo: '#6b5b45',
  vent: '#9aa4b0',
  ventDark: '#7e8894',

  // --- windows ---------------------------------------------------------------
  frame: '#8a6f4a',
  frameHi: '#a98a5e',
  frameDark: '#6e5638',
  sill: '#b59468',
  sky: '#a5d8f0',
  skyHi: '#c8eaf9',
  cloud: '#ffffff',
  sun: '#ffe9a8',
  // night window redraw
  nightSky: '#101630',
  nightSkyHi: '#1a2342',
  star: '#cfd9f5',
  starDim: '#76819f',
  moon: '#e8edf8',
  city: '#2c3856',
  cityLit: '#d9b35c',

  // --- door ------------------------------------------------------------------
  door: '#9b6a42',
  doorHi: '#b58253',
  doorDark: '#7e5331',
  doorFrame: '#75573a',
  handle: '#caa54b',

  // --- desks / wood furniture --------------------------------------------------
  // Iteration 4: one shared plank floor (no carpets), so desks dropped to a
  // dark espresso + near-black outline, and every workstation carries a
  // light aluminum monitor — strong contrast against the warm planks.
  deskTop: '#7e5532',
  deskHi: '#936846',
  deskGrain: '#6d4829',
  deskFace: '#5f3f24',
  deskDark: '#4a3019',
  deskLeg: '#362312',
  deskOutline: '#241708',

  // --- aluminum desktop monitor (back to the viewer, screen to the agent) -----
  alu: '#c5ccd4',
  aluHi: '#e0e6ec',
  aluDark: '#98a1ac',
  aluEdge: '#6e7884',
  markGlow: '#3f8fe8',

  // --- boss mahogany console ---------------------------------------------------
  mahogany: '#8a4630',
  mahoganyHi: '#a05a3c',
  mahoganyGrain: '#74381f',
  mahoganyFace: '#6b3018',
  mahoganyDark: '#532413',
  mahoganyLeg: '#3c1a0d',
  mahoganyOutline: '#2a1008',
  shelfFrame: '#96704a',
  shelfDark: '#6f5236',
  shelfBoard: '#7e5e3e',

  // --- chairs ------------------------------------------------------------------
  chair: '#4d5a74',
  chairDark: '#3c4860',
  chairHi: '#5e6c88',
  chairLeg: '#2f3848',
  execChair: '#463e62',
  execChairDark: '#352e4c',
  execChairHi: '#5a5078',

  // --- amenities -----------------------------------------------------------------
  pot: '#b06a48',
  potRim: '#c27d55',
  leaf: '#4e9e58',
  leafDark: '#3a7e44',
  leafHi: '#67bd6e',
  bin: '#7c8794',
  binDark: '#67727e',
  binHi: '#8e98a4',
  cooler: '#dde4ea',
  coolerShade: '#c2ccd6',
  coolerDark: '#9fa9b4',
  bottle: '#9fd4ef',
  bottleHi: '#c8eaf9',
  vending: '#4d7ec9',
  vendingDark: '#3c66a8',
  vendingHi: '#6c96d8',
  steel: '#9aa4b2',
  steelDark: '#6e7884',
  steelPanel: '#3a414e',
  clockFace: '#f3efe4',
  clockRim: '#5b6470',
  cork: '#c9a06a',
  corkDark: '#b08a58',

  // --- leather lounge sofas (executive area behind the boss) ----------------
  leather: '#8a4f2c',
  leatherHi: '#a8693c',
  leatherDark: '#5e3318',
  leatherSeam: '#46240f',
  leatherSheen: '#c08a54',
  leatherFoot: '#2c1a0c',
  leatherPiping: '#d8b483',

  // --- coffee table (lounge) ------------------------------------------------
  cofTop: '#a8794a',
  cofHi: '#c89a64',
  cofDark: '#6e4a28',
  cofLeg: '#553a20',

  // --- wall calendar --------------------------------------------------------
  calPaper: '#f4efe2',
  calPaperShade: '#ddd6c4',
  calHeader: '#b8554f',
  calHeaderHi: '#cf6a63',
  calGrid: '#b7af9d',
  calMark: '#4f9cff',
  calRing: '#8a8276',

  // --- characters -----------------------------------------------------------------
  outline: '#26222b',
  eye: '#2a2533',
  pants: '#3e4658',
  pantsShade: '#333a4a',
  shoes: '#23282f',

  // --- racks / consoles -------------------------------------------------------------
  rackBody: '#272c36',
  rackPanel: '#323845',
  rackDark: '#1a1e26',
};

/** Colors that keep glowing in the derived night tileset. */
export const EMISSIVE = [
  PAL.cyan,
  PAL.green,
  PAL.blue,
  PAL.blueHi,
  PAL.amber,
  PAL.red,
  PAL.violet,
  PAL.gold,
  PAL.sun,
  PAL.markGlow,
];

const emissiveSet = new Set(
  EMISSIVE.map((hex) => hexToRgba(hex).slice(0, 3).join(',')),
);

/**
 * Derive the Night Control Room variant of an image: dark blue multiply with
 * a floor of ambient light, skipping emissive (screen/LED/lamp) pixels.
 */
export function nightify(img) {
  const out = img.clone();
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    if (emissiveSet.has(`${d[i]},${d[i + 1]},${d[i + 2]}`)) continue;
    d[i] = Math.round(d[i] * 0.34 + 10);
    d[i + 1] = Math.round(d[i + 1] * 0.38 + 13);
    d[i + 2] = Math.round(d[i + 2] * 0.52 + 30);
  }
  return out;
}

// Iteration 4 note: agent sprites are no longer drawn from a ROLE_STYLES
// table here — they are composed from real Universal LPC Spritesheet
// Character Generator layers by `tools/compose-lpc-agents.mjs` (output and
// licensing docs live in public/assets/third-party/lpc/). `PAL.chair` /
// `PAL.execChair*` above are still used by that script for the original
// office chairs drawn behind the LPC figures.
