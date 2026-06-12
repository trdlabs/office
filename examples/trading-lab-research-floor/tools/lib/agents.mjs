import { Img, upscale } from './img.mjs';
import { PAL, ROLE_STYLES } from './palette.mjs';

/**
 * Original front-facing seated agents (LPC-inspired proportions, fully
 * original pixels — no LPC Generator output is imported; see ASSETS.md for
 * the optional real-LPC drop-in path).
 *
 * Visual Iteration 3 turns the workstations around: the agent now sits
 * BEHIND the desk and faces the viewer. The sprite is a seated bust — head,
 * face (eyes!), shoulders, upper torso and the chair back peeking out at
 * the sides. Its bottom edge is the desk cut: the feet anchor (spawn point)
 * sits exactly on the desk block's top edge, so the desk + laptop visually
 * cover the lap and the scene reads as "agent works at a computer".
 *
 * Drawn on a logical 16-px grid, upscaled ×2: standard frames are 32×36,
 * the Boss is 32×40 in a tall executive chair. Roles read through hair
 * style/color, outfit (hoodie, blazer, shirt+tie, tee, turtleneck, suit)
 * and accessories that survive the front view: glasses, cap, headset.
 * Two idle frames: a subtle 1-px breathing bob (chair stays still).
 */

export const AGENT_FRAMES = 2;

const O = PAL.outline;
const SHADOW = '#00000028';

/** Front-facing head: hair + face + eyes. `y` is the hair top row. */
function drawHead(img, style, y) {
  // head block with outline (10 wide, 8 tall)
  img.rect(3, y, 10, 8, O);
  img.rect(4, y + 1, 8, 6, style.skin);
  // hair cap over the top of the head
  img.rect(4, y + 1, 8, 2, style.hair);
  img.hline(5, 10, y, style.hair);

  switch (style.hairStyle) {
    case 'short':
      img.px(4, y + 3, style.hair);
      img.px(11, y + 3, style.hair);
      img.px(4, y + 2, style.hairShade);
      break;
    case 'slick':
      // high forehead, combed back, side part line
      img.hline(5, 10, y + 1, style.hair);
      img.px(6, y + 1, style.hairShade);
      img.px(4, y + 3, style.hair);
      img.px(11, y + 3, style.hair);
      break;
    case 'long':
      // curtains framing the face, flowing outside the head down to the
      // shoulders (drawn over the chair back — the contrast carries them)
      img.vline(3, y + 1, y + 6, style.hair);
      img.vline(12, y + 1, y + 6, style.hair);
      img.vline(2, y + 2, y + 8, style.hair);
      img.vline(13, y + 2, y + 8, style.hair);
      img.px(2, y + 8, style.hairShade);
      img.px(13, y + 8, style.hairShade);
      break;
    case 'bun':
      // bun on top (2 rows tall so it survives the outline) + tidy sides
      img.rect(6, y - 2, 4, 2, style.hair);
      img.outline(6, y - 2, 4, 2, O);
      img.px(7, y - 1, style.hair);
      img.px(8, y - 1, style.hairShade);
      img.px(4, y + 3, style.hair);
      img.px(11, y + 3, style.hair);
      break;
    case 'ponytail':
      // tail thrown over the right shoulder
      img.px(4, y + 3, style.hair);
      img.px(11, y + 3, style.hair);
      img.vline(13, y + 4, y + 9, style.hairShade);
      img.px(12, y + 3, style.hair);
      img.px(13, y + 4, style.accent); // hair tie
      break;
    case 'curly': {
      // bumpy silhouette
      for (const [cx, cy] of [
        [3, y + 1],
        [12, y + 1],
        [2, y + 2],
        [13, y + 2],
        [4, y + 3],
        [11, y + 3],
      ]) {
        img.px(cx, cy, style.hair);
      }
      img.px(2, y + 3, style.hairShade);
      img.px(13, y + 3, style.hairShade);
      break;
    }
    default:
      break;
  }
  // hairline shading
  img.hline(5, 10, y + 2, style.hairShade);

  // face: eyes + a hint of a mouth
  img.px(6, y + 4, PAL.eye);
  img.px(9, y + 4, PAL.eye);
  img.hline(7, 8, y + 6, SHADOW);

  switch (style.accessory) {
    case 'glasses': {
      // tinted lenses with a glint, joined by a bridge — one clean strip
      const lens = '#2b3a4c';
      const glint = '#9fc4dd';
      const rim = '#1d212b';
      img.rect(5, y + 4, 2, 1, lens);
      img.rect(9, y + 4, 2, 1, lens);
      img.px(5, y + 4, glint);
      img.px(9, y + 4, glint);
      img.px(7, y + 4, rim);
      img.px(8, y + 4, rim);
      img.px(4, y + 4, rim);
      img.px(11, y + 4, rim);
      break;
    }
    case 'cap': {
      // crown over the hair + front brim across the forehead
      img.rect(4, y, 8, 2, style.accent);
      img.hline(5, 10, y - 1, style.accent);
      img.outline(4, y - 1, 8, 3, O);
      img.hline(3, 12, y + 2, style.accentShade ?? style.topShade);
      img.px(3, y + 2, O);
      img.px(12, y + 2, O);
      break;
    }
    case 'headset': {
      const dark = '#1d212b';
      img.hline(4, 11, y, dark); // band over the hair
      img.rect(2, y + 3, 2, 3, dark); // left cup
      img.rect(12, y + 3, 2, 3, dark); // right cup
      img.px(12, y + 6, dark); // mic arm
      img.px(11, y + 7, PAL.green); // mic tip LED
      break;
    }
    default:
      break;
  }
}

/**
 * Shoulders + upper torso, front view. Arms rest forward on the desk, so
 * only the upper arms show at the sides. `y` = shoulder row; the torso runs
 * to the bottom of the frame (the desk cut).
 */
function drawTorso(img, style, y, bottom) {
  const h = bottom - y;
  img.rect(2, y, 12, h, O);
  img.rect(3, y + 1, 10, h - 1, style.top);
  // upper arms at the sides
  img.vline(3, y + 2, bottom - 1, style.topShade);
  img.vline(12, y + 2, bottom - 1, style.topShade);
  // neck
  img.rect(7, y - 1, 2, 1, style.skin);

  switch (style.outfit) {
    case 'hoodie':
      // hood ridge behind the neck + drawstrings
      img.hline(5, 10, y, style.topShade);
      img.px(6, y + 2, PAL.paper);
      img.px(9, y + 2, PAL.paper);
      img.px(6, y + 3, PAL.paper);
      img.px(9, y + 3, PAL.paper);
      break;
    case 'shirt_tie':
      // collar V + tie
      img.px(6, y + 1, PAL.paper);
      img.px(9, y + 1, PAL.paper);
      img.vline(7, y + 1, y + 4, style.accent);
      img.vline(8, y + 1, y + 4, style.accent);
      img.px(7, y + 5, style.accent);
      img.px(8, y + 5, style.accent);
      break;
    case 'blazer':
      // lapels open over a light shirt
      img.rect(6, y + 1, 4, h - 2, PAL.paper);
      img.vline(5, y + 1, bottom - 2, style.topShade);
      img.vline(10, y + 1, bottom - 2, style.topShade);
      img.px(6, y + 1, style.top);
      img.px(9, y + 1, style.top);
      break;
    case 'turtleneck':
      // high collar under the chin
      img.rect(6, y - 1, 4, 1, style.top);
      img.hline(6, 9, y, style.topShade);
      break;
    case 'vest':
      // vest over a shirt: light sleeves
      img.vline(3, y + 1, bottom - 1, PAL.paperShade);
      img.vline(12, y + 1, bottom - 1, PAL.paperShade);
      img.hline(4, 11, y + 1, style.topShade);
      break;
    case 'suit':
      // jacket lapels + shirt + tie
      img.rect(7, y + 1, 2, h - 2, PAL.paper);
      img.vline(6, y + 1, y + 3, style.topShade);
      img.vline(9, y + 1, y + 3, style.topShade);
      img.vline(7, y + 2, y + 5, style.accent);
      img.vline(8, y + 2, y + 5, style.accent);
      break;
    default:
      // plain tee: collar shade
      img.hline(6, 9, y, style.topShade);
      break;
  }
}

/** Standard task chair, front view: back + armrests peeking out. */
function drawChair(img, top, bottom) {
  // high back behind the body
  img.rect(1, top, 14, bottom - top, PAL.chairDark);
  img.outline(1, top, 14, bottom - top, O);
  img.hline(2, 13, top + 1, PAL.chairHi);
  // armrests
  img.rect(0, bottom - 5, 2, 4, O);
  img.px(0, bottom - 4, PAL.chair);
  img.px(1, bottom - 4, PAL.chair);
  img.rect(14, bottom - 5, 2, 4, O);
  img.px(14, bottom - 4, PAL.chair);
  img.px(15, bottom - 4, PAL.chair);
}

/** Tall executive chair: wings above the shoulders + gold studs. */
function drawExecChair(img, top, bottom) {
  img.rect(0, top, 16, bottom - top, PAL.execChairDark);
  img.outline(0, top, 16, bottom - top, O);
  img.hline(1, 14, top + 1, PAL.execChairHi);
  // winged top corners rise beside the head
  img.rect(0, top, 3, 3, PAL.execChair);
  img.rect(13, top, 3, 3, PAL.execChair);
  img.px(1, top + 1, PAL.gold);
  img.px(14, top + 1, PAL.gold);
  // gold studs down the sides
  img.px(1, bottom - 4, PAL.gold);
  img.px(14, bottom - 4, PAL.gold);
}

function drawStandardAgent(img, style, bob) {
  const bottom = 18;
  drawChair(img, 6, bottom);
  drawTorso(img, style, 10 + bob, bottom);
  drawHead(img, style, 2 + bob);
}

function drawBoss(img, style, bob) {
  const bottom = 20;
  drawExecChair(img, 2, bottom);
  // wider suit shoulders
  const y = 11 + bob;
  img.rect(1, y, 14, bottom - y, O);
  img.rect(2, y + 1, 12, bottom - y - 1, style.top);
  img.vline(2, y + 2, bottom - 1, style.topShade);
  img.vline(13, y + 2, bottom - 1, style.topShade);
  img.rect(7, y - 1, 2, 1, style.skin);
  // shirt + gold tie
  img.rect(7, y + 1, 2, bottom - y - 2, PAL.paper);
  img.vline(6, y + 1, y + 3, style.topShade);
  img.vline(9, y + 1, y + 3, style.topShade);
  img.vline(7, y + 2, y + 6, style.accent);
  img.vline(8, y + 2, y + 6, style.accent);
  drawHead(img, style, 3 + bob);
}

/** @returns {Img} one upscaled frame (32×36, Boss 32×40) */
export function drawAgentFrame(role, bob) {
  const style = ROLE_STYLES[role];
  if (!style) throw new Error(`No agent style for role "${role}"`);
  const logical = new Img(16, style.executive ? 20 : 18);
  if (style.executive) drawBoss(logical, style, bob);
  else drawStandardAgent(logical, style, bob);
  return upscale(logical, 2);
}

/** @returns {Img[]} two idle frames */
export function drawAgentFrames(role) {
  return [drawAgentFrame(role, 0), drawAgentFrame(role, 1)];
}

export const AGENT_ROLES = Object.keys(ROLE_STYLES);
