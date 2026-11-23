// THE WORLD — MONDAY, 23 NOVEMBER 2026
// make.fun news-image-20261123 v1
// A program that draws one newspaper front page summing up the world's
// news of Monday 23 November 2026 and writes it to /output/entry.png
// (1024x1024 PNG) plus /output/dossier.json.
// Node 22 stdlib only. No network at run time. Fully deterministic:
// same bytes on every run.
//
// Facts (verified live 23 Nov 2026, sources in dossier.json):
//  LEAD  COP31 in Antalya ends with no deal — first COP to fail since 2009.
//  DYMER Russian strike on a 5-storey flat block; 11 killed; boy, 7, rescued alive.
//  MARKETS AI sell-off: Nikkei -5.06%, S&P 500 -3.7%.
//  BENGHAZI Russian corvette Merkury sunk by suspected Ukrainian sea drones.
//  BRIEFS US House 258 seats; Korea exports pass $1T; Manchester arena evacuated;
//         Marquez 8th MotoGP title; Manila truth commission counts 8,320 deaths.

import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

const W = 1024;
const H = 1024;

// ---------- palette ----------
const PAPER: RGB = [246, 241, 230];
const INK: RGB = [26, 23, 18];
const RED: RGB = [179, 39, 30];
const TEAL: RGB = [30, 110, 106];
const BLUE: RGB = [46, 94, 140];
const SKY: RGB = [220, 232, 228];
const GREEN: RGB = [74, 124, 58];
const GOLD: RGB = [185, 138, 31];
const GREY: RGB = [107, 101, 90];
const LIGHT: RGB = [201, 192, 172];
const CREAM: RGB = [240, 237, 228];
const DARKBLUE: RGB = [28, 62, 96];
const SMOKE: RGB = [150, 148, 140];

type RGB = [number, number, number];

// ---------- canvas ----------
const img = new Uint8Array(W * H * 3);
function px(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  img[i] = c[0]; img[i + 1] = c[1]; img[i + 2] = c[2];
}
function rect(x: number, y: number, w: number, h: number, c: RGB): void {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) px(i, j, c);
}
function hline(x: number, y: number, w: number, t: number, c: RGB): void {
  rect(x, y, w, t, c);
}
function vline(x: number, y: number, h: number, t: number, c: RGB): void {
  rect(x, y, t, h, c);
}
function frame(x: number, y: number, w: number, h: number, t: number, c: RGB): void {
  hline(x, y, w, t, c); hline(x, y + h - t, w, t, c);
  vline(x, y, h, t, c); vline(x + w - t, y, h, t, c);
}
function line(x0: number, y0: number, x1: number, y1: number, t: number, c: RGB): void {
  const dx = x1 - x0, dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  const half = Math.floor(t / 2);
  for (let s = 0; s <= steps; s++) {
    const x = Math.round(x0 + (dx * s) / steps);
    const y = Math.round(y0 + (dy * s) / steps);
    rect(x - half, y - half, t, t, c);
  }
}
function disc(cx: number, cy: number, r: number, c: RGB): void {
  for (let y = -r; y <= r; y++) {
    const half = Math.floor(Math.sqrt(r * r - y * y));
    for (let x = -half; x <= half; x++) px(cx + x, cy + y, c);
  }
}
function ring(cx: number, cy: number, r: number, t: number, c: RGB): void {
  for (let a = 0; a < 360; a++) {
    const rad = (a * Math.PI) / 180;
    for (let k = 0; k < t; k++) {
      px(Math.round(cx + (r + k) * Math.cos(rad)), Math.round(cy + (r + k) * Math.sin(rad)), c);
    }
  }
}
function ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
  for (let y = -ry; y <= ry; y++) {
    const half = Math.floor((rx * Math.sqrt(ry * ry - y * y)) / ry);
    for (let x = -half; x <= half; x++) px(cx + x, cy + y, c);
  }
}
// filled triangle
function tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: RGB): void {
  const minX = Math.min(x0, x1, x2), maxX = Math.max(x0, x1, x2);
  const minY = Math.min(y0, y1, y2), maxY = Math.max(y0, y1, y2);
  const d = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const a = ((x1 - x) * (y2 - y) - (y1 - y) * (x2 - x)) / d;
      const b = ((x2 - x) * (y0 - y) - (y2 - y) * (x0 - x)) / d;
      const g = 1 - a - b;
      if (a >= 0 && b >= 0 && g >= 0) px(x, y, c);
    }
  }
}

// ---------- 5x7 bitmap font (uppercase, digits, punctuation) ----------
// Each glyph: 7 rows, bit 4 = leftmost pixel.
const FONT: Record<string, number[]> = {
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  "0": [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  "1": [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  "2": [0x0e, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1f],
  "3": [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
  "4": [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  "5": [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  "6": [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  "7": [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  "8": [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  "9": [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  " ": [0, 0, 0, 0, 0, 0, 0],
  ".": [0, 0, 0, 0, 0, 0x0c, 0x0c],
  ",": [0, 0, 0, 0, 0x0c, 0x04, 0x08],
  ":": [0, 0x0c, 0x0c, 0, 0x0c, 0x0c, 0],
  ";": [0, 0x0c, 0x0c, 0, 0x0c, 0x04, 0x08],
  "'": [0x04, 0x04, 0x08, 0, 0, 0, 0],
  "-": [0, 0, 0, 0x0e, 0, 0, 0],
  "—": [0, 0, 0, 0x1f, 0, 0, 0],
  "(": [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
  ")": [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
  "/": [0x01, 0x01, 0x02, 0x04, 0x08, 0x10, 0x10],
  "%": [0x19, 0x19, 0x02, 0x04, 0x08, 0x13, 0x13],
  "+": [0, 0x04, 0x04, 0x0e, 0x04, 0x04, 0],
  "&": [0x0c, 0x12, 0x14, 0x08, 0x15, 0x12, 0x0d],
  "!": [0x04, 0x04, 0x04, 0x04, 0x04, 0, 0x04],
  "?": [0x0e, 0x11, 0x01, 0x02, 0x04, 0, 0x04],
  "•": [0, 0x04, 0x0e, 0x0e, 0x0e, 0x04, 0],
};

function textWidth(s: string, scale: number): number {
  if (s.length === 0) return 0;
  return s.length * 6 * scale - scale;
}
function drawText(s: string, x: number, y: number, scale: number, c: RGB): void {
  let cx = x;
  for (const raw of s) {
    const ch = raw.toUpperCase();
    const g = FONT[ch] ?? FONT["?"];
    for (let row = 0; row < 7; row++) {
      const bits = g[row];
      for (let col = 0; col < 5; col++) {
        if (bits & (1 << (4 - col))) {
          rect(cx + col * scale, y + row * scale, scale, scale, c);
        }
      }
    }
    cx += 6 * scale;
  }
}
function drawTextCentered(s: string, cx: number, y: number, scale: number, c: RGB): void {
  drawText(s, cx - Math.floor(textWidth(s, scale) / 2), y, scale, c);
}
function wrapText(s: string, scale: number, maxW: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur === "" ? w : cur + " " + w;
    if (textWidth(test, scale) <= maxW) {
      cur = test;
    } else {
      if (cur !== "") lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

// ---------- PNG encoder (stdlib zlib) ----------
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function encodePNG(): Buffer {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter: none
    raw.set(img.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- draw the front page ----------
rect(0, 0, W, H, PAPER);
frame(14, 14, 996, 996, 3, INK);

// Masthead
drawTextCentered("THE WORLD", 512, 40, 13, INK);
hline(36, 140, 952, 3, INK);
drawTextCentered("MONDAY, 23 NOVEMBER 2026", 512, 152, 4, INK);
drawTextCentered("THE DAY'S WORLD NEWS — IN ONE IMAGE", 512, 188, 2, GREY);
hline(36, 212, 952, 2, INK);

// ---- LEAD: COP31, Antalya ----
// Illustration panel (left)
frame(36, 228, 564, 372, 2, INK);
rect(38, 230, 560, 368, SKY);
// sun
disc(520, 290, 34, GOLD);
ring(520, 290, 40, 3, GOLD);
// globe
const GX = 318, GY = 408, GR = 126;
disc(GX, GY, GR, BLUE);
ellipse(GX - 52, GY - 42, 46, 26, GREEN);
ellipse(GX + 48, GY - 58, 40, 22, GREEN);
ellipse(GX + 62, GY + 38, 44, 24, GREEN);
ellipse(GX - 58, GY + 52, 38, 20, GREEN);
ellipse(GX + 6, GY + 78, 52, 20, GREEN);
// latitude arcs
for (const [dy, hw] of [[-70, 88], [-30, 116], [30, 116], [70, 88]] as const) {
  hline(GX - hw, GY + dy, hw * 2, 3, [210, 226, 232]);
}
// red slash: no deal
line(GX - 118, GY - 96, GX + 118, GY + 96, 12, RED);
ring(GX, GY, GR + 5, 4, RED);
// caption
drawTextCentered("ANTALYA, TURKEY — COP31", 318, 566, 2, INK);

// Headline + deck (right column)
drawText("CLIMATE", 624, 228, 3, RED);
drawText("TALKS END", 624, 258, 6, INK);
drawText("WITH NO", 624, 300, 6, INK);
drawText("DEAL", 624, 342, 6, INK);
hline(624, 398, 364, 2, INK);
const deck = wrapText(
  "COP31 in Antalya ends with no deal — the first failed COP since 2009. The EU and about 130 nations reject a text with no fossil fuels.",
  3,
  364,
);
deck.forEach((ln, i) => drawText(ln, 624, 412 + i * 25, 3, INK));

// ---- SECONDARY ROW ----
hline(36, 616, 952, 2, INK);
const COLS = [
  {
    x: 36,
    kicker: "UKRAINE • DYMER",
    head: ["FLAT BLOCK", "HIT, 11 DEAD"],
    fact: "Boy, 7, alive after 14 hours.",
    draw: (x: number, y: number, w: number, h: number) => {
      rect(x, y, w, h, CREAM);
      // apartment block, left part standing, right part collapsed
      rect(x + 24, y + 12, 96, 62, INK);
      for (let r = 0; r < 4; r++)
        for (let c = 0; c < 5; c++)
          rect(x + 32 + c * 18, y + 20 + r * 14, 10, 8, GOLD);
      // broken edge
      tri(x + 120, y + 12, x + 150, y + 34, x + 120, y + 56, INK);
      // rubble
      tri(x + 128, y + 74, x + 170, y + 74, x + 150, y + 46, GREY);
      tri(x + 176, y + 74, x + 214, y + 74, x + 196, y + 52, SMOKE);
      tri(x + 220, y + 74, x + 252, y + 74, x + 236, y + 58, GREY);
      // dust
      disc(x + 160, y + 40, 12, SMOKE);
      disc(x + 182, y + 30, 9, SMOKE);
    },
  },
  {
    x: 360,
    kicker: "MARKETS",
    head: ["AI SELL-OFF", "SINKS STOCKS"],
    fact: "Nikkei -5.06%; S&P 500 -3.7%.",
    draw: (x: number, y: number, w: number, h: number) => {
      rect(x, y, w, h, CREAM);
      // descending bars
      const bars = [62, 54, 44, 34, 22];
      bars.forEach((bh, i) => rect(x + 30 + i * 52, y + 78 - bh, 34, bh, RED));
      // down arrow
      line(x + 34, y + 12, x + 268, y + 62, 5, INK);
      tri(x + 268, y + 62, x + 244, y + 56, x + 258, y + 76, INK);
    },
  },
  {
    x: 684,
    kicker: "LIBYA • BENGHAZI",
    head: ["RUSSIAN SHIP", "SUNK AT SEA"],
    fact: "Kyiv: sea drones sank the ship.",
    draw: (x: number, y: number, w: number, h: number) => {
      rect(x, y, w, h, SKY);
      // sea
      rect(x, y + 52, w, h - 52, BLUE);
      hline(x, y + 52, w, 3, [210, 226, 232]);
      hline(x, y + 66, w, 2, [210, 226, 232]);
      // capsized hull, bow up
      tri(x + 60, y + 58, x + 200, y + 58, x + 150, y + 84, INK);
      rect(x + 190, y + 40, 34, 20, INK);
      // smoke
      disc(x + 120, y + 30, 12, SMOKE);
      disc(x + 142, y + 20, 9, SMOKE);
      disc(x + 100, y + 20, 8, SMOKE);
      // drone above
      rect(x + 240, y + 12, 18, 6, INK);
      hline(x + 232, y + 10, 34, 2, INK);
    },
  },
];
for (const col of COLS) {
  drawText(col.kicker, col.x, 632, 2, RED);
  frame(col.x, 652, 304, 90, 2, INK);
  col.draw(col.x + 2, 654, 300, 86);
  col.head.forEach((ln, i) => drawText(ln, col.x, 754 + i * 32, 4, INK));
  wrapText(col.fact, 3, 304).forEach((ln, i) => drawText(ln, col.x, 824 + i * 24, 3, INK));
}

// ---- FOOTER: IN BRIEF ----
hline(36, 888, 952, 2, INK);
drawText("IN BRIEF", 36, 900, 3, RED);
const briefs = [
  "US: Democrats win 258 House seats — biggest majority since 1992.",
  "SOUTH KOREA: Exports pass $1 trillion for the first time.",
  "MANCHESTER: Arena evacuated at Don Toliver show; 50+ treated.",
  "SPORT: Marquez wins an eighth MotoGP world title.",
  "MANILA: Truth commission counts 8,320 drug-war deaths.",
];
briefs.forEach((b, i) => drawText("• " + b, 36, 930 + i * 16, 2, INK));

// ---------- write outputs ----------
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
fs.mkdirSync(outDir, { recursive: true });
const png = encodePNG();
fs.writeFileSync(path.join(outDir, "entry.png"), png);

const dossier = {
  title: "THE WORLD — MONDAY, 23 NOVEMBER 2026",
  competition: "news-image-20261123",
  date: "2026-11-23",
  image: { width: 1024, height: 1024, bytes: png.length },
  lead: {
    headline: "CLIMATE TALKS END WITH NO DEAL",
    fact: "COP31 in Antalya ends with no agreement — the first COP to fail since 2009. The EU and about 130 nations reject a text that omits fossil fuels.",
    source: "Reuters, 23 Nov 2026 — COP31 collapse coverage (Antalya).",
  },
  secondary: [
    {
      headline: "FLAT BLOCK HIT, 11 DEAD",
      fact: "Russian strike on a five-storey apartment block in Dymer, 45 km north of Kyiv; 11 killed. A seven-year-old boy was pulled alive from the rubble after 14 hours.",
      source: "Reuters, 23 Nov 2026 — Dymer toll rises to 11 (Gov. Tymur Tkachenko).",
    },
    {
      headline: "AI SELL-OFF SINKS STOCKS",
      fact: "Japan's Nikkei falls 5.06% and the S&P 500 falls 3.7% as an AI stock sell-off spreads.",
      source: "One Turn / market reports, 23 Nov 2026 — Nikkei -5.06%, S&P 500 -3.70%.",
    },
    {
      headline: "RUSSIAN SHIP SUNK AT SEA",
      fact: "Russian corvette Merkury sinks at Benghazi naval base after a suspected Ukrainian sea-drone attack; Kyiv says seven maritime drones were used.",
      source: "CNN / AP, 23 Nov 2026 — Merkury sunk at Benghazi; Zelenskyy confirms.",
    },
  ],
  briefs: [
    { text: "US: Democrats win 258 House seats — biggest majority since 1992.", source: "AP / Reuters, 22-23 Nov 2026 — Chuck Hubbard beats Virginia Foxx in North Carolina." },
    { text: "SOUTH KOREA: Exports pass $1 trillion for the first time.", source: "Korea Customs Service, 23 Nov 2026 — cumulative exports $1.0076T through 20 Nov." },
    { text: "MANCHESTER: Arena evacuated at Don Toliver show; 50+ treated.", source: "CNN, 23 Nov 2026 — Co-op Live arena, unknown substance, 12,000 evacuated." },
    { text: "SPORT: Marquez wins an eighth MotoGP world title.", source: "One Turn daily brief, 23 Nov 2026 — Marc Marquez, eighth MotoGP title." },
    { text: "MANILA: Truth commission counts 8,320 drug-war deaths.", source: "Morning Coffee Thoughts / Philippine Truth Commission report, 23 Nov 2026." },
  ],
  notes: "All facts are events of 23 Nov 2026 or first reported that day. No numbers, quotes or casualty figures invented. Drawn procedurally with Node 22 stdlib only; no network at run time; deterministic output.",
};
fs.writeFileSync(path.join(outDir, "dossier.json"), JSON.stringify(dossier, null, 2) + "\n");

console.log(`wrote ${path.join(outDir, "entry.png")} (${png.length} bytes)`);
console.log(`wrote ${path.join(outDir, "dossier.json")}`);
