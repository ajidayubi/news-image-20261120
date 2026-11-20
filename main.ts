import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';

// CRC32 implementation
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[i] = c;
}

function calcCrc(buf: Uint8Array): number {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  }
  return c ^ 0xFFFFFFFF;
}

function writeUint32BE(val: number): Uint8Array {
  const b = new Uint8Array(4);
  b[0] = (val >>> 24) & 0xFF;
  b[1] = (val >>> 16) & 0xFF;
  b[2] = (val >>> 8) & 0xFF;
  b[3] = val & 0xFF;
  return b;
}

function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const lenBytes = writeUint32BE(data.length);
  
  const crcBuf = new Uint8Array(typeBytes.length + data.length);
  crcBuf.set(typeBytes, 0);
  crcBuf.set(data, typeBytes.length);
  const crcVal = calcCrc(crcBuf);
  const crcBytes = writeUint32BE(crcVal);

  const chunk = new Uint8Array(4 + 4 + data.length + 4);
  chunk.set(lenBytes, 0);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  chunk.set(crcBytes, 8 + data.length);
  return chunk;
}

// 5x7 Font definition
const FONT: Record<string, number[]> = {
  ' ': [0,0,0,0,0,0,0],
  'A': [0x0E, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11],
  'B': [0x1E, 0x11, 0x11, 0x1E, 0x11, 0x11, 0x1E],
  'C': [0x0E, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0E],
  'D': [0x1E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1E],
  'E': [0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x1F],
  'F': [0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x10],
  'G': [0x0E, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0E],
  'H': [0x11, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11],
  'I': [0x0E, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0E],
  'J': [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0C],
  'K': [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  'L': [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1F],
  'M': [0x11, 0x1B, 0x15, 0x15, 0x11, 0x11, 0x11],
  'N': [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  'O': [0x0E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E],
  'P': [0x1E, 0x11, 0x11, 0x1E, 0x10, 0x10, 0x10],
  'Q': [0x0E, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0D],
  'R': [0x1E, 0x11, 0x11, 0x1E, 0x14, 0x12, 0x11],
  'S': [0x0F, 0x10, 0x10, 0x0E, 0x01, 0x01, 0x1E],
  'T': [0x1F, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  'U': [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E],
  'V': [0x11, 0x11, 0x11, 0x11, 0x11, 0x0A, 0x04],
  'W': [0x11, 0x11, 0x11, 0x15, 0x15, 0x1B, 0x11],
  'X': [0x11, 0x11, 0x0A, 0x04, 0x0A, 0x11, 0x11],
  'Y': [0x11, 0x11, 0x0A, 0x04, 0x04, 0x04, 0x04],
  'Z': [0x1F, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1F],
  '0': [0x0E, 0x13, 0x15, 0x19, 0x11, 0x11, 0x0E],
  '1': [0x04, 0x0C, 0x04, 0x04, 0x04, 0x04, 0x0E],
  '2': [0x0E, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1F],
  '3': [0x1F, 0x01, 0x02, 0x0E, 0x01, 0x01, 0x1E],
  '4': [0x02, 0x06, 0x0A, 0x12, 0x1F, 0x02, 0x02],
  '5': [0x1F, 0x10, 0x10, 0x1E, 0x01, 0x01, 0x1E],
  '6': [0x0E, 0x10, 0x10, 0x1E, 0x11, 0x11, 0x0E],
  '7': [0x1F, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  '8': [0x0E, 0x11, 0x11, 0x0E, 0x11, 0x11, 0x0E],
  '9': [0x0E, 0x11, 0x11, 0x0F, 0x01, 0x01, 0x0E],
  ',': [0x00, 0x00, 0x00, 0x00, 0x04, 0x04, 0x08],
  '.': [0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x04],
  ':': [0x00, 0x04, 0x00, 0x00, 0x00, 0x04, 0x00],
  ';': [0x00, 0x04, 0x00, 0x00, 0x00, 0x04, 0x08],
  '\'': [0x04, 0x04, 0x02, 0x00, 0x00, 0x00, 0x00],
  '-': [0x00, 0x00, 0x00, 0x1F, 0x00, 0x00, 0x00],
  '&': [0x0C, 0x12, 0x14, 0x08, 0x15, 0x12, 0x0D],
  '!': [0x04, 0x04, 0x04, 0x04, 0x04, 0x00, 0x04],
  '?': [0x0E, 0x11, 0x01, 0x02, 0x04, 0x00, 0x04],
  '/': [0x01, 0x02, 0x02, 0x04, 0x08, 0x08, 0x10],
  '(': [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
  ')': [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
  '%': [0x18, 0x19, 0x02, 0x04, 0x08, 0x13, 0x03],
  '$': [0x04, 0x0E, 0x15, 0x0E, 0x15, 0x0E, 0x04],
  '"': [0x0A, 0x0A, 0x04, 0x00, 0x00, 0x00, 0x00],
  '_': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1F],
};

const WIDTH = 1024;
const HEIGHT = 1024;
const buffer = new Uint8Array(WIDTH * HEIGHT * 3);

// Fill background: warm paper off-white (247, 243, 232)
const BG_R = 247, BG_G = 243, BG_B = 232;
for (let i = 0; i < WIDTH * HEIGHT; i++) {
  buffer[i * 3] = BG_R;
  buffer[i * 3 + 1] = BG_G;
  buffer[i * 3 + 2] = BG_B;
}

function setPixel(x: number, y: number, r: number, g: number, b: number) {
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
  const idx = (y * WIDTH + x) * 3;
  buffer[idx] = r;
  buffer[idx + 1] = g;
  buffer[idx + 2] = b;
}

function fillRect(x: number, y: number, w: number, h: number, color: [number, number, number]) {
  const x0 = Math.max(0, Math.min(WIDTH, x));
  const x1 = Math.max(0, Math.min(WIDTH, x + w));
  const y0 = Math.max(0, Math.min(HEIGHT, y));
  const y1 = Math.max(0, Math.min(HEIGHT, y + h));
  for (let yy = y0; yy < y1; yy++) {
    const rowBase = yy * WIDTH * 3;
    for (let xx = x0; xx < x1; xx++) {
      const idx = rowBase + xx * 3;
      buffer[idx] = color[0];
      buffer[idx + 1] = color[1];
      buffer[idx + 2] = color[2];
    }
  }
}

function fillCircle(cx: number, cy: number, radius: number, color: [number, number, number]) {
  for (let y = -radius; y <= radius; y++) {
    for (let x = -radius; x <= radius; x++) {
      if (x * x + y * y <= radius * radius) {
        setPixel(cx + x, cy + y, color[0], color[1], color[2]);
      }
    }
  }
}

function hline(x: number, y: number, w: number, color: [number, number, number], thickness: number = 1) {
  fillRect(x, y, w, thickness, color);
}

function vline(x: number, y: number, h: number, color: [number, number, number], thickness: number = 1) {
  fillRect(x, y, thickness, h, color);
}

function frame(x: number, y: number, w: number, h: number, color: [number, number, number], thickness: number = 1) {
  hline(x, y, w, color, thickness);
  hline(x, y + h - thickness, w, color, thickness);
  vline(x, y, h, color, thickness);
  vline(x + w - thickness, y, h, color, thickness);
}

// 1. Fall back to uppercase or '?'
function drawChar(x: number, y: number, char: string, scale: number, color: [number, number, number]) {
  const glyph = FONT[char] || FONT[char.toUpperCase()] || FONT['?'];
  for (let row = 0; row < 7; row++) {
    const bits = glyph[row];
    for (let col = 0; col < 5; col++) {
      if ((bits & (1 << (4 - col))) !== 0) {
        fillRect(x + col * scale, y + row * scale, scale, scale, color);
      }
    }
  }
}

function drawText(x: number, y: number, text: string, scale: number, color: [number, number, number], maxWidth: number): number {
  const charWidth = 6 * scale;
  const lineHeight = 9 * scale;
  let cx = x;
  let cy = y;

  const words = text.split(' ');
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const wordLen = word.length * charWidth;
    if (cx + wordLen > x + maxWidth && cx > x) {
      cx = x;
      cy += lineHeight;
    }
    for (let j = 0; j < word.length; j++) {
      drawChar(cx, cy, word[j], scale, color);
      cx += charWidth;
    }
    if (i < words.length - 1) {
      cx += charWidth;
      if (cx + charWidth > x + maxWidth && cx > x) {
        cx = x;
        cy += lineHeight;
      }
    }
  }
  return (cy + lineHeight) - y;
}

const BLACK: [number, number, number] = [20, 20, 20];
const GREY: [number, number, number] = [120, 115, 110];
const RED: [number, number, number] = [185, 28, 28];
const WHITE: [number, number, number] = [255, 255, 255];

// Masthead top rule and red bottom rule
hline(40, 8, 944, BLACK, 4);
drawText(107, 20, "THE WORLD TODAY", 9, BLACK, 900);
hline(40, 102, 944, RED, 3);

drawText(40, 114, "FRIDAY, 20 NOVEMBER 2026", 2, BLACK, 500);
drawText(750, 114, "ONE IMAGE, ONE DAY", 2, BLACK, 300);

hline(40, 134, 944, BLACK, 1);

// Main headline & summary
const mainHLineH = drawText(40, 146, "TRUMP, XI AND PUTIN SIGN PEACE DECLARATION", 6, BLACK, 944);
const mainSumY = 146 + mainHLineH + 6;
const mainSumH = drawText(40, mainSumY, "Three leaders end the summit with a joint pledge after days of talks at APEC - the first meeting of its kind.", 2, BLACK, 944);

// 3. 3. Standfirst and caption spacing, photo panel height ~175
const photoY = mainSumY + mainSumH + 10;
const photoH = 175;
const photoW = 944;
frame(40, photoY, photoW, photoH, BLACK, 1);

// Draw three vertical flag bands inside photo panel
const bandW = Math.floor(photoW / 3);
// Band 1 (Left): USA/Liberia style or similar stripes/canton (Red & White stripes, Blue canton top-left)
for (let bx = 0; bx < bandW; bx++) {
  for (let by = 0; by < photoH; by++) {
    const isRed = Math.floor(by / 10) % 2 === 0;
    const col = isRed ? RED : WHITE;
    setPixel(40 + bx, photoY + by, col[0], col[1], col[2]);
  }
}
// Blue canton
for (let bx = 0; bx < Math.floor(bandW * 0.5); bx++) {
  for (let by = 0; by < Math.floor(photoH * 0.5); by++) {
    setPixel(40 + bx, photoY + by, [20, 40, 120][0], [20, 40, 120][1], [20, 40, 120][2]);
    if (bx % 12 === 6 && by % 12 === 6) {
      setPixel(40 + bx, photoY + by, 255, 255, 255);
    }
  }
}

// Band 2 (Middle): Solid red with five small yellow dots (China style)
fillRect(40 + bandW, photoY, bandW, photoH, RED);
// Big star/dot center, 4 small dots arc
fillCircle(40 + bandW + Math.floor(bandW / 2), photoY + Math.floor(photoH / 2), 16, [255, 220, 0]);
for (let d = 0; d < 4; d++) {
  const angle = d * 0.6 - 0.9;
  const dx = Math.round(Math.cos(angle) * 35);
  const dy = Math.round(Math.sin(angle) * 35);
  fillCircle(40 + bandW + Math.floor(bandW / 2) + dx, photoY + Math.floor(photoH / 2) + dy, 6, [255, 220, 0]);
}

// Band 3 (Right): Horizontal white, blue, red stripes (Russia style)
const stripeH = Math.floor(photoH / 3);
for (let bx = 0; bx < bandW; bx++) {
  for (let by = 0; by < photoH; by++) {
    let col = WHITE;
    if (by >= stripeH && by < stripeH * 2) col = [40, 80, 160];
    else if (by >= stripeH * 2) col = [180, 30, 30];
    setPixel(40 + bandW * 2 + bx, photoY + by, col[0], col[1], col[2]);
  }
}

const captionY = photoY + photoH + 8;
const captionH = drawText(40, captionY, "The three leaders in Shenzhen: a declaration, a handshake, and a photograph the world will keep.", 1, GREY, 944);

const middleRuleY = captionY + captionH + 10;
hline(40, middleRuleY, 944, BLACK, 1);
vline(512, middleRuleY, 300, BLACK, 1);

// Bottom ticker band
const tickerY = 826;
const tickerH = 50;
fillRect(0, tickerY, WIDTH, tickerH, BLACK);

const tickerText = "SENATE REJECTS IRAN WAR-POWERS VOTE 51-48 • US SANCTIONS COMANCHEROS AND 'NDRANGHETA • UK-EU YOUTH MOBILITY DEAL • GAZA OPERATION CROSSES YELLOW LINE • BUKELE SEEKS THIRD TERM • FIONA THE HIPPO DIES AT CINCINNATI ZOO • CLIMATE SUMMIT ENTERS FINAL DAY • CALIFORNIA PROBES NVIDIA CHINA CHIPS";

// 5. Ticker scale 1, split 8 items across two lines by accumulated width (984px capacity)
const tickerItems = tickerText.split('•').map(s => s.trim());
const line1Items: string[] = [];
const line2Items: string[] = [];

function measureItemWidth(item: string) {
  return item.length * 6;
}

let currentLineWidth = 0;
const maxLineWidth = 984; // 1024 - 40 margin
for (let i = 0; i < tickerItems.length; i++) {
  const item = tickerItems[i];
  const w = measureItemWidth(item) + (i > 0 ? 20 : 0); // approx separator width
  if (line1Items.length === 0 || currentLineWidth + w <= maxLineWidth) {
    line1Items.push(item);
    currentLineWidth += w;
  } else {
    line2Items.push(item);
  }
}
// If line2 is empty or items need balancing, split evenly or as needed. But let's check exact items distribution.
// Actually, let's distribute items greedily into line 1 and line 2 up to maxLineWidth.
// Let us write a robust width-based splitter for all 8 items:
const l1: string[] = [];
const l2: string[] = [];
let w1 = 0;
for (let i = 0; i < tickerItems.length; i++) {
  const item = tickerItems[i];
  const itemW = item.length * 6;
  const sepW = l1.length > 0 ? 24 : 0;
  if (l1.length === 0 || w1 + sepW + itemW <= 984) {
    l1.push(item);
    w1 += sepW + itemW;
  } else {
    l2.push(item);
  }
}

function renderTickerLineScale1(items: string[], startY: number) {
  let tx = 20;
  const ty = startY;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    for (let c = 0; c < item.length; c++) {
      const ch = item[c];
      drawChar(tx, ty, ch, 1, WHITE);
      tx += 6;
    }
    if (i < items.length - 1) {
      tx += 6;
      fillCircle(tx + 3, ty + 3, 2, RED);
      tx += 12;
    }
  }
}

renderTickerLineScale1(l1, tickerY + 11);
renderTickerLineScale1(l2, tickerY + 28);

// Footer (y ~ 930)
const footerText = "THE WORLD TODAY - FRIDAY 20 NOVEMBER 2026 - DRAWN ENTIRELY BY CODE";
// 6. Center the footer: compute its pixel width and start x at (1024 - width) / 2
const footerScale = 1;
const footerCharWidth = 6 * footerScale;
const footerWidth = footerText.length * footerCharWidth;
const footerStartX = Math.round((WIDTH - footerWidth) / 2);
drawText(footerStartX, 930, footerText, footerScale, GREY, WIDTH);

// Columns area between middleRuleY and tickerY
const colY = middleRuleY + 10;
const leftColX = 40;
const rightColX = 540;
const colW = 444;

// 2. Story headlines wrap to 2 lines at scale 3, and body text stacks below using height drawText returns with small gap
// Left column stories
let lCurY = colY;

// Story A
const l1h = drawText(leftColX, lCurY, "WORLD COURT: MYANMAR GUILTY OF GENOCIDE", 3, BLACK, colW);
lCurY += l1h + 4;
const l1bh = drawText(leftColX, lCurY, "The Hague rules 9-6 that Myanmar committed genocide against the Rohingya in Rakhine.", 1, BLACK, colW);
lCurY += l1bh + 12;

// Story B
const l2h = drawText(leftColX, lCurY, "ANTHROPIC GOES PUBLIC AT $2 TRILLION", 3, BLACK, colW);
lCurY += l2h + 4;
const l2bh = drawText(leftColX, lCurY, "The first frontier AI company lists on Nasdaq as ANT; shares jump on debut.", 1, BLACK, colW);
lCurY += l2bh + 12;

// Story C
const l3h = drawText(leftColX, lCurY, "IRAN WAR COST PASSES $48 BILLION", 3, BLACK, colW);
lCurY += l3h + 4;
const l3bh = drawText(leftColX, lCurY, "US operations burn through a third of key munitions as Gulf attacks widen.", 1, BLACK, colW);

// Right column: Stock chart panel + 2 stories
const chartX = rightColX;
const chartY = colY;
const chartW = 444;
const chartH = 80;
frame(chartX, chartY, chartW, chartH, BLACK, 1);

// Draw axes and falling stock line inside chart
hline(chartX + 30, chartY + 60, chartW - 40, GREY, 1);
vline(chartX + 30, chartY + 10, chartH - 20, GREY, 1);

// 5. Taipei chart red line 3px thick, step every pixel along x
let prevX = chartX + 35;
let prevY = chartY + 20;
const chartPoints = [20, 35, 65];
for (let p = 0; p < chartPoints.length; p++) {
  const px = chartX + 45 + p * 185;
  const py = chartY + chartPoints[p];
  fillCircle(px, py, 3, RED);
  if (p > 0) {
    const dx = px - prevX;
    const dy = py - prevY;
    const steps = Math.abs(dx);
    for (let step = 0; step <= steps; step++) {
      const t = steps === 0 ? 0 : step / steps;
      const interpX = Math.round(prevX + dx * t);
      const interpY = Math.round(prevY + dy * t);
      // 3px thick line (e.g. interpY, interpY+1, interpY+2)
      setPixel(interpX, interpY, RED[0], RED[1], RED[2]);
      setPixel(interpX, interpY + 1, RED[0], RED[1], RED[2]);
      setPixel(interpX, interpY + 2, RED[0], RED[1], RED[2]);
    }
  }
  prevX = px;
  prevY = py;
}

const chartLabelH = drawText(chartX + 10, chartY + chartH + 4, "TAIPEI PLUNGES 2,200 POINTS", 2, BLACK, chartW);

// Right column stories below chart
let rCurY = chartY + chartH + 4 + chartLabelH + 10;

// Story A
const r1h = drawText(rightColX, rCurY, "EUROPE READY FOR UKRAINE TALKS", 3, BLACK, colW);
rCurY += r1h + 4;
const r1bh = drawText(rightColX, rCurY, "Leaders say new negotiations with Russia will include Europe; Kyiv hit by missiles.", 1, BLACK, colW);
rCurY += r1bh + 12;

// Story B
const r2h = drawText(rightColX, rCurY, "TRUMP PARDONS PETE ROSE", 3, BLACK, colW);
rCurY += r2h + 4;
drawText(rightColX, rCurY, "The late baseball legend is cleared posthumously by the president.", 1, BLACK, colW);

// Assemble PNG
const scanlines = new Uint8Array(HEIGHT * (1 + WIDTH * 3));
for (let y = 0; y < HEIGHT; y++) {
  const rowOffset = y * (1 + WIDTH * 3);
  scanlines[rowOffset] = 0; // filter type 0 (None)
  scanlines.set(buffer.subarray(y * WIDTH * 3, (y + 1) * WIDTH * 3), rowOffset + 1);
}

const compressed = zlib.deflateSync(scanlines, { level: 9 });

const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdrData = new Uint8Array(13);
ihdrData.set(writeUint32BE(WIDTH), 0);
ihdrData.set(writeUint32BE(HEIGHT), 4);
ihdrData[8] = 8; // bit depth
ihdrData[9] = 2; // color type truecolor RGB
ihdrData[10] = 0; // compression
ihdrData[11] = 0; // filter
ihdrData[12] = 0; // interlace

const ihdrChunk = makeChunk('IHDR', ihdrData);
const idatChunk = makeChunk('IDAT', compressed);
const iendChunk = makeChunk('IEND', new Uint8Array(0));

const totalLen = sig.length + ihdrChunk.length + idatChunk.length + iendChunk.length;
const pngBuf = new Uint8Array(totalLen);
let offset = 0;
pngBuf.set(sig, offset); offset += sig.length;
pngBuf.set(ihdrChunk, offset); offset += ihdrChunk.length;
pngBuf.set(idatChunk, offset); offset += idatChunk.length;
pngBuf.set(iendChunk, offset);

const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';
try {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'entry.png'), pngBuf);
  console.log('Successfully wrote entry.png to', outDir);
  process.exit(0);
} catch (err) {
  console.error('Failed to write image:', err);
  process.exit(1);
}
