import { deflateSync } from 'node:zlib';

/**
 * Minimal zero-dependency PNG encoder (RGBA8, no interlace, filter 0).
 * Enough to emit pixel-art sprites from Node without any npm packages.
 */

const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  const crc = crc32(out.subarray(4, 8 + data.length));
  out.writeUInt32BE(crc, 8 + data.length);
  return out;
}

/**
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array} rgba width*height*4 bytes
 * @returns {Buffer} PNG file contents
 */
export function encodePng(width, height, rgba) {
  if (rgba.length !== width * height * 4) {
    throw new Error(`encodePng: expected ${width * height * 4} bytes, got ${rgba.length}`);
  }
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  const src = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type "None"
    src.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
