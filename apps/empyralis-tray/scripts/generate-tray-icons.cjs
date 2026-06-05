const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const ICON_DIR = path.join(ROOT, 'src-tauri', 'icons');
const FRAME_DIR = path.join(ICON_DIR, 'frames');
const SIZE = 32;
const SCALE = 5;
const W = SIZE * SCALE;
const H = SIZE * SCALE;
const ACTIVE_FRAMES = 16;
const CONNECTING_FRAMES = 4;
fs.mkdirSync(FRAME_DIR, { recursive: true });

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[n] = c >>> 0;
}
function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = crcTable[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}
function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, row + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
function color(r, g, b, a) { return { r, g, b, a }; }
function blend(buffer, x, y, c) {
  if (x < 0 || y < 0 || x >= W || y >= H || c.a <= 0) return;
  const index = (y * W + x) * 4;
  const srcA = c.a / 255;
  const dstA = buffer[index + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 0) return;
  buffer[index] = Math.round((c.r * srcA + buffer[index] * dstA * (1 - srcA)) / outA);
  buffer[index + 1] = Math.round((c.g * srcA + buffer[index + 1] * dstA * (1 - srcA)) / outA);
  buffer[index + 2] = Math.round((c.b * srcA + buffer[index + 2] * dstA * (1 - srcA)) / outA);
  buffer[index + 3] = Math.round(outA * 255);
}
function pointSegmentDistance(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const denom = abx * abx + aby * aby;
  const t = denom === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / denom));
  const x = ax + abx * t;
  const y = ay + aby * t;
  return Math.hypot(px - x, py - y);
}
function drawSegment(buffer, ax, ay, bx, by, width, c) {
  const pad = width + 1.2;
  const startX = Math.floor((Math.min(ax, bx) - pad) * SCALE);
  const endX = Math.ceil((Math.max(ax, bx) + pad) * SCALE);
  const startY = Math.floor((Math.min(ay, by) - pad) * SCALE);
  const endY = Math.ceil((Math.max(ay, by) + pad) * SCALE);
  const half = width / 2;
  for (let py = startY; py <= endY; py += 1) {
    for (let px = startX; px <= endX; px += 1) {
      const d = pointSegmentDistance(px / SCALE, py / SCALE, ax, ay, bx, by);
      const alpha = Math.max(0, Math.min(1, half - d + 0.7));
      if (alpha > 0) blend(buffer, px, py, { ...c, a: Math.round(c.a * alpha) });
    }
  }
}
function downsample(high) {
  const low = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let yy = 0; yy < SCALE; yy += 1) {
        for (let xx = 0; xx < SCALE; xx += 1) {
          const index = ((y * SCALE + yy) * W + x * SCALE + xx) * 4;
          r += high[index]; g += high[index + 1]; b += high[index + 2]; a += high[index + 3];
        }
      }
      const out = (y * SIZE + x) * 4;
      const divisor = SCALE * SCALE;
      low[out] = Math.round(r / divisor);
      low[out + 1] = Math.round(g / divisor);
      low[out + 2] = Math.round(b / divisor);
      low[out + 3] = Math.round(a / divisor);
    }
  }
  return low;
}
function frameBuffer() { return new Uint8Array(W * H * 4); }

const ink = color(255, 255, 255, 230);
const inkConnected = color(255, 255, 255, 246);
const inkDim = color(255, 255, 255, 120);
const inkSoft = color(255, 255, 255, 172);
const inkHot = color(255, 255, 255, 255);
const mark = {
  outer: [
    [16, 3.9, 26.7, 10.1],
    [26.7, 10.1, 26.7, 22.2],
    [26.7, 22.2, 16, 28.1],
    [16, 28.1, 5.3, 22.2],
    [5.3, 22.2, 5.3, 10.1],
    [5.3, 10.1, 16, 3.9],
  ],
  stack: [
    [16, 8.8, 22.1, 12.35],
    [22.1, 12.35, 16, 15.9],
    [16, 15.9, 9.9, 12.35],
    [9.9, 12.35, 16, 8.8],
    [10.1, 16.15, 16, 19.55],
    [16, 19.55, 22.0, 16.15],
    [22.0, 16.15, 22.0, 20.45],
    [22.0, 20.45, 16, 24.0],
    [16, 24.0, 10.0, 20.45],
    [10.0, 20.45, 10.0, 16.15],
  ],
};
const allSegments = [...mark.outer, ...mark.stack];

function drawMark(buffer, baseColor, widths = { outer: 2.35, stack: 2.55 }) {
  mark.outer.forEach(([ax, ay, bx, by]) => drawSegment(buffer, ax, ay, bx, by, widths.outer, baseColor));
  mark.stack.forEach(([ax, ay, bx, by]) => drawSegment(buffer, ax, ay, bx, by, widths.stack, baseColor));
}
function drawActiveSweep(buffer, frame) {
  const progress = frame / ACTIVE_FRAMES;
  const total = allSegments.length;
  const head = progress * total;
  allSegments.forEach(([ax, ay, bx, by], index) => {
    const raw = Math.abs(index - head);
    const wrap = Math.min(raw, total - raw);
    if (wrap < 2.2) {
      const alpha = Math.round(105 * (1 - wrap / 2.2));
      drawSegment(buffer, ax, ay, bx, by, index < mark.outer.length ? 3.3 : 3.5, color(255, 255, 255, alpha));
    }
    if (wrap < 0.78) {
      drawSegment(buffer, ax, ay, bx, by, index < mark.outer.length ? 2.7 : 2.9, inkHot);
    }
  });
}
function renderIdle() {
  const buffer = frameBuffer();
  drawMark(buffer, ink, { outer: 2.25, stack: 2.45 });
  return encodePng(SIZE, SIZE, downsample(buffer));
}
function renderConnected() {
  const buffer = frameBuffer();
  drawMark(buffer, inkConnected, { outer: 2.35, stack: 2.55 });
  return encodePng(SIZE, SIZE, downsample(buffer));
}
function renderError() {
  const buffer = frameBuffer();
  drawMark(buffer, inkSoft, { outer: 2.25, stack: 2.45 });
  drawSegment(buffer, 10.6, 22.8, 21.4, 22.8, 2.75, inkHot);
  return encodePng(SIZE, SIZE, downsample(buffer));
}
function renderActive(frame) {
  const buffer = frameBuffer();
  drawMark(buffer, inkDim, { outer: 2.15, stack: 2.35 });
  drawActiveSweep(buffer, frame);
  return encodePng(SIZE, SIZE, downsample(buffer));
}
function renderConnecting(frame) {
  const buffer = frameBuffer();
  const wave = 0.5 + 0.5 * Math.sin((frame / CONNECTING_FRAMES) * Math.PI * 2 - Math.PI / 2);
  drawMark(buffer, color(255, 255, 255, 134 + Math.round(wave * 88)), { outer: 2.25, stack: 2.45 });
  return encodePng(SIZE, SIZE, downsample(buffer));
}
function writeBoth(name, png) {
  fs.writeFileSync(path.join(FRAME_DIR, name), png);
  fs.writeFileSync(path.join(ICON_DIR, name), png);
}
writeBoth('tray-idle.png', renderIdle());
writeBoth('tray-connected.png', renderConnected());
writeBoth('tray-error.png', renderError());
for (let i = 0; i < ACTIVE_FRAMES; i += 1) writeBoth(`tray-active-${i + 1}.png`, renderActive(i));
for (let i = 0; i < CONNECTING_FRAMES; i += 1) writeBoth(`tray-connecting-${i + 1}.png`, renderConnecting(i));
