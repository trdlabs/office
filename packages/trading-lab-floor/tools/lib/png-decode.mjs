import { inflateSync } from 'node:zlib';
import { Img } from './img.mjs';

/**
 * Minimal zero-dependency PNG decoder — just enough to read the Universal
 * LPC Spritesheet Character Generator layer sheets (8-bit depth, color
 * types 0/2/3/4/6, PLTE + tRNS, non-interlaced). Returns an `Img`.
 */
export function decodePng(buf) {
  if (
    buf.length < 8 ||
    buf[0] !== 0x89 ||
    buf[1] !== 0x50 ||
    buf[2] !== 0x4e ||
    buf[3] !== 0x47
  ) {
    throw new Error('decodePng: not a PNG file');
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette = null;
  let trns = null;
  const idat = [];

  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') {
      palette = data;
    } else if (type === 'tRNS') {
      trns = data;
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    off += 12 + len;
  }

  if (interlace !== 0) throw new Error('decodePng: interlaced PNGs unsupported');

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`decodePng: unsupported color type ${colorType}`);
  if (bitDepth !== 8 && !(colorType === 3 && bitDepth < 8)) {
    throw new Error(`decodePng: unsupported bit depth ${bitDepth}`);
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = Math.ceil((width * channels * bitDepth) / 8);
  // filter distance in bytes (1 for sub-byte palette depths)
  const fbpp = Math.max(1, (channels * bitDepth) >> 3);
  const img = new Img(width, height);
  const out = img.data;
  const prev = new Uint8Array(stride);
  const cur = new Uint8Array(stride);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const x = row[i];
      const a = i >= fbpp ? cur[i - fbpp] : 0;
      const b = prev[i];
      const c = i >= fbpp ? prev[i - fbpp] : 0;
      let v;
      switch (filter) {
        case 0: v = x; break;
        case 1: v = x + a; break;
        case 2: v = x + b; break;
        case 3: v = x + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`decodePng: bad filter ${filter}`);
      }
      cur[i] = v & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const di = (y * width + x) * 4;
      const si = x * channels;
      if (colorType === 3 && bitDepth < 8) {
        const bitPos = x * bitDepth;
        const byte = cur[bitPos >> 3];
        const shift = 8 - bitDepth - (bitPos & 7);
        const idx = (byte >> shift) & ((1 << bitDepth) - 1);
        const p = idx * 3;
        out[di] = palette[p];
        out[di + 1] = palette[p + 1];
        out[di + 2] = palette[p + 2];
        out[di + 3] = trns && idx < trns.length ? trns[idx] : 255;
        continue;
      }
      switch (colorType) {
        case 0:
          out[di] = out[di + 1] = out[di + 2] = cur[si];
          // tRNS on grayscale: a 16-bit color key (we read its low byte pair)
          out[di + 3] = trns && trns.readUInt16BE(0) === cur[si] ? 0 : 255;
          break;
        case 2:
          out[di] = cur[si];
          out[di + 1] = cur[si + 1];
          out[di + 2] = cur[si + 2];
          out[di + 3] =
            trns &&
            trns.readUInt16BE(0) === cur[si] &&
            trns.readUInt16BE(2) === cur[si + 1] &&
            trns.readUInt16BE(4) === cur[si + 2]
              ? 0
              : 255;
          break;
        case 3: {
          const p = cur[si] * 3;
          out[di] = palette[p];
          out[di + 1] = palette[p + 1];
          out[di + 2] = palette[p + 2];
          out[di + 3] = trns && cur[si] < trns.length ? trns[cur[si]] : 255;
          break;
        }
        case 4:
          out[di] = out[di + 1] = out[di + 2] = cur[si];
          out[di + 3] = cur[si + 1];
          break;
        case 6:
          out[di] = cur[si];
          out[di + 1] = cur[si + 1];
          out[di + 2] = cur[si + 2];
          out[di + 3] = cur[si + 3];
          break;
      }
    }
    prev.set(cur);
  }

  return img;
}
