/**
 * Generates admin-icon-192.png and admin-icon-512.png
 * Dark blue (#0f3460) background + gold (#c9a84c) gear shape
 * Pure Node.js, no dependencies.
 */
const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

// ── PNG encoder ──────────────────────────────────────────────────────────────

function crc32(buf) {
  const table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    return t;
  })();
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const crcVal = crc32(Buffer.concat([t, data]));
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crcVal);
  return Buffer.concat([len, t, data, crc]);
}

function encodePNG(width, height, getPixel) {
  // Build raw (unfiltered) RGBA scanlines
  const raw = Buffer.alloc((width * 4 + 1) * height);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    raw[pos++] = 0; // filter: None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixel(x, y);
      raw[pos++] = r; raw[pos++] = g; raw[pos++] = b; raw[pos++] = a;
    }
  }
  const idat = zlib.deflateSync(raw);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ── Draw admin gear icon ─────────────────────────────────────────────────────

function drawAdminIcon(size) {
  const cx = size / 2, cy = size / 2;

  const BG        = [15,  52,  96,  255]; // #0f3460 dark blue
  const GOLD      = [201, 168, 76,  255]; // #c9a84c gold
  const BORDER    = [201, 168, 76,  255]; // gold border

  const borderR   = size * 0.48;         // outer rounded-rect border
  const gearOut   = size * 0.33;         // gear outer radius (body)
  const gearIn    = size * 0.18;         // inner ring of body
  const holeR     = size * 0.10;         // center hole radius
  const toothH    = size * 0.085;        // tooth height
  const numTeeth  = 8;
  const toothArc  = (2 * Math.PI / numTeeth) * 0.45; // half-width of tooth

  return (x, y) => {
    const dx = x - cx, dy = y - cy;
    const r  = Math.sqrt(dx * dx + dy * dy);

    // Outside rounded square → transparent
    if (r > borderR) return [0, 0, 0, 0];

    // ── Background ──
    let color = BG;

    // ── Outer border ring ──
    if (r > borderR - size * 0.02) return BORDER;

    // ── Gear ──
    if (r > holeR) {
      const theta = Math.atan2(dy, dx);
      const sectorAngle = 2 * Math.PI / numTeeth;
      // Normalize angle to [0, sectorAngle)
      const norm = ((theta % sectorAngle) + sectorAngle) % sectorAngle;
      const inTooth = norm < toothArc || norm > sectorAngle - toothArc;

      if (r < holeR + size * 0.005) {
        // Hole edge
        color = GOLD;
      } else if (r < gearIn) {
        color = GOLD;
      } else if (r < gearOut) {
        color = GOLD;
      } else if (r < gearOut + toothH && inTooth) {
        color = GOLD;
      }
    }

    return color;
  };
}

// ── Generate ─────────────────────────────────────────────────────────────────

const outDir = path.join(__dirname, '../public/icons');

[192, 512].forEach(size => {
  const getPixel = drawAdminIcon(size);
  const png = encodePNG(size, size, getPixel);
  const outPath = path.join(outDir, `admin-icon-${size}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`✅ Generated ${outPath} (${png.length} bytes)`);
});
