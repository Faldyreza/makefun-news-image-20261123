// main.ts — news-image-20261123 v2 "THE WORLD" (fresh rewrite)
// A Node 22 program, standard library only. No network at run time.
// Draws a newspaper front page summing up Monday 23 November 2026 and
// writes /output/entry.png (1024x1024) plus /output/dossier.json.
// Everything is drawn procedurally: a supersampled software rasteriser and
// a single-stroke vector lettering system (no bitmap font, no image assets).
// Deterministic: two runs produce byte-identical PNG output.

import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";
import * as crypto from "node:crypto";

// ---------------------------------------------------------------------------
// Canvas: 1024x1024 final, rendered at SSx supersampling then downsampled.
// ---------------------------------------------------------------------------
const W = 1024;
const H = 1024;
const SS = 3;
const SW = W * SS;
const SH = H * SS;

const PAPER = [248, 244, 233];
const INK = [22, 19, 15];
const INK_SOFT = [58, 52, 44];
const GREY = [107, 101, 90];
const RULE = [185, 178, 162];
const RED = [168, 30, 36];
const RED_DARK = [122, 20, 26];
const NAVY = [30, 58, 92];
const GOLD = [242, 194, 0];
const EU_BLUE = [31, 58, 147];
const SEA = [46, 111, 126];
const SEA_DARK = [28, 78, 92];
const SEA_LIGHT = [127, 178, 190];
const SAND = [232, 220, 196];
const SAND_DARK = [214, 198, 168];
const WOOD = [94, 62, 38];
const WOOD_DARK = [70, 45, 27];
const CREAM = [250, 246, 236];
const SMOKE = [120, 116, 108];
const SMOKE_LIGHT = [168, 162, 150];
const GREEN = [46, 110, 68];

const buf = new Uint8Array(SW * SH * 3);
for (let i = 0; i < SW * SH; i++) {
  buf[i * 3] = PAPER[0];
  buf[i * 3 + 1] = PAPER[1];
  buf[i * 3 + 2] = PAPER[2];
}

function setPx(sx, sy, c) {
  if (sx < 0 || sy < 0 || sx >= SW || sy >= SH) return;
  const o = (sy * SW + sx) * 3;
  buf[o] = c[0];
  buf[o + 1] = c[1];
  buf[o + 2] = c[2];
}

// Fill a rectangle. Coordinates are in final (1024) pixels.
function fillRect(x, y, w, h, c) {
  const x0 = Math.max(0, Math.floor(x * SS));
  const y0 = Math.max(0, Math.floor(y * SS));
  const x1 = Math.min(SW, Math.ceil((x + w) * SS));
  const y1 = Math.min(SH, Math.ceil((y + h) * SS));
  for (let yy = y0; yy < y1; yy++) {
    let o = (yy * SW + x0) * 3;
    for (let xx = x0; xx < x1; xx++) {
      buf[o] = c[0];
      buf[o + 1] = c[1];
      buf[o + 2] = c[2];
      o += 3;
    }
  }
}

// Scanline polygon fill (non-zero). Points in final pixels.
function fillPoly(pts, c) {
  if (pts.length < 3) return;
  const sp = pts.map((p) => [p[0] * SS, p[1] * SS]);
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of sp) {
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(SH - 1, Math.ceil(maxY));
  const n = sp.length;
  for (let y = y0; y <= y1; y++) {
    const yc = y + 0.5;
    const xs = [];
    for (let i = 0; i < n; i++) {
      const a = sp[i];
      const b = sp[(i + 1) % n];
      if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) {
        const t = (yc - a[1]) / (b[1] - a[1]);
        xs.push(a[0] + t * (b[0] - a[0]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.floor(xs[k]));
      const xb = Math.min(SW - 1, Math.ceil(xs[k + 1]));
      let o = (y * SW + xa) * 3;
      for (let xx = xa; xx <= xb; xx++) {
        buf[o] = c[0];
        buf[o + 1] = c[1];
        buf[o + 2] = c[2];
        o += 3;
      }
    }
  }
}

function fillCircle(cx, cy, r, c) {
  const x0 = Math.max(0, Math.floor((cx - r) * SS));
  const x1 = Math.min(SW - 1, Math.ceil((cx + r) * SS));
  const y0 = Math.max(0, Math.floor((cy - r) * SS));
  const y1 = Math.min(SH - 1, Math.ceil((cy + r) * SS));
  const rs = r * SS;
  const cxs = cx * SS;
  const cys = cy * SS;
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cys;
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cxs;
      if (dx * dx + dy * dy <= rs * rs) setPx(x, y, c);
    }
  }
}

// n-pointed star polygon (alternating outer/inner radius).
function starPoly(cx, cy, rO, rI, n, rot) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? rO : rI;
    const a = rot + (i * Math.PI) / n;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

function fillStar(cx, cy, rO, rI, n, c, rot) {
  fillPoly(starPoly(cx, cy, rO, rI, n, rot === undefined ? -Math.PI / 2 : rot), c);
}

// Thick line segment with round caps. Width w in final pixels.
function strokeSeg(x0, y0, x1, y1, w, c) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.0001) {
    fillCircle(x0, y0, w / 2, c);
    return;
  }
  const nx = (-dy / len) * (w / 2);
  const ny = (dx / len) * (w / 2);
  fillPoly(
    [
      [x0 + nx, y0 + ny],
      [x1 + nx, y1 + ny],
      [x1 - nx, y1 - ny],
      [x0 - nx, y0 - ny],
    ],
    c
  );
  fillCircle(x0, y0, w / 2, c);
  fillCircle(x1, y1, w / 2, c);
}

// Polyline stroke; closed=true joins the last point back to the first.
function strokePoly(pts, w, c, closed) {
  for (let i = 0; i + 1 < pts.length; i++) {
    strokeSeg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w, c);
  }
  if (closed && pts.length > 2) {
    strokeSeg(
      pts[pts.length - 1][0],
      pts[pts.length - 1][1],
      pts[0][0],
      pts[0][1],
      w,
      c
    );
  }
}

// Downsample the supersampled buffer into a final RGB buffer.
function downsample() {
  const out = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const o = ((y * SS + sy) * SW + (x * SS + sx)) * 3;
          r += buf[o];
          g += buf[o + 1];
          b += buf[o + 2];
        }
      }
      const n = SS * SS;
      const o = (y * W + x) * 3;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Minimal PNG encoder (truecolour, filter 0, zlib level 9).
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function encodePNG(rgb) {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    rgb.copy(raw, y * (1 + W * 3) + 1, y * W * 3, (y + 1) * W * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Vector lettering: every glyph is a set of single strokes on a 6x10 grid
// (cap top y=0, baseline y=10, x-height top y=3, descenders to y=13).
// Strokes render as smooth round-capped lines, anti-aliased by the 3x
// supersampling above. No bitmap font anywhere in this program.
// Each entry: a = advance width in grid units, s = stroke polylines,
// d = filled dots [x, y, radius] in grid units.
// ---------------------------------------------------------------------------
const FONT = {
  A: { a: 7, s: [[[0, 10], [2.5, 0], [5, 10]], [[1.25, 6.5], [3.75, 6.5]]] },
  B: { a: 7, s: [[[0, 0], [0, 10]], [[0, 0], [3.5, 0], [5, 1.5], [5, 3.5], [3.5, 5], [0, 5]], [[0, 5], [3.5, 5], [5, 6.5], [5, 8.5], [3.5, 10], [0, 10]]] },
  C: { a: 7, s: [[[5, 1.5], [4, 0], [1.5, 0], [0, 1.5], [0, 8.5], [1.5, 10], [4, 10], [5, 8.5]]] },
  D: { a: 7, s: [[[0, 0], [0, 10]], [[0, 0], [3, 0], [5, 2], [5, 8], [3, 10], [0, 10]]] },
  E: { a: 7, s: [[[0, 0], [0, 10]], [[0, 0], [5, 0]], [[0, 5], [4, 5]], [[0, 10], [5, 10]]] },
  F: { a: 7, s: [[[0, 0], [0, 10]], [[0, 0], [5, 0]], [[0, 5], [4, 5]]] },
  G: { a: 7, s: [[[5, 1.5], [4, 0], [1.5, 0], [0, 1.5], [0, 8.5], [1.5, 10], [4, 10], [5, 8.5], [5, 5], [2.5, 5]]] },
  H: { a: 7, s: [[[0, 0], [0, 10]], [[5, 0], [5, 10]], [[0, 5], [5, 5]]] },
  I: { a: 5, s: [[[0, 0], [5, 0]], [[2.5, 0], [2.5, 10]], [[0, 10], [5, 10]]] },
  J: { a: 7, s: [[[1, 0], [4, 0], [5, 1], [5, 8], [4, 10], [2.5, 10], [1, 9]]] },
  K: { a: 7, s: [[[0, 0], [0, 10]], [[5, 0], [0, 5], [5, 10]]] },
  L: { a: 7, s: [[[0, 0], [0, 10], [5, 10]]] },
  M: { a: 8, s: [[[0, 10], [0, 0], [2.5, 6], [5, 0], [5, 10]]] },
  N: { a: 7, s: [[[0, 10], [0, 0], [5, 10], [5, 0]]] },
  O: { a: 7, s: [[[1.5, 0], [4, 0], [5, 1.5], [5, 8.5], [4, 10], [1.5, 10], [0, 8.5], [0, 1.5], [1.5, 0]]] },
  P: { a: 7, s: [[[0, 0], [0, 10]], [[0, 0], [3.5, 0], [5, 1.5], [5, 3.5], [3.5, 5], [0, 5]]] },
  Q: { a: 7, s: [[[1.5, 0], [4, 0], [5, 1.5], [5, 8.5], [4, 10], [1.5, 10], [0, 8.5], [0, 1.5], [1.5, 0]], [[3, 7], [5.5, 10.5]]] },
  R: { a: 7, s: [[[0, 0], [0, 10]], [[0, 0], [3.5, 0], [5, 1.5], [5, 3.5], [3.5, 5], [0, 5]], [[2.5, 5], [5, 10]]] },
  S: { a: 7, s: [[[5, 1.5], [4, 0], [1.5, 0], [0, 1.5], [0, 3.5], [1, 4.5], [4, 5.5], [5, 6.5], [5, 8.5], [4, 10], [1.5, 10], [0, 8.5]]] },
  T: { a: 7, s: [[[0, 0], [5, 0]], [[2.5, 0], [2.5, 10]]] },
  U: { a: 7, s: [[[0, 0], [0, 8], [1, 10], [4, 10], [5, 8], [5, 0]]] },
  V: { a: 7, s: [[[0, 0], [2.5, 10], [5, 0]]] },
  W: { a: 8, s: [[[0, 0], [1.25, 10], [2.5, 4], [3.75, 10], [5, 0]]] },
  X: { a: 7, s: [[[0, 0], [5, 10]], [[5, 0], [0, 10]]] },
  Y: { a: 7, s: [[[0, 0], [2.5, 5], [5, 0]], [[2.5, 5], [2.5, 10]]] },
  Z: { a: 7, s: [[[0, 0], [5, 0], [0, 10], [5, 10]]] },
  "0": { a: 7, s: [[[1.5, 0], [4, 0], [5, 1.5], [5, 8.5], [4, 10], [1.5, 10], [0, 8.5], [0, 1.5], [1.5, 0]]] },
  "1": { a: 5, s: [[[1, 2], [2.5, 0], [2.5, 10]], [[0, 10], [5, 10]]] },
  "2": { a: 7, s: [[[0, 1.5], [1, 0], [4, 0], [5, 1.5], [5, 3.5], [4, 5], [0, 10], [5, 10]]] },
  "3": { a: 7, s: [[[0, 1.5], [1, 0], [4, 0], [5, 1.5], [5, 3.5], [4, 5], [1.5, 5]], [[3.5, 5], [5, 6.5], [5, 8.5], [4, 10], [1, 10], [0, 8.5]]] },
  "4": { a: 7, s: [[[0, 0], [0, 6], [4.5, 6]], [[3.5, 0], [3.5, 10]]] },
  "5": { a: 7, s: [[[5, 0], [0, 0], [0, 4.5], [3, 4.5], [5, 6], [5, 8.5], [4, 10], [1, 10], [0, 8.5]]] },
  "6": { a: 7, s: [[[5, 1.5], [4, 0], [1, 0], [0, 2], [0, 8], [1, 10], [4, 10], [5, 8.5], [5, 6.5], [4, 5], [1, 5], [0, 6.5]]] },
  "7": { a: 7, s: [[[0, 0], [5, 0], [2, 10]]] },
  "8": { a: 7, s: [[[1.5, 0], [3.5, 0], [5, 1.5], [5, 3.5], [3.5, 5], [1.5, 5], [0, 3.5], [0, 1.5], [1.5, 0]], [[1.5, 5], [3.5, 5], [5, 6.5], [5, 8.5], [3.5, 10], [1.5, 10], [0, 8.5], [0, 6.5], [1.5, 5]]] },
  "9": { a: 7, s: [[[5, 10], [5, 2], [4, 0], [1, 0], [0, 1.5], [0, 3.5], [1, 5], [4, 5], [5, 6.5], [5, 8.5], [4, 10], [1, 10], [0, 8.5]]] },
  a: { a: 7, s: [[[1, 5], [4, 5], [5, 6.5], [5, 8.5], [4, 10], [1, 10], [0, 8.5], [0, 6.5], [1, 5]], [[5, 3], [5, 10]]] },
  b: { a: 7, s: [[[0, 0], [0, 10]], [[0, 6], [1, 5], [4, 5], [5, 6.5], [5, 8.5], [4, 10], [1, 10], [0, 8.5]]] },
  c: { a: 7, s: [[[5, 6.5], [4, 5], [1, 5], [0, 6.5], [0, 8.5], [1, 10], [4, 10], [5, 8.5]]] },
  d: { a: 7, s: [[[5, 0], [5, 10]], [[5, 6], [4, 5], [1, 5], [0, 6.5], [0, 8.5], [1, 10], [4, 10], [5, 8.5]]] },
  e: { a: 7, s: [[[5, 8.5], [4, 10], [1, 10], [0, 8.5], [0, 6.5], [1, 5], [4, 5], [5, 6.5], [5, 7.5], [0, 7.5]]] },
  f: { a: 4.5, s: [[[2.5, 1], [1, 2], [1, 10]], [[0, 3.5], [3.5, 3.5]]] },
  g: { a: 7, s: [[[1, 5], [4, 5], [5, 6.5], [5, 8.5], [4, 10], [1, 10], [0, 8.5], [0, 6.5], [1, 5]], [[5, 8], [5, 11], [4, 13], [2, 13], [1, 12]]] },
  h: { a: 7, s: [[[0, 0], [0, 10]], [[0, 6], [1, 5], [4, 5], [5, 6.5], [5, 10]]] },
  i: { a: 4, s: [[[2, 5], [2, 10]]], d: [[2, 2.2, 0.75]] },
  j: { a: 4.5, s: [[[3, 5], [3, 11], [2, 13], [0.5, 13]]], d: [[3, 2.2, 0.75]] },
  k: { a: 7, s: [[[0, 0], [0, 10]], [[4.5, 5], [1, 7], [4.5, 10]]] },
  l: { a: 4, s: [[[2, 0], [2, 10]]] },
  m: { a: 8, s: [[[0, 5], [0, 10]], [[0, 5], [1.5, 5], [2.5, 6.5], [2.5, 10]], [[2.5, 5], [4, 5], [5, 6.5], [5, 10]]] },
  n: { a: 7, s: [[[0, 3], [0, 10]], [[0, 3], [1, 3], [4, 3], [5, 5], [5, 10]]] },
  o: { a: 7, s: [[[1, 3], [4, 3], [5, 4.5], [5, 8.5], [4, 10], [1, 10], [0, 8.5], [0, 4.5], [1, 3]]] },
  p: { a: 7, s: [[[0, 3], [0, 13]], [[0, 6], [1, 5], [4, 5], [5, 6.5], [5, 8.5], [4, 10], [1, 10], [0, 8.5]]] },
  q: { a: 7, s: [[[5, 3], [5, 13]], [[5, 6], [4, 5], [1, 5], [0, 6.5], [0, 8.5], [1, 10], [4, 10], [5, 8.5]]] },
  r: { a: 7, s: [[[0, 3], [0, 10]], [[0, 3], [1, 3], [3.5, 3], [4.5, 4.5]]] },
  s: { a: 7, s: [[[4.5, 4.5], [4, 3], [1, 3], [0, 4.5], [0, 5.5], [1, 6.5], [4, 7.5], [5, 8.5], [5, 9], [4, 10], [1, 10], [0, 9]]] },
  t: { a: 4.5, s: [[[2, 0], [2, 10], [4, 10]], [[0, 3], [4, 3]]] },
  u: { a: 7, s: [[[0, 3], [0, 8], [1, 10], [4, 10], [5, 8], [5, 3]]] },
  v: { a: 7, s: [[[0, 3], [2.5, 10], [5, 3]]] },
  w: { a: 8, s: [[[0, 3], [1.25, 10], [2.5, 6], [3.75, 10], [5, 3]]] },
  x: { a: 7, s: [[[0, 3], [5, 10]], [[5, 3], [0, 10]]] },
  y: { a: 7, s: [[[0, 3], [2.5, 8], [5, 3]], [[4, 6.5], [2.5, 10], [2.5, 13], [1, 13]]] },
  z: { a: 7, s: [[[0, 3], [5, 3], [0, 10], [5, 10]]] },
  " ": { a: 4, s: [] },
  ".": { a: 4, s: [], d: [[2, 9.3, 0.85]] },
  ",": { a: 4, s: [[[2, 10], [1.8, 12], [1, 13]]], d: [[2, 9.3, 0.85]] },
  ":": { a: 4, s: [], d: [[2, 4.5, 0.85], [2, 9.3, 0.85]] },
  ";": { a: 4, s: [[[2, 10], [1.8, 12], [1, 13]]], d: [[2, 4.5, 0.85], [2, 9.3, 0.85]] },
  "!": { a: 4, s: [[[2, 0], [2, 7]]], d: [[2, 9.3, 0.85]] },
  "?": { a: 6, s: [[[1, 1.5], [2, 0], [4, 0], [5, 1.5], [5, 3], [4, 4.5], [2.5, 5.5], [2.5, 7]]], d: [[2.5, 9.3, 0.85]] },
  "'": { a: 3.5, s: [[[2, 0], [1.5, 2.5]]] },
  '"': { a: 6, s: [[[1.5, 0], [1, 2.5]], [[4, 0], [3.5, 2.5]]] },
  "(": { a: 4, s: [[[4, 0], [3, 1.5], [3, 8.5], [4, 10]]] },
  ")": { a: 4, s: [[[1, 0], [2, 1.5], [2, 8.5], [1, 10]]] },
  "-": { a: 5, s: [[[0.5, 5], [4.5, 5]]] },
  "–": { a: 7, s: [[[0, 5], [6, 5]]] },
  "—": { a: 8, s: [[[0, 5], [6.5, 5]]] },
  "/": { a: 5, s: [[[1, 10], [4, 0]]] },
  "%": { a: 8, s: [[[4, 0], [1, 10]]], d: [[1.4, 2, 1.5], [3.6, 8, 1.5]] },
  $: { a: 6, s: [[[4.5, 1], [3.5, 0], [1.5, 0], [0.5, 1], [0.5, 3], [1.5, 4.5], [3.5, 5.5], [4.5, 6.5], [4.5, 8.5], [3.5, 10], [1.5, 10], [0.5, 9]], [[2.5, -1], [2.5, 11]]] },
  "+": { a: 6, s: [[[2.5, 2], [2.5, 8]], [[0, 5], [5, 5]]] },
  "=": { a: 6, s: [[[0, 3.5], [5, 3.5]], [[0, 6.5], [5, 6.5]]] },
  "•": { a: 5, s: [], d: [[2.5, 5, 1.25]] },
  "×": { a: 6, s: [[[1, 3], [4, 7]], [[4, 3], [1, 7]]] },
};

// Width of one string at cap height `size`, in final pixels.
function textWidth(str, size, ls) {
  const s = size / 10;
  const spacing = ls === undefined ? 0 : ls;
  let w = 0;
  for (const ch of str) {
    const g = FONT[ch] || FONT["?"];
    w += g.a * s + spacing;
  }
  return w - spacing;
}

// Draw one string. (x, y) = top-left of the cap-height box.
// opts: weight (stroke width as fraction of size), align, ls (letter spacing).
function drawText(str, x, y, size, c, opts) {
  const o = opts || {};
  const s = size / 10;
  const w = o.weight === undefined ? 0.11 : o.weight;
  const ls = o.ls === undefined ? 0 : o.ls;
  const sw = Math.max(0.7, size * w);
  let cx = x;
  if (o.align === "center") cx = x - textWidth(str, size, ls) / 2;
  if (o.align === "right") cx = x - textWidth(str, size, ls);
  for (const ch of str) {
    const g = FONT[ch] || FONT["?"];
    for (const line of g.s) {
      const pts = line.map((p) => [cx + p[0] * s, y + p[1] * s]);
      strokePoly(pts, sw, c, false);
    }
    if (g.d) {
      for (const d of g.d) fillCircle(cx + d[0] * s, y + d[1] * s, d[2] * s, c);
    }
    cx += g.a * s + ls;
  }
}

// Greedy word wrap into lines that fit maxW at cap height `size`.
function wrapText(str, maxW, size, ls) {
  const words = str.split(" ");
  const lines = [];
  let cur = "";
  for (const word of words) {
    const test = cur ? cur + " " + word : word;
    if (textWidth(test, size, ls) <= maxW || !cur) {
      cur = test;
    } else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Draw a wrapped block. Returns the y just below the last line.
function drawBlock(lines, x, y, size, leading, c, opts) {
  const o = opts || {};
  for (const line of lines) {
    drawText(line, x, y, size, c, o);
    y += leading;
  }
  return y;
}

// Thin horizontal rule.
function hRule(x, y, w, c, thick) {
  fillRect(x, y, w, thick === undefined ? 1.5 : thick, c === undefined ? INK : c);
}

// ---------------------------------------------------------------------------
// Layout: newspaper front page, 1024x1024, margin 28.
// ---------------------------------------------------------------------------
const M = 28;
const CW = 968; // content width: x 28..996

function drawMasthead() {
  hRule(M, 16, CW, INK, 2.5);
  hRule(M, 22, CW, INK, 1);
  drawText("THE WORLD", 512, 32, 58, INK, { align: "center", weight: 0.15, ls: 8 });
  drawText("MONDAY, 23 NOVEMBER 2026", M, 104, 15, INK, { weight: 0.13 });
  drawText("ANTALYA  •  KYIV  •  BENGHAZI", 996, 104, 15, INK_SOFT, {
    align: "right",
    weight: 0.13,
  });
  hRule(M, 126, CW, INK, 1.5);
}

// --- Lead illustration: negotiation hall (left) + Turkiye map (right). ---
function drawLeadScene() {
  const x0 = M;
  const y0 = 140;
  const w = 612;
  const h = 178;
  fillRect(x0, y0, w, h, SAND);
  // Wall panelling.
  for (const px of [180, 330, 480]) {
    fillRect(px, y0, 1.5, 100, SAND_DARK);
  }
  // COP31 wall emblem.
  fillCircle(92, 178, 30, INK);
  fillCircle(92, 178, 27, PAPER);
  drawText("COP31", 92, 171, 12, INK, { align: "center", weight: 0.14 });
  // Flags on poles along the back wall.
  const flags = [
    { x: 300, kind: "eu" },
    { x: 360, kind: "tr" },
    { x: 420, kind: "un" },
    { x: 480, kind: "green" },
  ];
  for (const f of flags) {
    fillRect(f.x + 21, 178, 2, 62, INK);
    if (f.kind === "eu") {
      fillRect(f.x, 150, 44, 28, EU_BLUE);
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI * 2) / 12 - Math.PI / 2;
        fillStar(f.x + 22 + 9 * Math.cos(a), 164 + 9 * Math.sin(a), 2.2, 0.9, 5, GOLD);
      }
    } else if (f.kind === "tr") {
      fillRect(f.x, 150, 44, 28, RED);
      fillCircle(f.x + 16, 164, 8, CREAM);
      fillCircle(f.x + 18.5, 164, 6.5, RED);
      fillStar(f.x + 30, 164, 4.5, 1.8, 5, CREAM);
    } else if (f.kind === "un") {
      fillRect(f.x, 150, 44, 28, SEA);
      fillCircle(f.x + 22, 164, 8, CREAM);
      fillCircle(f.x + 22, 164, 6, SEA);
    } else {
      fillRect(f.x, 150, 44, 28, GREEN);
      fillStar(f.x + 22, 164, 6, 2.4, 5, CREAM);
    }
  }
  // Seated delegates (silhouettes) behind the table.
  const suits = [NAVY, INK_SOFT, GREY, WOOD_DARK, RED_DARK, NAVY];
  const dxs = [90, 180, 270, 360, 450, 540];
  for (let i = 0; i < dxs.length; i++) {
    const dx = dxs[i];
    fillPoly(
      [[dx - 24, 252], [dx - 16, 228], [dx + 16, 228], [dx + 24, 252]],
      suits[i]
    );
    fillCircle(dx, 212, 12, INK_SOFT);
  }
  // The long table, in perspective, with a cloth band.
  fillPoly([[40, 252], [628, 252], [640, 318], [28, 318]], WOOD);
  fillPoly([[33, 292], [635, 292], [640, 318], [28, 318]], CREAM);
  hRule(40, 252, 588, INK, 2);
  // Microphones and name plates on the table.
  for (const mx of [150, 320, 490]) {
    strokeSeg(mx, 252, mx, 236, 2, INK);
    fillCircle(mx, 234, 3.5, INK);
  }
  for (const nx of [120, 280, 440]) {
    fillRect(nx, 258, 46, 10, PAPER);
  }
  // A rejected draft: a sheet on the table, crossed out in red.
  fillPoly([[450, 254], [545, 254], [555, 272], [460, 272]], PAPER);
  strokeSeg(456, 257, 549, 269, 2.5, RED);
  strokeSeg(549, 257, 456, 269, 2.5, RED);
}

function drawTurkiyeMap() {
  const x0 = 652;
  const y0 = 140;
  fillRect(x0, y0, 344, 178, INK);
  fillRect(x0 + 3, y0 + 3, 338, 172, SEA_LIGHT);
  const ox = x0 + 3;
  const oy = y0 + 3;
  // Simplified Turkiye coastline.
  const land = [
    [20, 80], [55, 60], [105, 54], [165, 50], [225, 46], [285, 54],
    [318, 68], [314, 94], [296, 110], [256, 120], [206, 130], [156, 140],
    [116, 144], [66, 138], [26, 122], [8, 102],
  ].map((p) => [ox + p[0], oy + p[1]]);
  fillPoly(land, SAND_DARK);
  strokePoly(land, 1.5, SEA_DARK, true);
  drawText("BLACK SEA", ox + 48, oy + 16, 10, GREY, { weight: 0.13 });
  drawText("MEDITERRANEAN SEA", ox + 48, oy + 152, 10, GREY, { weight: 0.13 });
  drawText("TURKIYE", ox + 138, oy + 82, 15, INK, { weight: 0.14 });
  // Antalya on the south coast, where the summit met.
  fillStar(ox + 151, oy + 125, 8, 3.2, 5, RED);
  drawText("ANTALYA", ox + 165, oy + 119, 12, RED_DARK, { weight: 0.15 });
}

function drawLead() {
  drawLeadScene();
  drawTurkiyeMap();
  drawText("TALKS END", 512, 332, 54, INK, { align: "center", weight: 0.14 });
  drawText("WITH NO DEAL", 512, 392, 54, RED, { align: "center", weight: 0.14 });
  drawText(
    "EU AND 130 NATIONS REJECT DRAFT TEXT WITHOUT FOSSIL FUELS",
    512, 458, 19, INK_SOFT, { align: "center", weight: 0.13 }
  );
  drawText(
    "FIRST CLIMATE SUMMIT TO FAIL SINCE 2009 — ANTALYA, TURKIYE",
    512, 484, 19, INK_SOFT, { align: "center", weight: 0.13 }
  );
  hRule(M, 524, CW, INK, 2);
}

// --- Secondary stories. ---
function drawDymerArt(x, y) {
  fillRect(x, y, 312, 112, SAND);
  // Intact five-storey block with a lit window grid.
  fillRect(x + 20, y + 20, 120, 92, INK_SOFT);
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 4; c++) {
      const wx = x + 28 + c * 28;
      const wy = y + 28 + r * 17;
      fillRect(wx, wy, 14, 10, (r + c) % 3 === 0 ? INK : CREAM);
    }
  }
  // Collapsed corner: jagged slab, rubble, dust.
  fillPoly(
    [[x + 140, y + 20], [x + 182, y + 20], [x + 198, y + 44], [x + 186, y + 68],
     [x + 204, y + 92], [x + 178, y + 112], [x + 140, y + 112]],
    GREY
  );
  fillPoly([[x + 142, y + 112], [x + 172, y + 84], [x + 202, y + 112]], SMOKE);
  fillPoly([[x + 196, y + 112], [x + 224, y + 90], [x + 252, y + 112]], SMOKE);
  fillCircle(x + 172, y + 94, 7, SMOKE_LIGHT);
  fillCircle(x + 202, y + 104, 9, SMOKE_LIGHT);
  // Crane arm and hook over the rubble.
  strokeSeg(x + 308, y + 2, x + 212, y + 40, 4, INK);
  strokeSeg(x + 212, y + 40, x + 212, y + 66, 2, INK);
  // Ladder against the standing block.
  strokeSeg(x + 122, y + 112, x + 152, y + 44, 2, WOOD_DARK);
  strokeSeg(x + 132, y + 112, x + 162, y + 44, 2, WOOD_DARK);
  for (let i = 0; i < 5; i++) {
    strokeSeg(x + 126 + i * 6, y + 100 - i * 12, x + 136 + i * 6, y + 100 - i * 12, 1.5, WOOD_DARK);
  }
  // Two rescuers at the rubble.
  fillCircle(x + 216, y + 84, 4, RED_DARK);
  strokeSeg(x + 216, y + 88, x + 216, y + 104, 3, RED_DARK);
  fillCircle(x + 236, y + 92, 4, NAVY);
  strokeSeg(x + 236, y + 96, x + 236, y + 110, 3, NAVY);
  // Red-cross flag planted by the rescue.
  strokeSeg(x + 262, y + 44, x + 262, y + 84, 2, INK);
  fillRect(x + 262, y + 44, 18, 12, PAPER);
  strokeSeg(x + 266, y + 50, x + 276, y + 50, 2, RED);
  strokeSeg(x + 271, y + 46, x + 271, y + 54, 2, RED);
}

function drawMarketsArt(x, y) {
  fillRect(x, y, 312, 112, CREAM);
  for (const gy of [580 - 556 + y, 604 - 556 + y, 628 - 556 + y, 652 - 556 + y]) {
    fillRect(x + 16, gy, 280, 1, RULE);
  }
  // Axes.
  strokeSeg(x + 16, y + 10, x + 16, y + 104, 1.5, INK);
  strokeSeg(x + 16, y + 104, x + 300, y + 104, 1.5, INK);
  // Plunging market line with its falling area.
  const pts = [
    [x + 24, y + 24], [x + 64, y + 20], [x + 104, y + 34], [x + 144, y + 54],
    [x + 184, y + 84], [x + 224, y + 92], [x + 284, y + 102],
  ];
  fillPoly([...pts, [x + 284, y + 104], [x + 24, y + 104]], [232, 190, 186]);
  strokePoly(pts, 3.5, RED, false);
  for (const p of pts) fillCircle(p[0], p[1], 3, RED);
  // Arrowhead at the end of the fall.
  fillPoly(
    [[x + 284, y + 102], [x + 296, y + 100], [x + 290, y + 110]],
    RED
  );
}

function drawBenghaziArt(x, y) {
  fillRect(x, y, 312, 112, SEA_LIGHT);
  fillRect(x, y + 84, 312, 28, SEA);
  // Wave strokes.
  strokePoly([[x + 16, y + 44], [x + 60, y + 40], [x + 104, y + 44], [x + 148, y + 40]], 2, SEA_DARK, false);
  strokePoly([[x + 180, y + 52], [x + 224, y + 48], [x + 268, y + 52], [x + 300, y + 48]], 2, SEA_DARK, false);
  // Smoke over the stricken ship.
  fillCircle(x + 86, y + 19, 10, SMOKE);
  fillCircle(x + 106, y + 6, 12, SMOKE_LIGHT);
  fillCircle(x + 126, y + 16, 8, SMOKE);
  // The corvette, listing hard, half under.
  fillPoly(
    [[x + 56, y + 44], [x + 196, y + 24], [x + 221, y + 40], [x + 206, y + 66],
     [x + 76, y + 76]],
    INK_SOFT
  );
  // Mast with a small red flag.
  strokeSeg(x + 146, y + 30, x + 146, y + 0, 3, INK);
  fillPoly([[x + 146, y + 0], [x + 168, y + 6], [x + 146, y + 12]], RED);
  drawText("MERKURY", x + 106, y + 44, 9, CREAM, { weight: 0.13 });
  // Three sea drones closing in, with wakes.
  for (const dx of [36, 136, 236]) {
    fillPoly(
      [[x + dx, y + 92], [x + dx + 22, y + 92], [x + dx + 18, y + 100], [x + dx + 4, y + 100]],
      INK
    );
    strokeSeg(x + dx - 2, y + 96, x + dx - 18, y + 96, 1.5, CREAM);
    strokeSeg(x + dx - 2, y + 100, x + dx - 14, y + 102, 1.5, CREAM);
  }
}

function drawSecondary() {
  const cols = [
    { x: M, kicker: "DYMER, UKRAINE", kc: RED, art: drawDymerArt,
      head: ["11 KILLED IN", "DYMER STRIKE"],
      sub: ["BOY, 7, PULLED ALIVE AFTER", "14 HOURS IN THE RUBBLE", "45 KM NORTH OF KYIV"], subSize: 13 },
    { x: 356, kicker: "MARKETS", kc: NAVY, art: drawMarketsArt,
      head: ["AI SELL-OFF", "SINKS MARKETS"],
      sub: ["NIKKEI -5.06%", "WALL ST -3.7%", "KOSPI -5.21%"], subSize: 15 },
    { x: 684, kicker: "BENGHAZI, LIBYA", kc: SEA_DARK, art: drawBenghaziArt,
      head: ["RUSSIAN CORVETTE", "SUNK OFF BENGHAZI"],
      sub: ["KYIV SAYS 7 SEA DRONES", "HIT THE MERKURY", "CARGO SHIP ANGARA ALSO HIT"], subSize: 13 },
  ];
  for (const col of cols) {
    drawText(col.kicker, col.x, 536, 12, col.kc, { weight: 0.15 });
    col.art(col.x, 556);
    let hy = 678;
    for (const line of col.head) {
      drawText(line, col.x, hy, 23, INK, { weight: 0.14 });
      hy += 29;
    }
    let sy = 742;
    const lead = col.subSize === 15 ? 20 : 17;
    for (const line of col.sub) {
      drawText(line, col.x, sy, col.subSize, col.subSize === 15 ? RED : INK_SOFT, {
        weight: col.subSize === 15 ? 0.14 : 0.12,
      });
      sy += lead;
    }
  }
  // Vertical hairlines between columns.
  fillRect(348, 536, 1, 260, RULE);
  fillRect(676, 536, 1, 260, RULE);
  hRule(M, 812, CW, INK, 1.5);
}

// --- IN BRIEF strip. ---
function drawBriefs() {
  drawText("IN BRIEF", M, 826, 15, INK, { weight: 0.15 });
  hRule(120, 833, 876, RULE, 1);
  const items = [
    { k: "U.S. HOUSE", t: "Democrats win 258 seats, biggest majority since 1992." },
    { k: "SOUTH KOREA", t: "Exports pass $1 trillion for the first time." },
    { k: "MANCHESTER", t: "Co-op Live arena evacuated; 12,000 fans leave Don Toliver show." },
    { k: "MOTOGP", t: "Marquez takes his eighth world title." },
    { k: "PHILIPPINES", t: "Truth body counts 8,320 drug-war deaths, 2016-2022." },
  ];
  const colW = 185;
  const gap = 10;
  items.forEach((item, i) => {
    const x = M + i * (colW + gap);
    if (i > 0) fillRect(x - 5, 852, 1, 118, RULE);
    drawText(item.k, x, 852, 12, RED, { weight: 0.15 });
    const lines = wrapText(item.t, colW, 12.5, 0);
    drawBlock(lines, x, 872, 12.5, 16, INK_SOFT, { weight: 0.11 });
  });
  hRule(M, 984, CW, INK, 1.5);
  drawText(
    "THE WORLD — MONDAY, 23 NOVEMBER 2026 — ALL STORIES FIRST REPORTED TODAY",
    512, 994, 11, GREY, { align: "center", weight: 0.12 }
  );
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------
const STORIES = [
  { place: "Antalya, Turkiye", headline: "COP31 ends with no deal",
    facts: "EU and about 130 nations reject a draft text with no fossil fuels; first failed COP since 2009.",
    source: "Reuters, 23 Nov 2026" },
  { place: "Dymer, Ukraine", headline: "11 killed in strike on apartment block",
    facts: "Russian strike on a five-storey block 45 km north of Kyiv; a boy aged 7 pulled alive after 14 hours in the rubble.",
    source: "Reuters, 23 Nov 2026" },
  { place: "Markets", headline: "AI sell-off sinks markets",
    facts: "Nikkei -5.06%, S&P 500 -3.7%, KOSPI -5.21%.",
    source: "One Turn / Longbridge / PSG, 23 Nov 2026" },
  { place: "Benghazi, Libya", headline: "Russian corvette Merkury sunk",
    facts: "Sunk at the Benghazi naval base, said to be hit by 7 Ukrainian sea drones; cargo ship MV Angara also struck.",
    source: "CNN / AP, 23 Nov 2026" },
  { place: "Washington, USA", headline: "Democrats win 258 House seats",
    facts: "Biggest House majority since 1992.",
    source: "AP / Reuters, 22-23 Nov 2026" },
  { place: "Seoul, South Korea", headline: "Exports pass $1 trillion",
    facts: "First time on record; customs data to 20 Nov 2026.",
    source: "Korea Customs Service, 23 Nov 2026" },
  { place: "Manchester, UK", headline: "Co-op Live arena evacuated",
    facts: "Unknown substance at a Don Toliver concert; more than 12,000 fans, 50+ seek medical help.",
    source: "CNN, 23 Nov 2026" },
  { place: "MotoGP", headline: "Marquez takes eighth world title",
    facts: "Marc Marquez wins his eighth MotoGP crown.",
    source: "One Turn, 23 Nov 2026" },
  { place: "Manila, Philippines", headline: "Truth body counts 8,320 drug-war deaths",
    facts: "Philippine truth commission documents 8,320 deaths linked to the 2016-2022 drug war.",
    source: "Morning Coffee Thoughts, 23 Nov 2026" },
];

function main() {
  drawMasthead();
  drawLead();
  drawSecondary();
  drawBriefs();

  const rgb = downsample();
  const png = encodePNG(rgb);
  const sha = crypto.createHash("sha256").update(png).digest("hex");

  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "entry.png"), png);
  const dossier = {
    title: "THE WORLD — Monday, 23 November 2026",
    edition: "news-image-20261123 v2",
    image: { width: W, height: H, bytes: png.length, sha256: sha },
    stories: STORIES,
  };
  fs.writeFileSync(
    path.join(outDir, "dossier.json"),
    JSON.stringify(dossier, null, 2) + "\n"
  );
  console.log("entry.png " + png.length + " bytes sha256 " + sha);
}

main();
