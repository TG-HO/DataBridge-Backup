const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPng(size, bgColor, fgColor) {
  // Simple PNG generator using zlib
  const width = size;
  const height = size;

  // Unfiltered raw RGBA lines
  const rawData = Buffer.alloc(height * (1 + width * 4));

  const [br, bg, bb] = bgColor;
  const [fr, fg, fb] = fgColor;

  let offset = 0;
  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // filter type None
    for (let x = 0; x < width; x++) {
      // Draw rounded rect or circle icon with AI bridge symbol
      const cx = width / 2;
      const cy = height / 2;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const radius = size * 0.44;

      // Inside circle/hexagon?
      if (dist <= radius) {
        // Draw an inner stylized brain/bridge symbol
        const inCenter = Math.abs(dx) < size * 0.22 && Math.abs(dy) < size * 0.22;
        const inCross1 = Math.abs(dx) < size * 0.05 && Math.abs(dy) < size * 0.32;
        const inCross2 = Math.abs(dy) < size * 0.05 && Math.abs(dx) < size * 0.32;
        const inRing = dist > size * 0.28 && dist < size * 0.36;

        if (inCenter || inCross1 || inCross2 || inRing) {
          rawData[offset++] = 255; // White / accent
          rawData[offset++] = 255;
          rawData[offset++] = 255;
          rawData[offset++] = 255;
        } else {
          // Gradient background
          const t = y / height;
          rawData[offset++] = Math.floor(br * (1 - t) + fr * t);
          rawData[offset++] = Math.floor(bg * (1 - t) + fg * t);
          rawData[offset++] = Math.floor(bb * (1 - t) + fb * t);
          rawData[offset++] = 255;
        }
      } else {
        // Transparent outside
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0;
      }
    }
  }

  const deflated = zlib.deflateSync(rawData);

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8 bits per channel
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0; // Deflate
  ihdrData[11] = 0; // Filter
  ihdrData[12] = 0; // Non-interlaced
  const ihdrChunk = makeChunk('IHDR', ihdrData);

  // IDAT chunk
  const idatChunk = makeChunk('IDAT', deflated);

  // IEND chunk
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function crc32(buf) {
  let crc = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) {
    let byte = buf[i];
    crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

const table = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  table[i] = c;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const body = Buffer.concat([typeBuf, data]);
  const crc = crc32(body);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);

  return Buffer.concat([lenBuf, body, crcBuf]);
}

const dir = path.join(__dirname, '..', 'public', 'icons');
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

fs.writeFileSync(path.join(dir, 'icon-192x192.png'), createPng(192, [99, 102, 241], [79, 70, 229]));
fs.writeFileSync(path.join(dir, 'icon-512x512.png'), createPng(512, [99, 102, 241], [79, 70, 229]));
console.log('Successfully generated PWA icons at public/icons/');
