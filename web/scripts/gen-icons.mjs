// Generate FlowBot PWA icons (no external deps — pure Node PNG encoder).
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '../public/icons');
mkdirSync(outDir, { recursive: true });

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(size, pixels) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function makeIcon(size, { rounded = size, gradient = ['#0ea5e9', '#22d3ee'], glyph = '#ffffff' } = {}) {
  const px = new Uint8Array(size * size * 4);
  const [r0, g0, b0] = hexToRgb(gradient[0]);
  const [r1, g1, b1] = hexToRgb(gradient[1]);
  const radius = rounded;

  const inRoundRect = (x, y) => {
    const cx = Math.min(Math.max(x, radius), size - radius);
    const cy = Math.min(Math.max(y, radius), size - radius);
    const dx = x - cx, dy = y - cy;
    return dx * dx + dy * dy <= radius * radius;
  };

  for (let y = 0; y < size; y++) {
    const t = y / size;
    const r = Math.round(r0 + (r1 - r0) * t);
    const g = Math.round(g0 + (g1 - g0) * t);
    const b = Math.round(b0 + (b1 - b0) * t);
    for (let x = 0; x < size; x++) {
      const inside = inRoundRect(x, y);
      const idx = (y * size + x) * 4;
      px[idx] = r; px[idx + 1] = g; px[idx + 2] = b;
      px[idx + 3] = inside ? 255 : 0;
    }
  }

  const glyphPts = [
    [0.42, 0.32], [0.70, 0.32], [0.56, 0.46], [0.68, 0.62], [0.42, 0.62], [0.52, 0.46],
  ];
  const xMin = size * 0.40, xMax = size * 0.72, yMinP = size * 0.30, yMaxP = size * 0.64;
  for (let y = Math.floor(yMinP); y < yMaxP; y++) {
    for (let x = Math.floor(xMin); x < xMax; x++) {
      let inside = false;
      const pt = [x / size, y / size];
      for (let i = 0, j = glyphPts.length - 1; i < glyphPts.length; j = i++) {
        const [xi, yi] = glyphPts[i];
        const [xj, yj] = glyphPts[j];
        if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) {
        const idx = (y * size + x) * 4;
        px[idx] = 255; px[idx + 1] = 255; px[idx + 2] = 255; px[idx + 3] = 255;
      }
    }
  }

  const dot = (cx, cyy, radius) => {
    for (let y = cyy - radius; y <= cyy + radius; y++) {
      for (let x = cx - radius; x <= cx + radius; x++) {
        const dx = x - cx, dy = y - cyy;
        if (x >= 0 && y >= 0 && x < size && y < size && dx * dx + dy * dy <= radius * radius) {
          const idx = (y * size + x) * 4;
          px[idx] = 255; px[idx + 1] = 255; px[idx + 2] = 255; px[idx + 3] = 255;
        }
      }
    }
  };
  dot(size * 0.42, size * 0.32, Math.max(2, size * 0.035));
  dot(size * 0.42, size * 0.64, Math.max(2, size * 0.035));

  return encodePNG(size, Buffer.from(px));
}

for (const s of [192, 512]) {
  writeFileSync(resolve(outDir, `icon-${s}.png`), makeIcon(s));
  writeFileSync(resolve(outDir, `maskable-${s}.png`), makeIcon(s, { rounded: s / 2 }));
}
console.log('icons written');