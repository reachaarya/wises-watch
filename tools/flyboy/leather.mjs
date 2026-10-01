/**
 * Generates tileable leather textures (pebble grain) into public/textures/:
 *   leather_normal.webp  – grain normals (OpenGL convention, +Y up)
 *   leather_rough.webp   – roughness: creases are duller, pebble tops are slightly burnished
 *   leather_color.webp   – greyscale mottling, multiplied over the strap colour
 * Run: node tools/leather.mjs
 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const SIZE = 1024;
mkdirSync('public/textures', { recursive: true });

// deterministic random
let seed = 1337;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

/** Periodic Worley noise: returns {f1, f2} distances in cell units for a cells×cells grid. */
function worley(cells) {
  const pts = new Float32Array(cells * cells * 2);
  for (let i = 0; i < cells * cells; i++) { pts[i * 2] = rand(); pts[i * 2 + 1] = rand(); }
  const f1 = new Float32Array(SIZE * SIZE), f2 = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    const gy = (y / SIZE) * cells, cy = Math.floor(gy);
    for (let x = 0; x < SIZE; x++) {
      const gx = (x / SIZE) * cells, cx = Math.floor(gx);
      let d1 = 9, d2 = 9;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const nx = cx + ox, ny = cy + oy;
        const wx = ((nx % cells) + cells) % cells, wy = ((ny % cells) + cells) % cells;
        const k = (wy * cells + wx) * 2;
        const dx = nx + pts[k] - gx, dy = ny + pts[k + 1] - gy;
        const d = dx * dx + dy * dy;
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
      }
      f1[y * SIZE + x] = Math.sqrt(d1);
      f2[y * SIZE + x] = Math.sqrt(d2);
    }
  }
  return { f1, f2 };
}

/** Periodic value noise with smooth interpolation. */
function valueNoise(cells) {
  const g = new Float32Array(cells * cells).map(() => rand());
  const out = new Float32Array(SIZE * SIZE);
  const s = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < SIZE; y++) {
    const fy = (y / SIZE) * cells, y0 = Math.floor(fy), ty = s(fy - y0);
    for (let x = 0; x < SIZE; x++) {
      const fx = (x / SIZE) * cells, x0 = Math.floor(fx), tx = s(fx - x0);
      const at = (i, j) => g[((j % cells) * cells) + (i % cells)];
      const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
      out[y * SIZE + x] = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    }
  }
  return out;
}

console.log('pebbles…');
const fine = worley(64);   // the main pebble grain
const fine2 = worley(97);  // a second, smaller grain so the pebbles vary in size
const coarse = worley(9);  // larger creases that break up the regularity
console.log('noise…');
const mottle = valueNoise(6), mottle2 = valueNoise(23), pores = valueNoise(256);

const H = new Float32Array(SIZE * SIZE);
const crease = new Float32Array(SIZE * SIZE);
for (let i = 0; i < SIZE * SIZE; i++) {
  const sm = (t) => t * t * (3 - 2 * t);
  const edge = Math.min(1, (fine.f2[i] - fine.f1[i]) * 1.6); // 0 at the crease between pebbles
  const edge2 = Math.min(1, (fine2.f2[i] - fine2.f1[i]) * 1.6);
  const dome = sm(Math.min(1, edge * 1.2)) * 0.7 + sm(Math.min(1, edge2 * 1.2)) * 0.3;
  const big = Math.min(1, (coarse.f2[i] - coarse.f1[i]) * 3.0);
  const c = (1 - dome) * 0.75 + (1 - Math.pow(big, 0.35)) * 0.6;
  crease[i] = Math.min(1, c);
  H[i] = dome * 0.8 + Math.pow(big, 0.35) * 0.3 + (pores[i] - 0.5) * 0.06 + (mottle2[i] - 0.5) * 0.1;
}
// soften: two passes of a small periodic box blur
for (let pass = 0; pass < 2; pass++) {
  const T = new Float32Array(H.length);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    let acc = 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) acc += H[((y + oy + SIZE) % SIZE) * SIZE + ((x + ox + SIZE) % SIZE)];
    T[y * SIZE + x] = acc / 9;
  }
  H.set(T);
}

console.log('maps…');
const normal = Buffer.alloc(SIZE * SIZE * 3), rough = Buffer.alloc(SIZE * SIZE), color = Buffer.alloc(SIZE * SIZE);
const STRENGTH = 3.2;
const h = (x, y) => H[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)];
for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
  const i = y * SIZE + x;
  const dx = (h(x + 1, y) - h(x - 1, y)) * STRENGTH, dy = (h(x, y + 1) - h(x, y - 1)) * STRENGTH;
  // OpenGL normal map: image rows go down, so flip dy for +Y up
  let nx = -dx, ny = dy, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
  normal[i * 3] = Math.round((nx * 0.5 + 0.5) * 255);
  normal[i * 3 + 1] = Math.round((ny * 0.5 + 0.5) * 255);
  normal[i * 3 + 2] = Math.round((nz * 0.5 + 0.5) * 255);
  const r = 0.56 + crease[i] * 0.3 + (mottle[i] - 0.5) * 0.12 - (H[i] - 0.5) * 0.08;
  rough[i] = Math.round(Math.min(1, Math.max(0, r)) * 255);
  const c = 0.86 + (mottle[i] - 0.5) * 0.2 + (mottle2[i] - 0.5) * 0.08 - crease[i] * 0.16 + (H[i] - 0.5) * 0.05;
  color[i] = Math.round(Math.min(1, Math.max(0, c)) * 255);
}

await sharp(normal, { raw: { width: SIZE, height: SIZE, channels: 3 } }).webp({ quality: 90 }).toFile('public/textures/leather_normal.webp');
await sharp(rough, { raw: { width: SIZE, height: SIZE, channels: 1 } }).webp({ quality: 88 }).toFile('public/textures/leather_rough.webp');
await sharp(color, { raw: { width: SIZE, height: SIZE, channels: 1 } }).webp({ quality: 88 }).toFile('public/textures/leather_color.webp');
console.log('done');
