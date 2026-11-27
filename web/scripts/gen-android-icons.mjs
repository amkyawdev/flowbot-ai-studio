// Generate Android launcher icons (ic_launcher + ic_launcher_round) at all mipmap densities.
import { deflateSync, inflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const basePng = readFileSync(resolve(root, 'public/icons/icon-512.png'));

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
function chunk(t, d) {
  const len = Buffer.alloc(4); len.writeUInt32BE(d.length, 0);
  return Buffer.concat([len, Buffer.from(t, 'ascii'), d, (() => { const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([Buffer.from(t), d])), 0); return c; })()]);
}

// Minimal PNG decoder (IDAT zlib only, filters 0)
function decodePng(buf) {
  let pos = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.slice(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const px = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += Math.floor((a + b) / 2);
      else if (filter === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      out[x] = v & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const si = x * bpp, di = (y * width + x) * 4;
      px[di] = out[si]; px[di + 1] = out[si + 1]; px[di + 2] = out[si + 2];
      px[di + 3] = colorType === 6 ? out[si + 3] : 255;
    }
    prev = out;
  }
  return { width, height, pixels: px };
}

function encodePng(size, pixels) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function resize(src, srcSize, outSize) {
  const out = Buffer.alloc(outSize * outSize * 4);
  const scale = srcSize / outSize;
  for (let y = 0; y < outSize; y++) {
    for (let x = 0; x < outSize; x++) {
      const sx = Math.min(srcSize - 1, Math.floor(x * scale));
      const sy = Math.min(srcSize - 1, Math.floor(y * scale));
      const si = (sy * srcSize + sx) * 4, di = (y * outSize + x) * 4;
      out[di] = src[si]; out[di + 1] = src[si + 1]; out[di + 2] = src[si + 2]; out[di + 3] = src[si + 3];
    }
  }
  return out;
}

const { width, height, pixels } = decodePng(basePng);
const densities = { 'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192 };
const resDir = resolve(root, 'android/app/src/main/res');
for (const [density, size] of Object.entries(densities)) {
  const dir = resolve(resDir, `mipmap-${density}`);
  mkdirSync(dir, { recursive: true });
  const resized = resize(pixels, width, size);
  const round = Buffer.from(resized); // rounded handled at runtime by the launcher
  writeFileSync(resolve(dir, 'ic_launcher.png'), encodePng(size, resized));
  writeFileSync(resolve(dir, 'ic_launcher_round.png'), encodePng(size, round));
}
// Foreground icon (legacy adaptive fallback)
for (const [density, size] of Object.entries(densities)) {
  const dir = resolve(resDir, `mipmap-${density}`);
  const resized = resize(pixels, width, size);
  writeFileSync(resolve(dir, 'ic_launcher_foreground.png'), encodePng(size, resized));
}
console.log('android icons written for', Object.keys(densities).join(', '));