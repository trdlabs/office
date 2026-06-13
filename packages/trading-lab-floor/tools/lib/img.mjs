/**
 * Tiny pixel canvas used by the asset generators. All colors are '#rrggbb'
 * or '#rrggbbaa' strings; (0,0) is top-left.
 */

const colorCache = new Map();

export function hexToRgba(hex) {
  let cached = colorCache.get(hex);
  if (cached) return cached;
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  const a = value.length >= 8 ? parseInt(value.slice(6, 8), 16) : 255;
  cached = [r, g, b, a];
  colorCache.set(hex, cached);
  return cached;
}

/** Deterministic LCG so regenerated assets are byte-identical. */
export function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export function seedFromString(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export class Img {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 4);
  }

  px(x, y, color) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const [r, g, b, a] = hexToRgba(color);
    const i = (y * this.width + x) * 4;
    if (a >= 255) {
      this.data[i] = r;
      this.data[i + 1] = g;
      this.data[i + 2] = b;
      this.data[i + 3] = 255;
      return;
    }
    // source-over blend
    const da = this.data[i + 3] / 255;
    const sa = a / 255;
    const outA = sa + da * (1 - sa);
    if (outA <= 0) return;
    this.data[i] = Math.round((r * sa + this.data[i] * da * (1 - sa)) / outA);
    this.data[i + 1] = Math.round((g * sa + this.data[i + 1] * da * (1 - sa)) / outA);
    this.data[i + 2] = Math.round((b * sa + this.data[i + 2] * da * (1 - sa)) / outA);
    this.data[i + 3] = Math.round(outA * 255);
  }

  rect(x, y, w, h, color) {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) this.px(xx, yy, color);
    }
  }

  hline(x0, x1, y, color) {
    for (let x = x0; x <= x1; x++) this.px(x, y, color);
  }

  vline(x, y0, y1, color) {
    for (let y = y0; y <= y1; y++) this.px(x, y, color);
  }

  outline(x, y, w, h, color) {
    this.hline(x, x + w - 1, y, color);
    this.hline(x, x + w - 1, y + h - 1, color);
    this.vline(x, y, y + h - 1, color);
    this.vline(x + w - 1, y, y + h - 1, color);
  }

  /** 1px-wide stairstep line between two points (pixel-art friendly). */
  line(x0, y0, x1, y1, color) {
    let dx = Math.abs(x1 - x0);
    let dy = -Math.abs(y1 - y0);
    let sx = x0 < x1 ? 1 : -1;
    let sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.px(x0, y0, color);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  /** Alpha-aware copy of another Img onto this one. */
  blit(src, dx, dy) {
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        const i = (y * src.width + x) * 4;
        const a = src.data[i + 3];
        if (a === 0) continue;
        const hex =
          '#' +
          [src.data[i], src.data[i + 1], src.data[i + 2], a]
            .map((v) => v.toString(16).padStart(2, '0'))
            .join('');
        this.px(dx + x, dy + y, hex);
      }
    }
  }

  /**
   * Paint an ASCII template. `palette` maps a char to a color; '.' and ' '
   * are transparent.
   */
  ascii(rows, palette, ox = 0, oy = 0) {
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === '.' || ch === ' ') continue;
        const color = palette[ch];
        if (!color) throw new Error(`ascii: char "${ch}" missing from palette`);
        this.px(ox + x, oy + y, color);
      }
    });
  }

  clone() {
    const copy = new Img(this.width, this.height);
    copy.data.set(this.data);
    return copy;
  }
}

/**
 * Nearest-neighbor upscale. All Visual Iteration 2 art is drawn on a logical
 * 16px grid and upscaled ×2 onto the 32px tiles — one "chunky" art pixel is
 * 2×2 real pixels, which keeps shapes large and silhouettes readable.
 */
export function upscale(src, k = 2) {
  const out = new Img(src.width * k, src.height * k);
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const si = (y * src.width + x) * 4;
      for (let dy = 0; dy < k; dy++) {
        for (let dx = 0; dx < k; dx++) {
          const di = ((y * k + dy) * out.width + (x * k + dx)) * 4;
          out.data[di] = src.data[si];
          out.data[di + 1] = src.data[si + 1];
          out.data[di + 2] = src.data[si + 2];
          out.data[di + 3] = src.data[si + 3];
        }
      }
    }
  }
  return out;
}

/** Concatenate equally sized frames into one horizontal strip. */
export function strip(frames) {
  const [first] = frames;
  const out = new Img(first.width * frames.length, first.height);
  frames.forEach((frame, i) => out.blit(frame, i * first.width, 0));
  return out;
}
