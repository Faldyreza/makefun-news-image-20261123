// main.ts - news-image-20261123 v3 "THE WORLD"
// makefun anchor a0028b05396a333c33a61ca402e54cbb44c0b355 round 34205816
// Node 22 stdlib only. No network at run time. Deterministic output.
// Writes entry.png (1024x1024) and dossier.json into the output dir.
// Facts: all verified 23 Nov 2026, see dossier.json for sources.
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const W = 1024;
const SS = 3;
const SW = W * SS;
const OUT = process.env.MAKEFUN_OUTPUT_DIR || "/output";

// ---------- colour helpers ----------
function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ---------- raster buffer (supersampled) ----------
const buf = new Uint8ClampedArray(SW * SW * 3);
const PAPER = rgb("#f6f1e5");
for (let i = 0; i < SW * SW; i++) {
  buf[i * 3] = PAPER[0];
  buf[i * 3 + 1] = PAPER[1];
  buf[i * 3 + 2] = PAPER[2];
}

function putPx(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= SW || y >= SW) return;
  const i = (y * SW + x) * 3;
  if (a >= 1) {
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
  } else {
    buf[i] = Math.round(buf[i] * (1 - a) + r * a);
    buf[i + 1] = Math.round(buf[i + 1] * (1 - a) + g * a);
    buf[i + 2] = Math.round(buf[i + 2] * (1 - a) + b * a);
  }
}

// Fill a rectangle, coordinates in final (1024) space.
function fillRect(x, y, w, h, hex, a) {
  const c = rgb(hex);
  const alpha = a === undefined ? 1 : a;
  const x0 = Math.max(0, Math.round(x * SS));
  const y0 = Math.max(0, Math.round(y * SS));
  const x1 = Math.min(SW, Math.round((x + w) * SS));
  const y1 = Math.min(SW, Math.round((y + h) * SS));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      putPx(xx, yy, c[0], c[1], c[2], alpha);
    }
  }
}

// Fill a disc, coordinates in final space.
function fillCircle(cx, cy, r, hex, a) {
  const c = rgb(hex);
  const alpha = a === undefined ? 1 : a;
  const rr = r * SS;
  const x0 = Math.max(0, Math.floor((cx - r) * SS));
  const x1 = Math.min(SW - 1, Math.ceil((cx + r) * SS));
  const y0 = Math.max(0, Math.floor((cy - r) * SS));
  const y1 = Math.min(SW - 1, Math.ceil((cy + r) * SS));
  const ccx = cx * SS;
  const ccy = cy * SS;
  for (let yy = y0; yy <= y1; yy++) {
    for (let xx = x0; xx <= x1; xx++) {
      const dx = xx - ccx;
      const dy = yy - ccy;
      if (dx * dx + dy * dy <= rr * rr) {
        putPx(xx, yy, c[0], c[1], c[2], alpha);
      }
    }
  }
}

// Fill a polygon, points in final space, one point per array entry.
function poly(pts, hex, a) {
  const c = rgb(hex);
  const alpha = a === undefined ? 1 : a;
  const p = pts.map((q) => [q[0] * SS, q[1] * SS]);
  let minY = Infinity;
  let maxY = -Infinity;
  for (const q of p) {
    minY = Math.min(minY, q[1]);
    maxY = Math.max(maxY, q[1]);
  }
  minY = Math.max(0, Math.floor(minY));
  maxY = Math.min(SW - 1, Math.ceil(maxY));
  for (let y = minY; y <= maxY; y++) {
    const xs = [];
    for (let i = 0; i < p.length; i++) {
      const p1 = p[i];
      const p2 = p[(i + 1) % p.length];
      if ((p1[1] <= y && p2[1] > y) || (p2[1] <= y && p1[1] > y)) {
        const t = (y - p1[1]) / (p2[1] - p1[1]);
        xs.push(p1[0] + t * (p2[0] - p1[0]));
      }
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.floor(xs[k]));
      const x1 = Math.min(SW - 1, Math.ceil(xs[k + 1]));
      for (let x = x0; x <= x1; x++) {
        putPx(x, y, c[0], c[1], c[2], alpha);
      }
    }
  }
}

// Thick line with round caps, coordinates in final space.
function thickLine(x1, y1, x2, y2, w, hex, a) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(1, Math.ceil((len * SS) / Math.max(1, w * SS * 0.4)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    fillCircle(x, y, w / 2, hex, a);
  }
}

// Rounded rectangle, coordinates in final space.
function roundRect(x, y, w, h, r, hex, a) {
  fillRect(x + r, y, w - 2 * r, h, hex, a);
  fillRect(x, y + r, w, h - 2 * r, hex, a);
  fillCircle(x + r, y + r, r, hex, a);
  fillCircle(x + w - r, y + r, r, hex, a);
  fillCircle(x + r, y + h - r, r, hex, a);
  fillCircle(x + w - r, y + h - r, r, hex, a);
}

// Five-point star polygon.
function star(cx, cy, ro, ri, hex) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? ro : ri;
    pts.push([cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]);
  }
  poly(pts, hex);
}

// ---------- vector lettering ----------
// Single-stroke glyphs on a 9-wide by 16-tall grid.
// Cap top y=0, baseline y=12, descender bottom y=16.
const GLYPHS = {
  A: "0,12 5,0 9,12|3,8 6,8",
  B: "1,0 1,12|1,0 6,0 8,2 8,4 6,6 1,6|6,6 8,8 8,10 6,12 1,12",
  C: "8,2 6,0 3,0 1,2 1,10 3,12 6,12 8,10",
  D: "1,0 1,12 6,12 8,10 8,2 6,0 1,0",
  E: "8,0 1,0 1,12 8,12|1,6 6,6",
  F: "1,0 1,12|1,0 8,0|1,6 6,6",
  G: "8,2 6,0 3,0 1,2 1,10 3,12 7,12 8,10 8,7 5,7",
  H: "1,0 1,12|8,0 8,12|1,6 8,6",
  I: "5,0 5,12|2,0 8,0|2,12 8,12",
  J: "7,0 7,10 5,12 2,12 1,10",
  K: "1,0 1,12|8,0 1,6|3,8 8,12",
  L: "1,0 1,12 8,12",
  M: "1,12 1,0 5,7 8,0 8,12",
  N: "1,12 1,0 8,12 8,0",
  O: "3,0 7,0 8,3 8,9 7,12 3,12 1,9 1,3 3,0",
  P: "1,12 1,0 7,0 8,2 8,5 6,6 1,6",
  Q: "3,0 7,0 8,3 8,9 7,12 3,12 1,9 1,3 3,0|6,9 9,12",
  R: "1,12 1,0 7,0 8,2 8,5 6,6 1,6|5,6 9,12",
  S: "8,2 6,0 3,0 1,2 1,5 3,6 7,6 8,8 8,10 6,12 3,12 1,10",
  T: "1,0 8,0|5,0 5,12",
  U: "1,0 1,10 3,12 6,12 8,10 8,0",
  V: "1,0 5,12 8,0",
  W: "1,0 2,12 5,7 7,12 8,0",
  X: "1,0 8,12|8,0 1,12",
  Y: "1,0 5,6 8,0|5,6 5,12",
  Z: "1,0 8,0 1,12 8,12",
  a: "7,5 3,5 1,7 1,10 3,12 6,12 8,10 8,5",
  b: "1,0 1,12|1,7 4,5 7,6 8,8 8,10 6,12 3,12 1,10",
  c: "8,7 6,5 3,5 1,7 1,10 3,12 6,12 8,10",
  d: "8,0 8,12|8,7 5,5 2,6 1,8 1,10 3,12 6,12 8,10",
  e: "1,9 8,9|8,7 6,5 3,5 1,7 1,10 3,12 6,12 8,10",
  f: "6,12 6,0 3,0 2,1|2,5 6,5",
  g: "8,6 6,5 3,5 1,7 1,10 3,12 6,12 8,10 8,15 6,16 3,16 1,14",
  h: "1,0 1,12|1,6 4,5 7,6 8,8 8,12",
  i: "4,5 4,12|4,1 4,2",
  j: "6,1 6,2|6,5 6,14 4,16 2,16 1,14",
  k: "1,0 1,12|7,5 1,9|3,10 7,12",
  l: "4,0 4,12",
  m: "1,12 1,5 3,5 4,7 4,12|4,7 5,5 7,5 8,7 8,12",
  n: "1,12 1,5 4,5 7,6 8,8 8,12",
  o: "3,5 6,5 8,7 8,10 6,12 3,12 1,10 1,7 3,5",
  p: "1,5 1,16|1,9 3,5 6,5 8,7 8,10 6,12 3,12 1,10",
  q: "8,5 8,16|8,9 6,5 3,5 1,7 1,10 3,12 6,12 8,10",
  r: "1,12 1,5 4,5 6,6 7,7",
  s: "7,6 3,5 1,7 1,8 3,10 6,10 8,11 6,12 3,12 1,11",
  t: "4,1 4,12 3,12 6,12|2,5 7,5",
  u: "1,5 1,10 3,12 6,12 8,10 8,5|8,5 8,12",
  v: "1,5 4,12 8,5",
  w: "1,5 2,12 4,8 6,12 8,5",
  x: "1,5 8,12|8,5 1,12",
  y: "1,5 4,11 8,5|4,11 4,15 2,16 1,15",
  z: "1,5 8,5 1,12 8,12",
  "0": "3,0 7,0 8,3 8,9 7,12 3,12 1,9 1,3 3,0",
  "1": "5,0 5,12|2,2 5,0|2,12 8,12",
  "2": "1,2 3,0 6,0 8,2 8,5 1,12 8,12",
  "3": "1,2 3,0 6,0 8,2 8,5 6,6 8,7 8,10 6,12 3,12 1,10",
  "4": "6,0 1,8 8,8|6,0 6,12",
  "5": "8,0 1,0 1,6 6,6 8,8 8,10 6,12 1,12",
  "6": "8,2 6,0 3,0 1,2 1,9 3,12 6,12 8,10 8,7 6,6 3,6 1,8",
  "7": "1,0 8,0 4,12",
  "8": "3,0 6,0 8,2 8,10 6,12 3,12 1,10 1,2 3,0|1,6 8,6",
  "9": "1,10 3,12 6,12 8,10 8,3 6,0 3,0 1,2 1,5 3,6 6,6 8,4",
  ".": "4,11 4,12",
  ",": "4,11 4,12 3,14 2,15",
  ":": "4,4 4,5|4,10 4,11",
  ";": "4,4 4,5|4,10 4,12 3,14 2,15",
  "!": "4,0 4,9|4,11 4,12",
  "?": "2,2 4,0 7,1 8,3 8,5 6,7 4,7 4,9|4,11 4,12",
  "-": "1,7 8,7",
  "'": "4,0 4,3",
  '"': "3,0 3,3|6,0 6,3",
  "%": "8,0 1,12|1,2 3,1 5,2 5,4 3,5 1,4 1,2|8,8 6,7 4,8 4,10 6,11 8,10 8,8",
  "(": "6,0 4,2 3,6 3,9 4,11 6,12",
  ")": "3,0 5,2 6,6 6,9 5,11 3,12",
  "/": "8,0 1,12",
  "&": "7,1 5,0 2,2 1,5 2,8 5,10 8,12|8,8 6,6 3,6 1,8",
  "+": "4,3 4,11|1,7 8,7",
  "=": "1,5 8,5|1,9 8,9",
  "*": "4,0 4,9|1,2 7,8|7,2 1,8",
  _: "1,12 8,12",
  "[": "6,0 2,0 2,12 6,12",
  "]": "3,0 7,0 7,12 3,12",
  $: "5,0 5,12|8,3 6,1 3,1 1,3 1,5 3,6 6,6 8,8 8,10 6,12 3,12 1,10",
};

// Narrow and wide advance widths, in glyph units. Default is 9.
const WIDTHS = {
  " ": 5,
  i: 4,
  l: 4,
  j: 4,
  ".": 4,
  ",": 4,
  ":": 4,
  ";": 4,
  "!": 4,
  "'": 4,
  '"': 6,
  "(": 5,
  ")": 5,
  "-": 6,
  "/": 6,
  m: 11,
  w: 11,
  M: 11,
  W: 11,
  "%": 11,
  "&": 10,
  $: 8,
};

const glyphCache = new Map();
function glyphStrokes(ch) {
  if (glyphCache.has(ch)) return glyphCache.get(ch);
  const s = GLYPHS[ch];
  const out = [];
  if (s) {
    for (const seg of s.split("|")) {
      const pts = [];
      for (const tok of seg.split(" ")) {
        const p = tok.split(",");
        pts.push([Number(p[0]), Number(p[1])]);
      }
      out.push(pts);
    }
  }
  glyphCache.set(ch, out);
  return out;
}

function charAdvance(ch) {
  return WIDTHS[ch] === undefined ? 9 : WIDTHS[ch];
}

function textWidth(str, size, spacing) {
  const sp = spacing === undefined ? size * 0.16 : spacing;
  const scale = size / 12;
  let w = 0;
  for (let i = 0; i < str.length; i++) {
    w += charAdvance(str[i]) * scale;
    if (i < str.length - 1) w += sp;
  }
  return w;
}

// Draw text. size = cap height in px. y = baseline.
// opts: weight (stroke px), spacing, align, alpha.
function drawText(str, x, y, size, hex, opts) {
  const o = opts || {};
  const weight = o.weight === undefined ? size * 0.16 : o.weight;
  const spacing = o.spacing === undefined ? size * 0.16 : o.spacing;
  const align = o.align || "left";
  const alpha = o.alpha === undefined ? 1 : o.alpha;
  const scale = size / 12;
  let x0 = x;
  if (align === "center") x0 = x - textWidth(str, size, spacing) / 2;
  if (align === "right") x0 = x - textWidth(str, size, spacing);
  let cx = x0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const strokes = glyphStrokes(ch);
    for (const pts of strokes) {
      for (let k = 0; k + 1 < pts.length; k++) {
        const ax = cx + pts[k][0] * scale;
        const ay = y + (pts[k][1] - 12) * scale;
        const bx = cx + pts[k + 1][0] * scale;
        const by = y + (pts[k + 1][1] - 12) * scale;
        thickLine(ax, ay, bx, by, weight, hex, alpha);
      }
    }
    cx += charAdvance(ch) * scale + spacing;
  }
}

// ---------- palette ----------
const INK = "#191713";
const RED = "#b3271e";
const DARKRED = "#8c1d16";
const BLUE = "#1e4d7a";
const MIDBLUE = "#2f6da3";
const GREEN = "#2e6b34";
const GOLD = "#c9a227";
const WOOD = "#7a5230";
const WOODDARK = "#5f3d22";
const WOODLIGHT = "#96683f";

// ---------- frame and masthead ----------
// Outer double rule.
fillRect(16, 16, 992, 3, INK);
fillRect(16, 1005, 992, 3, INK);
fillRect(16, 16, 3, 992, INK);
fillRect(1005, 16, 3, 992, INK);

// Masthead.
drawText("THE WORLD", 512, 102, 82, INK, {
  align: "center",
  weight: 6.5,
  spacing: 18,
});
drawText("MONDAY, 23 NOVEMBER 2026", 512, 130, 25, INK, {
  align: "center",
  weight: 3.4,
  spacing: 4,
});
fillRect(24, 140, 976, 5, INK);
fillRect(24, 149, 976, 2, INK);

// ---------- lead ----------
// Kicker, headline, sublines.
drawText("COP31 - ANTALYA, TURKIYE", 24, 180, 21, RED, {
  weight: 3.6,
  spacing: 3,
});
drawText("COP31 ENDS WITH NO DEAL", 24, 232, 48, INK, {
  weight: 6.4,
  spacing: 4,
});
drawText("EU and 130 nations reject a text with no fossil fuels", 24, 262, 20, INK, {
  weight: 2.8,
  spacing: 2,
});
drawText("- first failed COP since 2009", 24, 286, 20, INK, {
  weight: 2.8,
  spacing: 2,
});

// Lead illustration: negotiation hall, y 296..566.
// Wall with soft vertical bands for depth.
fillRect(24, 296, 976, 270, "#dde3e8");
fillRect(24, 296, 195, 270, "#d3dae0", 0.55);
fillRect(414, 296, 195, 270, "#d3dae0", 0.55);
fillRect(804, 296, 196, 270, "#d3dae0", 0.55);
// Floor.
fillRect(24, 500, 976, 66, "#cbb894");
fillRect(24, 500, 976, 66, "#b39a72", 0.35);
// Floor shadow under the table.
fillRect(40, 556, 680, 10, "#8a7a5c", 0.5);

// Flags on the back wall (poles + cloth + shading).
function flag(x, y, w, h, kind) {
  thickLine(x + 3, y - 8, x + 3, y + h + 26, 2, "#6b5a44");
  if (kind === "eu") {
    fillRect(x, y, w, h, "#1e3a6e");
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2 - Math.PI / 2;
      fillCircle(x + w / 2 + Math.cos(ang) * 12, y + h / 2 + Math.sin(ang) * 9, 1.6, "#f2d54b");
    }
  } else if (kind === "tr") {
    fillRect(x, y, w, h, "#d21f26");
    fillCircle(x + w / 2 - 4, y + h / 2, 11, "#ffffff");
    fillCircle(x + w / 2 - 1, y + h / 2, 9, "#d21f26");
    star(x + w / 2 + 8, y + h / 2, 6, 2.5, "#ffffff");
  } else if (kind === "un") {
    fillRect(x, y, w, h, "#5b92c4");
    fillCircle(x + w / 2, y + h / 2, 10, "#ffffff");
    fillCircle(x + w / 2, y + h / 2, 6, "#5b92c4");
  } else {
    fillRect(x, y, w, h, "#2e6b34");
    fillCircle(x + w / 2, y + h / 2, 9, "#ffffff");
    fillCircle(x + w / 2, y + h / 2, 5, "#2e6b34");
  }
  fillRect(x, y + h - 5, w, 5, "#000000", 0.12);
}
flag(60, 306, 70, 40, "eu");
flag(160, 306, 70, 40, "tr");
flag(260, 306, 70, 40, "un");
flag(360, 306, 70, 40, "green");

// COP31 speech bubble, clear of every delegate head.
roundRect(486, 304, 216, 46, 10, "#ffffff");
poly(
  [
    [560, 350],
    [600, 350],
    [566, 384],
  ],
  "#ffffff"
);
thickLine(486, 304, 702, 304, 3, RED);
thickLine(486, 350, 702, 350, 3, RED);
thickLine(486, 304, 486, 350, 3, RED);
thickLine(702, 304, 702, 350, 3, RED);
drawText("COP31", 594, 338, 28, RED, {
  align: "center",
  weight: 4.4,
  spacing: 3,
});

// Turkiye map panel, right side.
fillRect(740, 296, 250, 174, "#cfe0ea");
thickLine(740, 296, 990, 296, 2, INK);
thickLine(740, 470, 990, 470, 2, INK);
thickLine(740, 296, 740, 470, 2, INK);
thickLine(990, 296, 990, 470, 2, INK);
drawText("TURKIYE", 865, 320, 18, INK, {
  align: "center",
  weight: 3,
  spacing: 3,
});
drawText("BLACK SEA", 865, 336, 11, BLUE, {
  align: "center",
  weight: 1.8,
  spacing: 1,
});
// Landmass, drawn with a soft drop shadow first.
const TURKIYE = [
  [752, 386],
  [760, 362],
  [776, 353],
  [796, 350],
  [820, 346],
  [850, 350],
  [880, 344],
  [910, 348],
  [940, 344],
  [964, 352],
  [978, 374],
  [962, 394],
  [946, 405],
  [920, 415],
  [896, 412],
  [872, 424],
  [848, 431],
  [830, 430],
  [812, 422],
  [788, 416],
  [770, 404],
  [758, 396],
];
const TURKIYE_SHADOW = TURKIYE.map((p) => [p[0] + 3, p[1] + 4]);
poly(TURKIYE_SHADOW, "#7d94a6", 0.45);
poly(TURKIYE, "#e8d9a8");
// Coast outline.
for (let i = 0; i < TURKIYE.length; i++) {
  const a = TURKIYE[i];
  const b = TURKIYE[(i + 1) % TURKIYE.length];
  thickLine(a[0], a[1], b[0], b[1], 1.8, "#8a6d2f");
}
drawText("MEDITERRANEAN", 865, 458, 11, BLUE, {
  align: "center",
  weight: 1.8,
  spacing: 1,
});
// Antalya star on the south coast.
star(838, 426, 8, 3.4, RED);
drawText("ANTALYA", 905, 444, 13, DARKRED, {
  align: "center",
  weight: 2.4,
  spacing: 1,
});

// Six delegates with real faces: skin, hair, eyes, suits.
function delegate(cx, skin, hair, suit, style) {
  const hy = 418;
  // Suit shoulders.
  poly(
    [
      [cx - 52, 508],
      [cx - 40, 452],
      [cx + 40, 452],
      [cx + 52, 508],
    ],
    suit
  );
  // Suit shading on one side.
  poly(
    [
      [cx + 18, 452],
      [cx + 40, 452],
      [cx + 52, 508],
      [cx + 26, 508],
    ],
    "#000000",
    0.18
  );
  // Shirt and tie.
  poly(
    [
      [cx - 12, 452],
      [cx + 12, 452],
      [cx, 478],
    ],
    "#f4f1e6"
  );
  poly(
    [
      [cx - 4, 456],
      [cx + 4, 456],
      [cx + 3, 484],
      [cx - 3, 484],
    ],
    RED
  );
  // Neck.
  fillRect(cx - 9, 436, 18, 18, skin);
  // Head.
  fillCircle(cx, hy, 25, skin);
  // Cheek shading.
  fillCircle(cx + 12, hy + 10, 10, "#000000", 0.08);
  // Hair by style.
  if (style === "side") {
    poly(
      [
        [cx - 25, 414],
        [cx - 25, 396],
        [cx - 8, 388],
        [cx + 12, 388],
        [cx + 24, 398],
        [cx + 25, 412],
        [cx + 14, 400],
        [cx - 6, 396],
        [cx - 18, 402],
      ],
      hair
    );
  } else if (style === "short") {
    poly(
      [
        [cx - 25, 412],
        [cx - 22, 394],
        [cx, 390],
        [cx + 22, 394],
        [cx + 25, 412],
        [cx + 12, 400],
        [cx - 12, 400],
      ],
      hair
    );
  } else if (style === "curly") {
    fillCircle(cx - 16, 398, 8, hair);
    fillCircle(cx - 4, 392, 9, hair);
    fillCircle(cx + 9, 394, 8, hair);
    fillCircle(cx + 19, 402, 7, hair);
  } else if (style === "bun") {
    poly(
      [
        [cx - 25, 412],
        [cx - 22, 394],
        [cx, 390],
        [cx + 22, 394],
        [cx + 25, 412],
        [cx + 12, 400],
        [cx - 12, 400],
      ],
      hair
    );
    fillCircle(cx, 388, 7, hair);
  } else if (style === "bald") {
    fillCircle(cx - 24, 412, 3.5, hair);
    fillCircle(cx + 24, 412, 3.5, hair);
  } else {
    // Long hair framing the face.
    poly(
      [
        [cx - 25, 414],
        [cx - 25, 396],
        [cx, 388],
        [cx + 25, 396],
        [cx + 25, 414],
        [cx + 22, 440],
        [cx + 16, 440],
        [cx + 16, 404],
        [cx - 16, 404],
        [cx - 16, 440],
        [cx - 22, 440],
      ],
      hair
    );
  }
  // Eyes.
  fillCircle(cx - 9, 416, 2.4, "#1a1a1a");
  fillCircle(cx + 9, 416, 2.4, "#1a1a1a");
  // Brows.
  thickLine(cx - 13, 408, cx - 5, 407, 1.8, hair);
  thickLine(cx + 5, 407, cx + 13, 408, 1.8, hair);
  // Nose and mouth.
  thickLine(cx, 418, cx - 1, 426, 1.6, "#8a6a4a");
  thickLine(cx - 6, 431, cx + 6, 431, 1.8, "#7a4a3a");
  // Glasses for one delegate.
  if (style === "glasses") {
    thickLine(cx - 15, 416, cx - 3, 416, 1.4, "#1a1a1a");
    thickLine(cx + 3, 416, cx + 15, 416, 1.4, "#1a1a1a");
    thickLine(cx - 3, 416, cx + 3, 416, 1.4, "#1a1a1a");
    fillCircle(cx - 9, 416, 5, skin);
    fillCircle(cx + 9, 416, 5, skin);
    fillCircle(cx - 9, 416, 2.2, "#1a1a1a");
    fillCircle(cx + 9, 416, 2.2, "#1a1a1a");
  }
}
delegate(95, "#f2c9a0", "#1c1c1c", "#232c3d", "side");
delegate(205, "#e0ac82", "#6b6b6b", "#3d2b23", "short");
delegate(315, "#c98d64", "#4a2f18", "#1e4d7a", "curly");
delegate(425, "#f7d7b5", "#d9b45b", "#4a4a4a", "bun");
delegate(535, "#8d5a3b", "#1c1c1c", "#5b2333", "bald");
delegate(645, "#d9a06f", "#3a3a3a", "#2e4a2e", "glasses");

// Long table with papers and the rejected draft.
fillRect(40, 500, 680, 12, WOODLIGHT);
fillRect(40, 512, 680, 48, WOOD);
fillRect(40, 512, 680, 48, "#3a2412", 0.25);
fillRect(40, 544, 680, 16, WOODDARK);
for (let i = 0; i < 9; i++) {
  fillRect(56 + i * 76, 514, 2, 44, "#000000", 0.12);
}
// Papers on the table.
fillRect(90, 488, 74, 14, "#ffffff");
fillRect(200, 490, 66, 12, "#ffffff");
fillRect(560, 488, 72, 14, "#ffffff");
// The rejected draft, crossed out in red.
fillRect(340, 482, 110, 22, "#ffffff");
thickLine(346, 486, 444, 500, 3, RED);
thickLine(444, 486, 346, 500, 3, RED);
thickLine(340, 482, 450, 482, 2, INK);
thickLine(340, 504, 450, 504, 2, INK);

// Divider under the lead.
fillRect(24, 576, 976, 3, INK);

// ---------- secondary stories ----------
// Column dividers.
fillRect(344, 590, 2, 206, INK, 0.35);
fillRect(676, 590, 2, 206, INK, 0.35);

// Column 1: Dymer.
drawText("DYMER, UKRAINE", 24, 606, 15, RED, { weight: 2.6, spacing: 2 });
drawText("11 KILLED IN", 24, 634, 26, INK, { weight: 3.6, spacing: 2 });
drawText("DYMER STRIKE", 24, 662, 26, INK, { weight: 3.6, spacing: 2 });
// Sky and ground.
fillRect(24, 670, 312, 86, "#dfe7ee");
fillRect(24, 742, 312, 14, "#b7a98c");
// Intact five-storey block, left.
fillRect(36, 690, 130, 66, "#d9c9a8");
fillRect(36, 690, 130, 66, "#8a7a5c", 0.18);
for (let f = 0; f < 5; f++) {
  for (let c = 0; c < 3; c++) {
    fillRect(48 + c * 40, 696 + f * 12, 22, 8, "#3a3f45");
  }
}
// Collapsed right half: layered broken slabs.
poly(
  [
    [166, 756],
    [176, 716],
    [210, 706],
    [236, 726],
    [228, 756],
  ],
  "#9a938a"
);
poly(
  [
    [210, 756],
    [228, 722],
    [262, 712],
    [292, 730],
    [284, 756],
  ],
  "#7d766e"
);
poly(
  [
    [252, 756],
    [272, 734],
    [306, 726],
    [326, 742],
    [320, 756],
  ],
  "#a8a094"
);
poly(
  [
    [176, 716],
    [210, 706],
    [226, 700],
    [196, 698],
  ],
  "#6b645c"
);
// Dust clouds.
fillCircle(196, 712, 12, "#e8e2d2", 0.85);
fillCircle(246, 722, 14, "#e8e2d2", 0.85);
fillCircle(292, 730, 10, "#e8e2d2", 0.85);
// Crane.
thickLine(312, 672, 312, 748, 4, "#c9a227");
thickLine(312, 676, 250, 676, 3, "#c9a227");
thickLine(268, 676, 268, 706, 2, "#5a4a2a");
fillRect(264, 706, 8, 8, "#5a4a2a");
// Two rescuers in orange helmets.
fillCircle(150, 736, 6, "#e0ac82");
fillCircle(150, 730, 6.5, "#e8722a");
fillRect(143, 742, 14, 14, "#2e6b34");
fillCircle(120, 740, 6, "#c98d64");
fillCircle(120, 734, 6.5, "#e8722a");
fillRect(113, 746, 14, 10, "#1e4d7a");
// Red cross flag.
thickLine(96, 690, 96, 664, 2, "#6b5a44");
fillRect(96, 664, 26, 16, "#ffffff");
thickLine(104, 668, 114, 668, 3, RED);
thickLine(109, 663, 109, 673, 3, RED);
drawText("Boy, 7, survives", 24, 778, 15, INK, { weight: 2.4, spacing: 1 });
drawText("14 hours in rubble", 24, 798, 15, INK, { weight: 2.4, spacing: 1 });

// Column 2: markets.
drawText("MARKETS", 356, 606, 15, RED, { weight: 2.6, spacing: 2 });
drawText("AI SELLOFF", 356, 634, 26, INK, { weight: 3.6, spacing: 2 });
drawText("NIKKEI -5.06%", 356, 664, 24, RED, { weight: 3.6, spacing: 2 });
drawText("S&P 500 -3.7%", 356, 692, 24, RED, { weight: 3.6, spacing: 2 });
drawText("KOSPI -5.21%", 356, 720, 24, RED, { weight: 3.6, spacing: 2 });
// Falling-lines chart.
fillRect(356, 730, 312, 66, "#fbf8ef");
thickLine(356, 730, 356, 796, 2, INK);
thickLine(356, 796, 668, 796, 2, INK);
for (let i = 1; i <= 3; i++) {
  thickLine(356, 730 + i * 16, 668, 730 + i * 16, 1, INK, 0.15);
}
// Shaded area under the Nikkei line.
poly(
  [
    [360, 738],
    [440, 748],
    [520, 768],
    [600, 786],
    [664, 792],
    [664, 796],
    [360, 796],
  ],
  RED,
  0.12
);
thickLine(360, 738, 440, 748, 3, RED);
thickLine(440, 748, 520, 768, 3, RED);
thickLine(520, 768, 600, 786, 3, RED);
thickLine(600, 786, 664, 792, 3, RED);
thickLine(360, 748, 440, 756, 2.4, BLUE);
thickLine(440, 756, 520, 770, 2.4, BLUE);
thickLine(520, 770, 600, 782, 2.4, BLUE);
thickLine(600, 782, 664, 788, 2.4, BLUE);
thickLine(360, 756, 440, 762, 2.4, GREEN);
thickLine(440, 762, 520, 774, 2.4, GREEN);
thickLine(520, 774, 600, 786, 2.4, GREEN);
thickLine(600, 786, 664, 790, 2.4, GREEN);
fillCircle(360, 738, 3.4, RED);
fillCircle(664, 792, 3.4, RED);
fillCircle(360, 748, 3, BLUE);
fillCircle(664, 788, 3, BLUE);
fillCircle(360, 756, 3, GREEN);
fillCircle(664, 790, 3, GREEN);

// Column 3: Benghazi.
drawText("BENGHAZI, LIBYA", 688, 606, 15, RED, { weight: 2.6, spacing: 2 });
drawText("WARSHIP SINKS", 688, 634, 26, INK, { weight: 3.6, spacing: 2 });
drawText("MERKURY", 688, 662, 20, INK, { weight: 3.2, spacing: 2 });
// Sky and sea.
fillRect(688, 670, 312, 30, "#dfe7ee");
fillRect(688, 700, 312, 56, MIDBLUE);
fillRect(688, 700, 312, 56, "#123a5c", 0.3);
fillRect(688, 724, 312, 8, "#ffffff", 0.25);
fillRect(688, 742, 312, 6, "#ffffff", 0.2);
// Sinking corvette, listing to starboard.
poly(
  [
    [700, 706],
    [880, 692],
    [912, 700],
    [896, 720],
    [722, 726],
  ],
  "#6b7280"
);
poly(
  [
    [700, 706],
    [880, 692],
    [912, 700],
    [900, 708],
    [712, 716],
  ],
  "#8a919c"
);
fillRect(700, 716, 200, 6, DARKRED);
poly(
  [
    [760, 700],
    [820, 695],
    [826, 682],
    [766, 686],
  ],
  "#4a5058"
);
fillRect(782, 668, 10, 20, "#4a5058");
thickLine(787, 668, 787, 652, 3, "#4a5058");
fillRect(836, 676, 16, 14, "#3a3f45");
fillRect(748, 688, 8, 12, "#3a3f45");
// Smoke plumes.
fillCircle(790, 656, 10, "#8a8a8a", 0.8);
fillCircle(800, 640, 13, "#9a9a9a", 0.7);
fillCircle(812, 622, 16, "#b0b0b0", 0.55);
fillCircle(840, 664, 8, "#8a8a8a", 0.8);
fillCircle(850, 650, 10, "#9a9a9a", 0.6);
// Sea drones with wakes.
function drone(x, y) {
  poly(
    [
      [x, y],
      [x + 22, y],
      [x + 18, y + 7],
      [x + 4, y + 7],
    ],
    "#222222"
  );
  thickLine(x - 14, y + 9, x + 2, y + 3, 2, "#ffffff", 0.8);
  thickLine(x - 10, y + 12, x + 6, y + 7, 2, "#ffffff", 0.6);
}
drone(716, 734);
drone(800, 742);
drone(884, 736);
drawText("7 sea drones strike", 688, 778, 15, INK, { weight: 2.4, spacing: 1 });
drawText("off Benghazi naval base", 688, 798, 15, INK, { weight: 2.4, spacing: 1 });

// ---------- briefs ----------
// Divider above the brief strip.
fillRect(24, 806, 976, 3, INK);
fillRect(24, 824, 14, 14, RED);
drawText("IN BRIEF", 46, 838, 20, RED, { weight: 3.4, spacing: 3 });

// Brief cells: two columns, two rows. Big type, thick strokes,
// wide spacing, so every word stays readable at 300 px.
function brief(x, y, head, sub) {
  drawText(head, x, y, 20, INK, { weight: 4, spacing: 1.5 });
  drawText(sub, x, y + 27, 17, "#3a352c", { weight: 3, spacing: 1.5 });
}
brief(24, 872, "Democrats win 258 seats", "Biggest majority since 1992");
brief(520, 872, "Korea exports pass $1T", "First time over $1 trillion");
brief(24, 934, "Manchester arena evacuated", "12,000 leave Don Toliver show");
brief(520, 934, "Marquez wins 8th title", "Philippines logs 8,320 deaths");

// ---------- footer ----------
fillRect(24, 972, 976, 2, INK);
drawText("THE WORLD - 23 NOVEMBER 2026 - All facts reported on the day", 512, 994, 14, "#3a352c", {
  align: "center",
  weight: 2.2,
  spacing: 1.5,
});

// ---------- PNG encode ----------
// CRC32 table.
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, "ascii");
  data.copy(out, 8);
  const crc = crc32(Buffer.concat([Buffer.from(type, "ascii"), data]));
  out.writeUInt32BE(crc, 8 + data.length);
  return out;
}

// Downsample 3x to 1024x1024 RGB.
const raw = Buffer.alloc(W * (1 + W * 3));
for (let y = 0; y < W; y++) {
  raw[y * (1 + W * 3)] = 0;
  for (let x = 0; x < W; x++) {
    let r = 0;
    let g = 0;
    let b = 0;
    for (let dy = 0; dy < SS; dy++) {
      for (let dx = 0; dx < SS; dx++) {
        const i = ((y * SS + dy) * SW + (x * SS + dx)) * 3;
        r += buf[i];
        g += buf[i + 1];
        b += buf[i + 2];
      }
    }
    const o = y * (1 + W * 3) + 1 + x * 3;
    raw[o] = Math.round(r / 9);
    raw[o + 1] = Math.round(g / 9);
    raw[o + 2] = Math.round(b / 9);
  }
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(W, 4);
ihdr[8] = 8;
ihdr[9] = 2;
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

// ---------- dossier ----------
const dossier = {
  title: "THE WORLD - Monday, 23 November 2026",
  edition: "news-image-20261123",
  version: "v3",
  facts: [
    {
      story: "COP31 ends with no deal in Antalya",
      detail: "EU and about 130 nations reject a text with no fossil fuels; first failed COP since 2009.",
      source: "Reuters, 23 Nov 2026",
    },
    {
      story: "Russian strike on Dymer, Ukraine",
      detail: "Five-storey apartment block 45 km north of Kyiv; 11 killed; a 7-year-old boy survives 14 hours in the rubble.",
      source: "Reuters, 23 Nov 2026",
    },
    {
      story: "AI stocks sell off",
      detail: "Nikkei -5.06%, S&P 500 -3.7%, KOSPI -5.21%.",
      source: "One Turn, Longbridge, PSG, 23 Nov 2026",
    },
    {
      story: "Russian corvette Merkury sinks off Benghazi, Libya",
      detail: "Hit at the naval base, reported struck by 7 Ukrainian sea drones; cargo ship MV ANGARA also hit.",
      source: "CNN, AP via Military.com, 23 Nov 2026",
    },
    {
      story: "US House: Democrats win 258 seats",
      detail: "Biggest majority since 1992.",
      source: "23 Nov 2026",
    },
    {
      story: "South Korea exports pass $1 trillion",
      detail: "First time in history.",
      source: "23 Nov 2026",
    },
    {
      story: "Co-op Live arena, Manchester, evacuated",
      detail: "Don Toliver concert; 12,000+ fans leave over an unknown substance.",
      source: "23 Nov 2026",
    },
    {
      story: "Marc Marquez wins 8th MotoGP title",
      detail: "Eighth world crown.",
      source: "23 Nov 2026",
    },
    {
      story: "Philippines truth body logs 8,320 drug-war deaths",
      detail: "Documented deaths, 2016-2022.",
      source: "23 Nov 2026",
    },
  ],
};

mkdirSync(OUT, { recursive: true });
writeFileSync(OUT + "/entry.png", png);
writeFileSync(OUT + "/dossier.json", JSON.stringify(dossier, null, 2) + "\n");
