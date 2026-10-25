/**
 * Generates the PWA icons (public/icons/*.png) with no dependencies:
 * a minimal PNG encoder over node:zlib plus a tiny raster painter.
 * Motif matches favicon.svg: two rounded squares merging over midnight navy.
 *
 * Usage: node scripts/generate-icons.mjs
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../public/icons');

// ---------------------------------------------------------------- PNG encoding

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    scanlines[rowStart] = 0; // filter: none
    rgba.copy(scanlines, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(scanlines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- raster paint

function mix(a, b, t) {
  return a + (b - a) * t;
}

/** Rounded-rect coverage with 1px-smoothed edges, in pixel coordinates. */
function roundedRectCoverage(x, y, rect) {
  const { left, top, right, bottom, radius } = rect;
  const cx = Math.min(Math.max(x, left + radius), right - radius);
  const cy = Math.min(Math.max(y, top + radius), bottom - radius);
  const dx = Math.max(left + radius - cx, cx - (right - radius), x - cx);
  const dy = Math.max(top + radius - cy, cy - (bottom - radius), y - cy);
  const dist = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  const inside = x >= left && x <= right && y >= top && y <= bottom;
  if (inside && dist <= radius - 0.5) return 1;
  if (inside && dist < radius + 0.5) return radius + 0.5 - dist;
  return 0;
}

function paintIcon(size, { maskable }) {
  const rgba = Buffer.alloc(size * size * 4);
  // Maskable icons keep all meaningful content inside the safe zone (~80%).
  const inset = maskable ? size * 0.14 : size * 0.08;
  const square = size - inset * 2;
  const gap = square * 0.06;
  const tile = (square - gap) / 2;
  const radius = tile * 0.28;

  const leftSquare = {
    left: inset,
    top: inset + tile * 0.5,
    right: inset + tile,
    bottom: inset + tile * 0.5 + tile,
    radius,
  };
  const rightSquare = {
    left: inset + tile + gap,
    top: inset + tile * 0.5,
    right: inset + tile * 0.5 + square * 0.5,
    bottom: inset + tile * 0.5 + tile,
    radius,
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // Background: diagonal midnight-navy gradient.
      const t = (x / size + y / size) / 2;
      let r = mix(23, 11, t);
      let g = mix(28, 16, t);
      let b = mix(61, 38, t);

      const violet = roundedRectCoverage(x + 0.5, y + 0.5, leftSquare);
      const cyan = roundedRectCoverage(x + 0.5, y + 0.5, rightSquare);
      if (violet > 0) {
        r = mix(r, 139, violet);
        g = mix(g, 92, violet);
        b = mix(b, 246, violet);
      }
      if (cyan > 0) {
        r = mix(r, 34, cyan * 0.92);
        g = mix(g, 211, cyan * 0.92);
        b = mix(b, 238, cyan * 0.92);
      }

      // Gold merge spark where the two squares meet.
      const sparkX = inset + tile + gap * 0.5;
      const sparkY = inset + tile;
      const dist = Math.hypot(x + 0.5 - sparkX, y + 0.5 - sparkY);
      const spark = Math.max(0, Math.min(1, tile * 0.34 - dist + 0.5));
      if (spark > 0) {
        r = mix(r, 251, spark);
        g = mix(g, 191, spark);
        b = mix(b, 36, spark);
      }

      rgba[i] = Math.round(r);
      rgba[i + 1] = Math.round(g);
      rgba[i + 2] = Math.round(b);
      rgba[i + 3] = 255;
    }
  }
  return encodePng(size, size, rgba);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(resolve(OUT_DIR, 'icon-192.png'), paintIcon(192, { maskable: false }));
writeFileSync(resolve(OUT_DIR, 'icon-512.png'), paintIcon(512, { maskable: false }));
writeFileSync(resolve(OUT_DIR, 'icon-maskable-512.png'), paintIcon(512, { maskable: true }));
console.log('Generated icons in', OUT_DIR);
