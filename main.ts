// THE WORLD — front page for Monday, 23 November 2026.
// A program that renders a one-page newspaper front page as a single
// 1024x1024 PNG. Node 22 stdlib only, no network, fully deterministic.
// Everything is drawn procedurally: a tiny rasteriser, a hand-built
// vector stroke font with tight letter spacing and clear word gaps, and
// a hand-drawn map of Turkiye.
//
// Facts (verified 23 Nov 2026, from Reuters / CNN / AP / market wires):
//  - LEAD: COP31 in Antalya ends with NO deal. The EU and about 130
//    nations reject a text with no fossil fuels. First failed COP since 2009.
//  - DYMER, UKRAINE: Russian strike on a 5-storey apartment block,
//    45 km north of Kyiv. 11 killed. A 7-year-old boy survives 14 hours
//    under the rubble.
//  - MARKETS: AI sell-off. Nikkei -5.06%, S&P 500 -3.7%, KOSPI -5.21%.
//  - BENGHAZI, LIBYA: Russian corvette Merkury sunk at the naval base,
//    blamed on 7 Ukrainian sea drones. Cargo ship MV Angara also hit.
//  - IN BRIEF: Democrats take 258 House seats (biggest majority since
//    1992). South Korea exports top $1 trillion for the first time.
//    Co-op Live arena in Manchester evacuated, 12,000+ leave a
//    Don Toliver show. Marc Marquez wins an 8th MotoGP title.
//    Philippines truth commission documents 8,320 drug-war deaths,
//    2016-2022.

import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

// ---------------------------------------------------------------------------
// Rasteriser (rendered at 2x, then box-downsampled to 1024x1024)
// ---------------------------------------------------------------------------

const W = 1024;
const H = 1024;
const SS = 2;
const PW = W * SS;
const PH = H * SS;
const buf = new Uint8Array(PW * PH * 3);

type RGB = [number, number, number];

const PAPER: RGB = [247, 242, 231];
const INK: RGB = [24, 22, 18];
const RED: RGB = [178, 34, 26];
const BLUE: RGB = [31, 78, 121];
const SEA: RGB = [207, 224, 234];
const LAND: RGB = [216, 192, 138];
const WALL1: RGB = [233, 221, 199];
const WALL2: RGB = [224, 210, 186];
const FLOOR: RGB = [203, 184, 148];
const WOOD: RGB = [122, 82, 48];
const WOOD_D: RGB = [96, 62, 34];
const SKY: RGB = [223, 228, 232];
const GREY: RGB = [185, 178, 164];
const ORANGE: RGB = [214, 110, 30];
const TEAL: RGB = [42, 110, 104];

function setPx(x: number, y: number, c: RGB): void {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  if (xi < 0 || yi < 0 || xi >= PW || yi >= PH) return;
  const i = (yi * PW + xi) * 3;
  buf[i] = c[0];
  buf[i + 1] = c[1];
  buf[i + 2] = c[2];
}

function fillAll(c: RGB): void {
  for (let i = 0; i < PW * PH; i++) {
    buf[i * 3] = c[0];
    buf[i * 3 + 1] = c[1];
    buf[i * 3 + 2] = c[2];
  }
}

// Filled rectangle, coords in 1024-space.
function rect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.round(x * SS);
  const y0 = Math.round(y * SS);
  const x1 = Math.round((x + w) * SS);
  const y1 = Math.round((y + h) * SS);
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) setPx(xx, yy, c);
  }
}

// Filled circle, coords in render space.
function circleRaw(cx: number, cy: number, r: number, c: RGB): void {
  const y0 = Math.ceil(cy - r);
  const y1 = Math.floor(cy + r);
  for (let yy = y0; yy <= y1; yy++) {
    const dy = yy - cy;
    const half = Math.sqrt(Math.max(0, r * r - dy * dy));
    const x0 = Math.ceil(cx - half);
    const x1 = Math.floor(cx + half);
    for (let xx = x0; xx <= x1; xx++) setPx(xx, yy, c);
  }
}

function circle(x: number, y: number, r: number, c: RGB): void {
  circleRaw(x * SS, y * SS, r * SS, c);
}

// Scanline polygon fill, points in render space.
function fillPolyRaw(pts: Array<[number, number]>, c: RGB): void {
  if (pts.length < 3) return;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
  }
  for (let yy = Math.ceil(minY); yy <= Math.floor(maxY); yy++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if ((a[1] <= yy && b[1] > yy) || (b[1] <= yy && a[1] > yy)) {
        const t = (yy - a[1]) / (b[1] - a[1]);
        xs.push(a[0] + t * (b[0] - a[0]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.ceil(xs[k]);
      const x1 = Math.floor(xs[k + 1]);
      for (let xx = x0; xx <= x1; xx++) setPx(xx, yy, c);
    }
  }
}

function poly(pts: Array<[number, number]>, c: RGB): void {
  fillPolyRaw(
    pts.map(([x, y]) => [x * SS, y * SS] as [number, number]),
    c,
  );
}

// Thick line with round caps, coords in 1024-space.
function line(x0: number, y0: number, x1: number, y1: number, w: number, c: RGB): void {
  const X0 = x0 * SS;
  const Y0 = y0 * SS;
  const X1 = x1 * SS;
  const Y1 = y1 * SS;
  const r = (w * SS) / 2;
  const dx = X1 - X0;
  const dy = Y1 - Y0;
  const len = Math.hypot(dx, dy);
  if (len < 0.01) {
    circleRaw(X0, Y0, r, c);
    return;
  }
  const nx = (-dy / len) * r;
  const ny = (dx / len) * r;
  fillPolyRaw(
    [
      [X0 + nx, Y0 + ny],
      [X1 + nx, Y1 + ny],
      [X1 - nx, Y1 - ny],
      [X0 - nx, Y0 - ny],
    ],
    c,
  );
  circleRaw(X0, Y0, r, c);
  circleRaw(X1, Y1, r, c);
}

// Thick polyline (round joins), coords in 1024-space.
function polyline(pts: Array<[number, number]>, w: number, c: RGB): void {
  for (let i = 0; i + 1 < pts.length; i++) {
    line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w, c);
  }
}

// Filled ellipse via polygon approximation.
function ellipse(x: number, y: number, rx: number, ry: number, c: RGB): void {
  const pts: Array<[number, number]> = [];
  const n = 28;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([x + Math.cos(a) * rx, y + Math.sin(a) * ry]);
  }
  poly(pts, c);
}

// Rounded-rectangle fill.
function rrect(x: number, y: number, w: number, h: number, r: number, c: RGB): void {
  rect(x + r, y, w - 2 * r, h, c);
  rect(x, y + r, w, h - 2 * r, c);
  circle(x + r, y + r, r, c);
  circle(x + w - r, y + r, r, c);
  circle(x + r, y + h - r, r, c);
  circle(x + w - r, y + h - r, r, c);
}

// Rounded-rectangle outline (stroke), drawn as a polyline of arc points.
function rrectStroke(x: number, y: number, w: number, h: number, r: number, sw: number, c: RGB): void {
  const pts: Array<[number, number]> = [];
  const arc = (cx: number, cy: number, a0: number, a1: number) => {
    const n = 8;
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  };
  arc(x + w - r, y + r, -Math.PI / 2, 0);
  arc(x + w - r, y + h - r, 0, Math.PI / 2);
  arc(x + r, y + h - r, Math.PI / 2, Math.PI);
  arc(x + r, y + r, Math.PI, (Math.PI * 3) / 2);
  polyline(pts, sw, c);
}

// Five-point star, filled.
function star(cx: number, cy: number, rO: number, rI: number, c: RGB): void {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? rO : rI;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  poly(pts, c);
}

// ---------------------------------------------------------------------------
// Vector stroke font.
// Grid: capitals 0..6 wide, 0..8 tall (y=0 top, y=8 baseline).
// Lowercase: x-height 3..8, ascenders to 0, descenders to 11.
// Each glyph: [advance width in grid units, list of strokes].
// Letter gap is deliberately tiny and word gap is wide, so words read
// as whole words instead of breaking apart.
// ---------------------------------------------------------------------------

type Glyph = [number, Array<Array<number>>];

const FONT: Record<string, Glyph> = {
  A: [6, [[0, 8, 3, 0, 6, 8], [1.6, 5, 4.4, 5]]],
  B: [6, [[0, 0, 0, 8], [0, 0, 3.8, 0, 5.3, 1.2, 5.3, 2.6, 3.8, 3.8, 0, 3.8], [0, 3.8, 3.8, 3.8, 5.3, 5, 5.3, 6.6, 3.8, 8, 0, 8]]],
  C: [6, [[5.5, 1.5, 4, 0, 1.8, 0, 0, 2, 0, 6, 1.8, 8, 4, 8, 5.5, 6.5]]],
  D: [6, [[0, 0, 0, 8], [0, 0, 3.6, 0, 6, 2.6, 6, 5.4, 3.6, 8, 0, 8]]],
  E: [6, [[0, 0, 0, 8, 5.2, 8], [0, 0, 5.2, 0], [0, 4, 4, 4]]],
  F: [6, [[0, 0, 0, 8], [0, 0, 5.2, 0], [0, 4, 4, 4]]],
  G: [6, [[5.5, 1.5, 4, 0, 1.8, 0, 0, 2, 0, 6, 1.8, 8, 4, 8, 5.5, 6.5, 5.5, 4.5, 3, 4.5]]],
  H: [6, [[0, 0, 0, 8], [6, 0, 6, 8], [0, 4, 6, 4]]],
  I: [3.5, [[0.8, 0, 2.7, 0], [1.75, 0, 1.75, 8], [0.8, 8, 2.7, 8]]],
  J: [5.5, [[5, 0, 5, 5.5, 3.8, 8, 1.8, 8, 0.6, 6.6]]],
  K: [6, [[0, 0, 0, 8], [5.5, 0, 1, 4.2], [1.8, 3.4, 5.5, 8]]],
  L: [6, [[0, 0, 0, 8, 5.2, 8]]],
  M: [7, [[0, 8, 0, 0, 3.5, 4.6, 7, 0, 7, 8]]],
  N: [6.5, [[0, 8, 0, 0, 6.5, 8, 6.5, 0]]],
  O: [6.5, [[3.25, 0, 5, 0.8, 6.2, 2.8, 6.2, 5.2, 5, 7.2, 3.25, 8, 1.5, 7.2, 0.3, 5.2, 0.3, 2.8, 1.5, 0.8, 3.25, 0]]],
  P: [6, [[0, 0, 0, 8], [0, 0, 3.8, 0, 5.3, 1.2, 5.3, 2.6, 3.8, 3.8, 0, 3.8]]],
  Q: [6.5, [[3.25, 0, 5, 0.8, 6.2, 2.8, 6.2, 5.2, 5, 7.2, 3.25, 8, 1.5, 7.2, 0.3, 5.2, 0.3, 2.8, 1.5, 0.8, 3.25, 0], [3.8, 5.2, 6.5, 8]]],
  R: [6, [[0, 0, 0, 8], [0, 0, 3.8, 0, 5.3, 1.2, 5.3, 2.6, 3.8, 3.8, 0, 3.8], [2.6, 3.8, 6, 8]]],
  S: [6, [[5.5, 1.6, 4.2, 0, 1.8, 0, 0.3, 1.4, 0.3, 2.8, 1.6, 4, 4.4, 4, 5.7, 5.2, 5.7, 6.6, 4.2, 8, 1.8, 8, 0.3, 6.6]]],
  T: [6, [[0, 0, 6, 0], [3, 0, 3, 8]]],
  U: [6.5, [[0, 0, 0, 6, 1.6, 8, 4.9, 8, 6.5, 6, 6.5, 0]]],
  V: [6.5, [[0, 0, 3.25, 8, 6.5, 0]]],
  W: [8, [[0, 0, 2, 8, 4, 3.6, 6, 8, 8, 0]]],
  X: [6.5, [[0, 0, 6.5, 8], [6.5, 0, 0, 8]]],
  Y: [6.5, [[0, 0, 3.25, 4, 6.5, 0], [3.25, 4, 3.25, 8]]],
  Z: [6, [[0, 0, 6, 0, 0, 8, 6, 8]]],
  a: [6, [[5, 3.6, 3.6, 3, 1.6, 3, 0.4, 4.4, 0.4, 6.6, 1.6, 8, 3.6, 8, 5, 6.6, 5, 3.6], [5, 3, 5, 8]]],
  b: [6, [[0, 0, 0, 8], [0, 4.6, 1.6, 3, 3.6, 3, 5, 4.6, 5, 6.4, 3.6, 8, 1.6, 8, 0, 6.4]]],
  c: [6, [[5, 4.2, 3.6, 3, 1.8, 3, 0.4, 4.4, 0.4, 6.6, 1.8, 8, 3.6, 8, 5, 6.8]]],
  d: [6, [[6, 0, 6, 8], [6, 4.6, 4.4, 3, 2.4, 3, 1, 4.6, 1, 6.4, 2.4, 8, 4.4, 8, 6, 6.4]]],
  e: [6, [[5.2, 6.4, 4, 8, 2, 8, 0.5, 6.6, 0.5, 5, 1.4, 3.6, 3.4, 3, 5, 4, 5, 5.4, 0.5, 5.4]]],
  f: [5, [[2.2, 1.5, 2.2, 8], [2.2, 1.5, 3, 0.2, 4.8, 0.4], [1, 4, 4, 4]]],
  g: [6, [[5, 4, 3.6, 3, 1.6, 3, 0.4, 4.4, 0.4, 6.6, 1.6, 8, 3.6, 8, 5, 6.6, 5, 4], [5, 6.4, 4.4, 10.8, 2.4, 10.8, 1.2, 9.6]]],
  h: [6, [[0, 0, 0, 8], [0, 4.6, 1.4, 3, 3.4, 3, 5, 4.6, 5, 8]]],
  i: [3.5, [[1.75, 0.6, 1.75, 1.8], [1.75, 3, 1.75, 8]]],
  j: [4, [[3, 0.6, 3, 1.8], [3.4, 3, 3.4, 9.4, 2.4, 11, 0.8, 11]]],
  k: [6, [[0, 0, 0, 8], [5.5, 3, 1, 5.6], [2, 4.6, 5.5, 8]]],
  l: [3.5, [[1.75, 0, 1.75, 8]]],
  m: [8.5, [[0, 3, 0, 8], [0, 4, 1.2, 3, 2.8, 3, 3.8, 4, 3.8, 8], [3.8, 4, 5, 3, 6.6, 3, 7.6, 4, 7.6, 8]]],
  n: [6, [[0, 3, 0, 8], [0, 4.6, 1.4, 3, 3.4, 3, 5, 4.6, 5, 8]]],
  o: [6, [[3, 3, 4.6, 3.6, 5.4, 5, 5.4, 6.4, 4.4, 8, 1.8, 8, 0.6, 6.4, 0.6, 5, 1.4, 3.6, 3, 3]]],
  p: [6, [[0, 3, 0, 11], [0, 4.6, 1.6, 3, 3.6, 3, 5, 4.6, 5, 6.4, 3.6, 8, 1.6, 8, 0, 6.4]]],
  q: [6, [[6, 3, 6, 11], [6, 4.6, 4.4, 3, 2.4, 3, 1, 4.6, 1, 6.4, 2.4, 8, 4.4, 8, 6, 6.4]]],
  r: [5, [[0, 3, 0, 8], [0, 4.6, 1.4, 3, 3, 3, 4.2, 4]]],
  s: [6, [[5, 4.2, 3.6, 3, 1.8, 3, 0.5, 4.2, 0.5, 5, 1.6, 6, 3.6, 6, 4.8, 7, 4.4, 8, 2.6, 8, 1.2, 7]]],
  t: [5, [[2.6, 0, 2.6, 8], [0.8, 3.8, 4.4, 3.8], [2.6, 8, 4, 8]]],
  u: [6, [[0, 3, 0, 6.4, 1.4, 8, 3.4, 8, 5, 6.4, 5, 3]]],
  v: [6, [[0, 3, 2.8, 8, 5.6, 3]]],
  w: [7, [[0, 3, 1.5, 8, 3.5, 4.5, 5.5, 8, 7, 3]]],
  x: [6, [[0, 3, 5.6, 8], [5.6, 3, 0, 8]]],
  y: [6, [[0, 3, 2.8, 8, 5.6, 3], [2.8, 8, 2.8, 11, 1.2, 11]]],
  z: [6, [[0, 3, 5.6, 3, 0, 8, 5.6, 8]]],
  "0": [6.5, [[3.25, 0, 5, 0.8, 6.2, 2.8, 6.2, 5.2, 5, 7.2, 3.25, 8, 1.5, 7.2, 0.3, 5.2, 0.3, 2.8, 1.5, 0.8, 3.25, 0]]],
  "1": [5, [[2.2, 1, 3, 0, 3, 8], [1.2, 8, 4.8, 8]]],
  "2": [6, [[0.6, 2, 1.6, 0, 4, 0, 5.5, 1.4, 5.5, 2.8, 0, 8, 5.5, 8]]],
  "3": [6, [[0.4, 0, 4, 0, 5.5, 1.4, 4, 3.6, 1, 3.6], [4, 3.6, 5.5, 5, 4, 8, 0.4, 8]]],
  "4": [6, [[5, 0, 0.6, 5.4, 5, 5.4], [4, 0, 4, 8]]],
  "5": [6, [[5.5, 0, 0.4, 0, 0.4, 3.6, 3, 3.6, 5, 5, 5, 6.6, 3.6, 8, 1.4, 8, 0.4, 6.8]]],
  "6": [6.5, [[5.6, 1.2, 4.2, 0, 1.8, 0, 0.3, 2, 0.3, 6, 1.8, 8, 4.2, 8, 5.8, 6.4, 5.8, 4.6, 4.2, 3.6, 1.8, 3.6, 0.6, 5]]],
  "7": [6, [[0, 0, 6, 0, 2.6, 8]]],
  "8": [6.5, [[3.25, 0, 4.8, 0.6, 5.4, 2, 4.4, 3.6, 2, 3.6, 1, 2, 1.6, 0.6, 3.25, 0], [2, 3.6, 4.4, 3.6, 5.8, 5, 5.8, 6.6, 4.2, 8, 2.2, 8, 0.6, 6.6, 0.6, 5, 1.4, 3.8, 2, 3.6]]],
  "9": [6.5, [[0.6, 6.8, 1.8, 8, 4.2, 8, 5.8, 6, 5.8, 2, 4.2, 0, 1.8, 0, 0.3, 1.4, 0.3, 3.4, 1.8, 4.4, 4.2, 4.4, 5.6, 3]]],
  ".": [3.5, [[1.75, 7, 1.75, 7.9]]],
  ",": [3.5, [[1.9, 7, 1.9, 7.9], [1.9, 7.6, 1.2, 8.8]]],
  ":": [3.5, [[1.75, 3, 1.75, 3.9], [1.75, 7, 1.75, 7.9]]],
  ";": [3.5, [[1.75, 3, 1.75, 3.9], [1.9, 7, 1.9, 7.9], [1.9, 7.6, 1.2, 8.8]]],
  "'": [3, [[1.8, 0, 1.2, 2.2]]],
  '"': [5, [[1.6, 0, 1, 2.2], [4, 0, 3.4, 2.2]]],
  "-": [6, [[0.6, 4.4, 5.4, 4.4]]],
  "%": [7, [[0.6, 0.6, 6.4, 7.4], [2, 1.2, 3, 1.2, 3.8, 2, 3.8, 3, 3, 3.8, 2, 3.8, 1.2, 3, 1.2, 2, 2, 1.2], [5, 4.4, 6, 4.4, 6.8, 5.2, 6.8, 6.2, 6, 7, 5, 7, 4.2, 6.2, 4.2, 5.2, 5, 4.4]]],
  "+": [6, [[3, 1, 3, 7], [0.4, 4, 5.6, 4]]],
  "(": [4, [[3.4, 0, 1.6, 2, 1.6, 6, 3.4, 8]]],
  ")": [4, [[0.6, 0, 2.4, 2, 2.4, 6, 0.6, 8]]],
  "/": [6, [[5, 0, 1, 8]]],
  "!": [3.5, [[1.75, 0, 1.75, 5.4], [1.75, 7, 1.75, 7.9]]],
  "?": [6, [[1.2, 2, 2, 0.4, 4, 0.4, 5.2, 1.6, 4.4, 3.2, 3.2, 4.2, 3.2, 5], [3.2, 7, 3.2, 7.9]]],
  "$": [6, [[5.4, 1.6, 4.2, 0, 1.8, 0, 0.4, 1.4, 0.4, 2.8, 1.6, 4, 4.4, 4, 5.6, 5.2, 5.6, 6.6, 4.2, 8, 1.8, 8, 0.4, 6.6], [3, 0, 3, 8]]],
};

// Tight letter gap, wide word gap: words stay whole.
function textWidth(s: string, size: number): number {
  const u = size / 8;
  const gap = size * 0.06;
  const wordGap = size * 0.5;
  let w = 0;
  for (const ch of s) {
    if (ch === " ") {
      w += wordGap;
      continue;
    }
    const g = FONT[ch];
    if (!g) continue;
    w += g[0] * u + gap;
  }
  return w - gap;
}

function drawText(
  s: string,
  x: number,
  y: number,
  size: number,
  c: RGB,
  opts: { align?: "left" | "center" | "right"; weight?: number } = {},
): void {
  const align = opts.align ?? "left";
  const weight = opts.weight ?? 0.17;
  const u = size / 8;
  const gap = size * 0.06;
  const wordGap = size * 0.5;
  const sw = size * weight;
  let startX = x;
  const total = textWidth(s, size);
  if (align === "center") startX = x - total / 2;
  if (align === "right") startX = x - total;
  let cx = startX;
  for (const ch of s) {
    if (ch === " ") {
      cx += wordGap;
      continue;
    }
    const g = FONT[ch];
    if (!g) {
      cx += 3 * u + gap;
      continue;
    }
    for (const stroke of g[1]) {
      const pts: Array<[number, number]> = [];
      for (let i = 0; i + 1 < stroke.length; i += 2) {
        pts.push([cx + stroke[i] * u, y - (8 - stroke[i + 1]) * u]);
      }
      if (pts.length === 1) {
        circle(pts[0][0], pts[0][1], sw / 2, c);
      } else {
        polyline(pts, sw, c);
      }
    }
    cx += g[0] * u + gap;
  }
}

function wrapText(s: string, maxW: number, size: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur === "" ? w : cur + " " + w;
    if (textWidth(trial, size) <= maxW || cur === "") {
      cur = trial;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

// ---------------------------------------------------------------------------
// Scene pieces
// ---------------------------------------------------------------------------

const SKINS: RGB[] = [
  [242, 201, 160],
  [232, 184, 138],
  [201, 141, 95],
  [141, 90, 59],
  [240, 200, 168],
  [217, 160, 111],
];
const HAIRS: RGB[] = [
  [40, 32, 26],
  [150, 148, 142],
  [90, 58, 32],
  [52, 40, 30],
  [40, 32, 26],
  [70, 52, 36],
];
const JACKETS: RGB[] = [
  [31, 52, 84],
  [58, 58, 62],
  [122, 40, 48],
  [42, 110, 104],
  [48, 84, 52],
  [84, 96, 116],
];

function drawDelegate(cx: number, headCy: number, i: number): void {
  const skin = SKINS[i % SKINS.length];
  const hair = HAIRS[i % HAIRS.length];
  const jacket = JACKETS[i % JACKETS.length];
  const r = 30;
  // Shoulders / jacket.
  poly(
    [
      [cx - 52, headCy + 82],
      [cx - 44, headCy + 34],
      [cx - 26, headCy + 24],
      [cx + 26, headCy + 24],
      [cx + 44, headCy + 34],
      [cx + 52, headCy + 82],
    ],
    jacket,
  );
  // Shirt + tie.
  poly(
    [
      [cx - 12, headCy + 26],
      [cx + 12, headCy + 26],
      [cx, headCy + 52],
    ],
    [245, 245, 240],
  );
  poly(
    [
      [cx - 5, headCy + 30],
      [cx + 5, headCy + 30],
      [cx + 7, headCy + 56],
      [cx, headCy + 64],
      [cx - 7, headCy + 56],
    ],
    RED,
  );
  // Ears, head.
  circle(cx - r, headCy, 6, skin);
  circle(cx + r, headCy, 6, skin);
  circle(cx, headCy, r, skin);
  // Hair styles.
  if (i === 0) {
    // Side part: cap swept to the right.
    poly(
      [
        [cx - 30, headCy - 6],
        [cx - 28, headCy - 26],
        [cx - 8, headCy - 32],
        [cx + 16, headCy - 30],
        [cx + 30, headCy - 14],
        [cx + 30, headCy - 2],
        [cx + 12, headCy - 12],
        [cx - 12, headCy - 12],
      ],
      hair,
    );
  } else if (i === 1) {
    // Short grey hair.
    ellipse(cx, headCy - 20, 28, 12, hair);
    rect(cx - 28, headCy - 22, 56, 6, hair);
  } else if (i === 2) {
    // Curly hair: bumps along the top.
    ellipse(cx, headCy - 22, 29, 13, hair);
    circle(cx - 22, headCy - 18, 8, hair);
    circle(cx - 6, headCy - 28, 8, hair);
    circle(cx + 12, headCy - 28, 8, hair);
    circle(cx + 24, headCy - 16, 8, hair);
  } else if (i === 3) {
    // Bun.
    ellipse(cx, headCy - 20, 28, 12, hair);
    circle(cx, headCy - 36, 9, hair);
  } else if (i === 4) {
    // Bald: small side patches only.
    circle(cx - 28, headCy - 4, 4, hair);
    circle(cx + 28, headCy - 4, 4, hair);
  } else {
    // Neat short hair + glasses.
    ellipse(cx, headCy - 21, 28, 11, hair);
    circle(cx - 12, headCy - 4, 8, INK);
    circle(cx + 12, headCy - 4, 8, INK);
    circle(cx - 12, headCy - 4, 5.5, [245, 245, 240]);
    circle(cx + 12, headCy - 4, 5.5, [245, 245, 240]);
    line(cx - 4, headCy - 4, cx + 4, headCy - 4, 2, INK);
  }
  // Face: brows, eyes, nose, mouth.
  line(cx - 17, headCy - 12, cx - 7, headCy - 13, 2.4, INK);
  line(cx + 7, headCy - 13, cx + 17, headCy - 12, 2.4, INK);
  circle(cx - 12, headCy - 4, 2.6, INK);
  circle(cx + 12, headCy - 4, 2.6, INK);
  line(cx, headCy + 2, cx - 1, headCy + 10, 2, [120, 80, 60]);
  line(cx - 7, headCy + 17, cx + 7, headCy + 17, 2.4, INK);
}

function drawFlag(x: number, y: number, w: number, h: number, kind: number): void {
  rect(x, y, w, h, [245, 245, 240]);
  if (kind === 0) {
    // EU: blue field, ring of stars.
    rect(x, y, w, h, [28, 52, 120]);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      circle(x + w / 2 + Math.cos(a) * (w * 0.28), y + h / 2 + Math.sin(a) * (h * 0.26), 1.6, [250, 204, 0]);
    }
  } else if (kind === 1) {
    rect(x, y, w / 3, h, [0, 85, 164]);
    rect(x + (2 * w) / 3, y, w / 3, h, [200, 40, 40]);
  } else if (kind === 2) {
    rect(x, y, w, h / 2, [0, 122, 72]);
    rect(x, y + h / 2, w, h / 2, [250, 250, 250]);
    rect(x, y, w, h / 5, [0, 122, 72]);
  } else {
    rect(x, y, w, h / 3, [200, 40, 40]);
    rect(x, y + (2 * h) / 3, w, h / 3, [0, 60, 140]);
  }
  rect(x - 1, y - 1, w + 2, 2, INK);
  rect(x - 1, y + h - 1, w + 2, 2, INK);
  rect(x - 1, y - 1, 2, h + 2, INK);
  rect(x + w - 1, y - 1, 2, h + 2, INK);
}

// Turkiye outline, lon/lat pairs, drawn recognisably: wide Anatolian
// west, tapering east, Antalya bay notch on the south coast, Thrace
// bulge in the north-west.
const TURKIYE: Array<[number, number]> = [
  [26.0, 40.3], [26.4, 41.3], [28.0, 41.3], [28.9, 41.2], [30.5, 41.3],
  [31.5, 41.7], [33.0, 42.0], [34.5, 41.9], [35.3, 42.0], [36.5, 41.4],
  [37.8, 41.3], [39.3, 41.1], [40.5, 41.4], [41.7, 41.6], [42.8, 41.2],
  [43.8, 40.3], [44.5, 39.4], [44.3, 38.6], [43.5, 37.8], [42.3, 37.2],
  [40.8, 37.4], [39.5, 37.0], [38.2, 36.9], [36.8, 36.6], [36.1, 36.3],
  [35.9, 36.6], [35.0, 36.4], [33.8, 36.2], [32.9, 36.2], [32.0, 36.4],
  [31.2, 36.6], [30.7, 36.9], [30.2, 36.4], [29.3, 36.3], [28.5, 36.6],
  [27.9, 36.9], [27.4, 37.1], [27.0, 37.8], [26.9, 38.6], [26.7, 39.4],
  [26.4, 39.9],
];

function drawMapPanel(x0: number, y0: number, x1: number, y1: number): void {
  rect(x0, y0, x1 - x0, y1 - y0, SEA);
  rect(x0, y0, x1 - x0, 2, INK);
  rect(x0, y1 - 2, x1 - x0, 2, INK);
  rect(x0, y0, 2, y1 - y0, INK);
  rect(x1 - 2, y0, 2, y1 - y0, INK);
  drawText("ANTALYA, TURKIYE", (x0 + x1) / 2, y0 + 26, 17, INK, { align: "center", weight: 0.18 });
  const mx0 = x0 + 12;
  const mx1 = x1 - 12;
  const my0 = y0 + 38;
  const my1 = y1 - 56;
  const lonToX = (lon: number) => mx0 + ((lon - 26) / 19) * (mx1 - mx0);
  const latToY = (lat: number) => my1 - ((lat - 36) / 6.3) * (my1 - my0);
  const pts = TURKIYE.map(([lo, la]) => [lonToX(lo), latToY(la)] as [number, number]);
  poly(pts, LAND);
  polyline([...pts, pts[0]], 2.5, INK);
  drawText("BLACK SEA", x0 + 56, my0 + 16, 11, BLUE, { align: "center", weight: 0.16 });
  drawText("MEDITERRANEAN SEA", (x0 + x1) / 2 - 10, my1 + 16, 13, BLUE, { align: "center", weight: 0.16 });
  drawText("TURKIYE", lonToX(34.2), latToY(39.2), 15, INK, { align: "center", weight: 0.18 });
  const ax = lonToX(30.7);
  const ay = latToY(36.9);
  star(ax, ay, 9, 3.8, RED);
  drawText("ANTALYA", ax, ay - 16, 13, RED, { align: "center", weight: 0.18 });
  drawText("NO DEAL", (x0 + x1) / 2, y1 - 12, 15, RED, { align: "center", weight: 0.2 });
}

// ---------------------------------------------------------------------------
// Page composition
// ---------------------------------------------------------------------------

function drawMasthead(): void {
  drawText("THE WORLD", W / 2, 112, 100, INK, { align: "center", weight: 0.21 });
  rect(28, 122, 968, 4, INK);
  rect(28, 130, 968, 1.5, INK);
  drawText("MONDAY, 23 NOVEMBER 2026", 28, 150, 17, INK, { weight: 0.17 });
  drawText("IN ONE IMAGE", W / 2, 150, 17, INK, { align: "center", weight: 0.17 });
  drawText("EDITION 327", 996, 150, 17, INK, { align: "right", weight: 0.17 });
  rect(28, 160, 968, 3, INK);
}

function drawLeadHeadline(): void {
  drawText("COP31 ENDS WITH NO DEAL", W / 2, 206, 46, INK, { align: "center", weight: 0.19 });
  drawText("EU and 130 nations reject a text with no fossil fuels", W / 2, 232, 18, INK, { align: "center", weight: 0.16 });
  drawText("the first failed COP since 2009", W / 2, 256, 18, INK, { align: "center", weight: 0.16 });
}

function drawHall(): void {
  const x0 = 28;
  const x1 = 648;
  const y0 = 266;
  const y1 = 556;
  rect(x0, y0, x1 - x0, 74, WALL1);
  rect(x0, y0 + 74, x1 - x0, 96, WALL2);
  rect(x0, y0 + 170, x1 - x0, y1 - y0 - 170, FLOOR);
  // Wall panel seams.
  line(168, y0 + 8, 168, y0 + 162, 2, [198, 184, 160]);
  line(508, y0 + 8, 508, y0 + 162, 2, [198, 184, 160]);
  // Flags on the wall, clear of the bubble.
  drawFlag(58, y0 + 34, 44, 26, 0);
  drawFlag(128, y0 + 34, 44, 26, 1);
  drawFlag(500, y0 + 34, 44, 26, 2);
  drawFlag(570, y0 + 34, 44, 26, 3);
  // COP31 speech bubble, centred, clear of every head.
  rrect(292, y0 + 12, 176, 44, 10, [255, 255, 252]);
  rrectStroke(292, y0 + 12, 176, 44, 10, 3, INK);
  poly(
    [
      [372, y0 + 56],
      [394, y0 + 56],
      [383, y0 + 82],
    ],
    [255, 255, 252],
  );
  line(372, y0 + 56, 383, y0 + 82, 3, INK);
  line(394, y0 + 56, 383, y0 + 82, 3, INK);
  drawText("COP31", 380, y0 + 42, 26, INK, { align: "center", weight: 0.2 });
  // Six faced delegates behind the table.
  const centres = [92, 188, 284, 380, 476, 572];
  for (let i = 0; i < 6; i++) drawDelegate(centres[i], 400, i);
  // Table with name plates.
  rect(x0, 482, x1 - x0, 64, WOOD);
  rect(x0, 482, x1 - x0, 6, WOOD_D);
  for (let i = 0; i < 6; i++) {
    rect(centres[i] - 30, 500, 60, 24, [245, 245, 240]);
    rect(centres[i] - 30, 500, 60, 2, INK);
    line(centres[i] - 20, 512, centres[i] + 20, 512, 1.5, [150, 140, 120]);
  }
  rect(x0, y0, x1 - x0, 2, INK);
  rect(x0, y1 - 2, x1 - x0, 2, INK);
  rect(x0, y0, 2, y1 - y0, INK);
  rect(x1 - 2, y0, 2, y1 - y0, INK);
}

function drawDymerArt(x0: number, y0: number, x1: number, y1: number): void {
  rect(x0, y0, x1 - x0, y1 - y0, SKY);
  rect(x0, y1 - 34, x1 - x0, 34, [201, 189, 166]);
  // Five-storey block, damaged on the right.
  rect(x0 + 32, y0 + 18, 160, 92, GREY);
  rect(x0 + 32, y0 + 18, 160, 4, [150, 142, 128]);
  for (let f = 0; f < 5; f++) {
    for (let w = 0; w < 4; w++) {
      rect(x0 + 44 + w * 38, y0 + 28 + f * 16, 18, 10, [70, 72, 78]);
    }
  }
  // Rubble + dust on the damaged side.
  poly(
    [
      [x0 + 192, y1 - 34],
      [x0 + 230, y1 - 78],
      [x0 + 268, y1 - 34],
    ],
    [160, 148, 130],
  );
  poly(
    [
      [x0 + 236, y1 - 34],
      [x0 + 262, y1 - 62],
      [x0 + 292, y1 - 34],
    ],
    [140, 128, 110],
  );
  circle(x0 + 232, y1 - 66, 16, [210, 204, 192]);
  circle(x0 + 258, y1 - 52, 12, [220, 214, 202]);
  // Crane.
  line(x0 + 292, y0 + 8, x0 + 292, y1 - 34, 3, INK);
  line(x0 + 292, y0 + 8, x0 + 240, y0 + 8, 3, INK);
  line(x0 + 246, y0 + 8, x0 + 246, y0 + 26, 2, INK);
  // Two rescuers with orange helmets.
  for (const rx of [x0 + 208, x0 + 244]) {
    circle(rx, y1 - 26, 6, ORANGE);
    rect(rx - 5, y1 - 20, 10, 18, [240, 240, 235]);
  }
  // Red-cross flag.
  line(x0 + 296, y1 - 60, x0 + 296, y1 - 34, 2, INK);
  rect(x0 + 296, y1 - 60, 16, 11, [255, 255, 255]);
  line(x0 + 301, y1 - 59, x0 + 301, y1 - 50, 2.5, RED);
  line(x0 + 298, y1 - 54.5, x0 + 307, y1 - 54.5, 2.5, RED);
}

function drawMarketsArt(x0: number, y0: number, x1: number, y1: number): void {
  rect(x0, y0, x1 - x0, y1 - y0, [252, 250, 244]);
  // Legend at the top, clear of the chart lines below.
  const legend: Array<[string, RGB]> = [
    ["NIKKEI", RED],
    ["S&P 500", ORANGE],
    ["KOSPI", [110, 70, 150]],
  ];
  legend.forEach(([name, c], k) => {
    rect(x0 + 14, y0 + 8 + k * 16, 10, 10, c);
    drawText(name, x0 + 30, y0 + 18 + k * 16, 13, c, { weight: 0.18 });
  });
  // Axes + grid, chart area below the legend.
  line(x0 + 22, y0 + 58, x0 + 22, y1 - 14, 2, INK);
  line(x0 + 22, y1 - 14, x1 - 10, y1 - 14, 2, INK);
  line(x0 + 22, y0 + 78, x1 - 10, y0 + 78, 1, [210, 205, 195]);
  line(x0 + 22, y0 + 96, x1 - 10, y0 + 96, 1, [210, 205, 195]);
  // Three falling lines, spread apart at the right end.
  polyline(
    [
      [x0 + 30, y0 + 62],
      [x0 + 150, y0 + 78],
      [x0 + 282, y0 + 96],
    ],
    3.5,
    RED,
  );
  polyline(
    [
      [x0 + 30, y0 + 66],
      [x0 + 150, y0 + 84],
      [x0 + 282, y0 + 106],
    ],
    3.5,
    ORANGE,
  );
  polyline(
    [
      [x0 + 30, y0 + 70],
      [x0 + 150, y0 + 90],
      [x0 + 282, y0 + 114],
    ],
    3.5,
    [110, 70, 150],
  );
  circle(x0 + 282, y0 + 96, 4, RED);
  circle(x0 + 282, y0 + 106, 4, ORANGE);
  circle(x0 + 282, y0 + 114, 4, [110, 70, 150]);
}

function drawBenghaziArt(x0: number, y0: number, x1: number, y1: number): void {
  rect(x0, y0, x1 - x0, y1 - y0, SKY);
  rect(x0, y0 + 66, x1 - x0, y1 - y0 - 66, [127, 168, 196]);
  // Wave lines.
  for (const wy of [y0 + 78, y0 + 96, y0 + 112]) {
    line(x0 + 12, wy, x0 + 90, wy, 1.5, [200, 220, 232]);
    line(x0 + 180, wy + 4, x0 + 300, wy + 4, 1.5, [200, 220, 232]);
  }
  // Cargo ship MV Angara, far side.
  rect(x0 + 14, y0 + 58, 74, 12, [60, 64, 70]);
  rect(x0 + 22, y0 + 44, 18, 14, [90, 60, 50]);
  rect(x0 + 44, y0 + 48, 18, 10, [60, 90, 60]);
  // Listing corvette, bow down, smoke above.
  circle(x0 + 190, y0 + 34, 13, [170, 168, 162]);
  circle(x0 + 208, y0 + 22, 10, [185, 183, 178]);
  circle(x0 + 222, y0 + 12, 8, [200, 198, 192]);
  poly(
    [
      [x0 + 108, y0 + 62],
      [x0 + 268, y0 + 48],
      [x0 + 284, y0 + 62],
      [x0 + 120, y0 + 78],
    ],
    [106, 111, 117],
  );
  rect(x0 + 108, y0 + 62, 176, 3, RED);
  rect(x0 + 190, y0 + 30, 26, 20, [88, 92, 98]);
  line(x0 + 196, y0 + 30, x0 + 196, y0 + 12, 3, INK);
  // Sea drones: low dark hulls with wakes.
  for (const [dx, dy] of [
    [x0 + 40, y0 + 96],
    [x0 + 250, y0 + 106],
    [x0 + 288, y0 + 88],
  ]) {
    ellipse(dx, dy, 12, 4, [40, 44, 50]);
    line(dx - 22, dy + 2, dx - 12, dy, 1.5, [220, 232, 240]);
  }
}

function drawColumn(
  x0: number,
  x1: number,
  art: (x0: number, y0: number, x1: number, y1: number) => void,
  headline: string,
  fact: string,
): void {
  art(x0, 572, x1, 700);
  rect(x0, 572, x1 - x0, 2, INK);
  rect(x0, 698, x1 - x0, 2, INK);
  rect(x0, 572, 2, 128, INK);
  rect(x1 - 2, 572, 2, 128, INK);
  const headLines = wrapText(headline, x1 - x0 - 8, 21);
  let hy = 730;
  for (const ln of headLines) {
    drawText(ln, (x0 + x1) / 2, hy, 21, INK, { align: "center", weight: 0.19 });
    hy += 26;
  }
  const factLines = wrapText(fact, x1 - x0 - 10, 15);
  let fy = 786;
  for (const ln of factLines) {
    drawText(ln, (x0 + x1) / 2, fy, 15, INK, { align: "center", weight: 0.15 });
    fy += 18;
  }
}

function drawBrief(x: number, y: number, w: number, head: string, sub: string): void {
  rect(x, y + 4, 9, 9, RED);
  drawText(head, x + 16, y + 20, 18, INK, { weight: 0.18 });
  drawText(sub, x + 16, y + 42, 14, [70, 66, 58], { weight: 0.15 });
}

function drawPage(): void {
  fillAll(PAPER);
  drawMasthead();
  drawLeadHeadline();
  drawHall();
  drawMapPanel(664, 266, 996, 556);
  drawColumn(28, 340, drawDymerArt, "11 KILLED IN DYMER STRIKE", "Boy, 7, survives 14 hours under the rubble, 45 km north of Kyiv.");
  drawColumn(356, 668, drawMarketsArt, "AI SELL-OFF HITS MARKETS", "Nikkei -5.06%, S&P 500 -3.7%, KOSPI -5.21%.");
  drawColumn(684, 996, drawBenghaziArt, "RUSSIAN CORVETTE SUNK OFF BENGHAZI", "Merkury hit in port; 7 Ukrainian sea drones blamed; MV Angara also struck.");
  drawText("IN BRIEF", 28, 848, 16, INK, { weight: 0.19 });
  rect(28, 856, 968, 2, INK);
  drawBrief(28, 862, 472, "DEMOCRATS TAKE 258 SEATS", "Biggest House majority since 1992");
  drawBrief(524, 862, 472, "KOREA EXPORTS TOP $1 TRILLION", "A first in the country's history");
  drawBrief(28, 922, 472, "CO-OP LIVE ARENA EVACUATED", "12,000+ leave a show in Manchester");
  drawBrief(524, 922, 472, "MARQUEZ WINS 8TH MOTOGP TITLE", "An eighth world crown");
  rect(28, 974, 968, 2, INK);
  drawText(
    "ALSO: Philippines truth commission documents 8,320 drug-war deaths, 2016-2022.",
    W / 2,
    998,
    14,
    INK,
    { align: "center", weight: 0.15 },
  );
}

// ---------------------------------------------------------------------------
// PNG encoding
// ---------------------------------------------------------------------------

const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(rgb: Uint8Array, w: number, h: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0;
    raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (1 + w * 3) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Box-downsample the 2x render buffer to 1024x1024.
function downsample(): Uint8Array {
  const out = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          const i = ((y * SS + dy) * PW + (x * SS + dx)) * 3;
          r += buf[i];
          g += buf[i + 1];
          b += buf[i + 2];
        }
      }
      const o = (y * W + x) * 3;
      out[o] = Math.round(r / (SS * SS));
      out[o + 1] = Math.round(g / (SS * SS));
      out[o + 2] = Math.round(b / (SS * SS));
    }
  }
  return out;
}

function main(): void {
  drawPage();
  const rgb = downsample();
  const png = encodePng(rgb, W, H);
  mkdirSync("/output", { recursive: true });
  writeFileSync("/output/entry.png", png);
  const dossier = {
    title: "THE WORLD — Monday, 23 November 2026",
    size: [W, H],
    bytes: png.length,
    lead: "COP31 ends with no deal in Antalya; EU and about 130 nations reject a text with no fossil fuels; first failed COP since 2009.",
    dymer: "Russian strike on a 5-storey apartment block in Dymer, 45 km north of Kyiv; 11 killed; boy, 7, survives 14 hours under the rubble.",
    markets: "AI sell-off: Nikkei -5.06%, S&P 500 -3.7%, KOSPI -5.21%.",
    benghazi: "Russian corvette Merkury sunk at the Benghazi naval base; 7 Ukrainian sea drones blamed; cargo ship MV Angara also struck.",
    brief: [
      "Democrats take 258 House seats, biggest majority since 1992.",
      "South Korea exports top $1 trillion for the first time.",
      "Co-op Live arena evacuated; 12,000+ leave a Don Toliver show in Manchester.",
      "Marc Marquez wins an 8th MotoGP title.",
      "Philippines truth commission documents 8,320 drug-war deaths, 2016-2022.",
    ],
  };
  writeFileSync("/output/dossier.json", JSON.stringify(dossier, null, 2) + "\n");
}

main();
