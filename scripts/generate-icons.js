// Generate CookieFree icons - Teal with shield/broom motif
const sizes = [16, 48, 128];
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function generatePNG(size) {
  const data = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      const cornerR = size * 0.18;
      const halfSize = size / 2 - size * 0.05;
      let inside = true;
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      
      if (ax > halfSize || ay > halfSize) {
        inside = false;
      } else if (ax > halfSize - cornerR && ay > halfSize - cornerR) {
        const cdx = ax - (halfSize - cornerR);
        const cdy = ay - (halfSize - cornerR);
        if (Math.sqrt(cdx * cdx + cdy * cdy) > cornerR) inside = false;
      }
      
      if (!inside) { data[idx] = data[idx+1] = data[idx+2] = data[idx+3] = 0; continue; }
      
      const grad = (dx / size + dy / size + 1) / 2;
      const r1 = 13, g1 = 148, b1 = 136;  // #0d9488
      const r2 = 94, g2 = 234, b2 = 212;  // #5eead4
      const centerDist = dist / (size / 2);
      const highlight = Math.max(0, 1 - centerDist * 0.6);
      
      data[idx] = Math.round(r1 + (r2 - r1) * grad + highlight * 15);
      data[idx+1] = Math.round(g1 + (g2 - g1) * grad + highlight * 12);
      data[idx+2] = Math.round(b1 + (b2 - b1) * grad + highlight * 8);
      data[idx+3] = 255;
    }
  }
  
  // Draw shield shape (white)
  const s = size * 0.38;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const idx = (py * size + px) * 4;
      if (data[idx+3] === 0) continue;
      
      const rdx = (px - cx) / s;
      const rdy = (py - cy) / s;
      
      // Shield shape: rounded top, pointed bottom
      let inShield = false;
      
      if (rdy >= -0.6 && rdy <= 0.8) {
        // Normalized y from -0.6 to 0.8 => map to 0..1
        const t = (rdy + 0.6) / 1.4; // 0 at top, 1 at bottom
        // Width narrows toward bottom
        const shieldWidth = 0.5 * (1 - t * 0.4);
        inShield = Math.abs(rdx) < shieldWidth;
        
        // Add slight curves at sides
        if (inShield && t < 0.3) {
          // Upper curved corners
          const cornerFactor = (0.3 - t) / 0.3;
          const maxX = shieldWidth - cornerFactor * 0.1;
          if (Math.abs(rdx) > maxX && Math.abs(rdy + 0.6) < 0.15) {
            inShield = false;
          }
        }
      }
      
      // Shield point at bottom
      if (!inShield && rdy > 0.8 && rdy <= 1.0) {
        const t2 = (rdy - 0.8) / 0.2;
        const pointWidth = 0.3 * (1 - t2);
        inShield = Math.abs(rdx) < pointWidth;
      }
      
      if (inShield) {
        data[idx] = data[idx+1] = data[idx+2] = 255;
        data[idx+3] = 255;
      }
    }
  }
  
  // Draw checkmark inside shield (teal)
  const chS = s * 0.35;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const idx = (py * size + px) * 4;
      if (data[idx+3] !== 255) continue; // Only draw check inside white area
      
      const rdx = (px - cx) / s;
      const rdy = (py - cy) / s;
      
      // Thick checkmark
      // Left segment (down-right)
      const chStX = -chS * 0.6;
      const chStY = -chS * 0.1;
      const chMidX = 0;
      const chMidY = chS * 0.3;
      const chEndX = chS * 0.8;
      const chEndY = -chS * 0.4;
      
      const t = 0.02; // thickness
      
      // Check if point is near the checkmark line segments
      let inCheck = false;
      
      // Segment 1: start -> mid
      const dx1 = chMidX - chStX;
      const dy1 = chMidY - chStY;
      const len1 = Math.sqrt(dx1*dx1 + dy1*dy1);
      if (len1 > 0) {
        // Project point onto segment
        const px1 = rdx - chStX;
        const py1 = rdy - chStY;
        const proj = Math.max(0, Math.min(1, (px1*dx1 + py1*dy1) / (len1*len1)));
        const cx1 = chStX + proj * dx1;
        const cy1 = chStY + proj * dy1;
        const distSeg = Math.sqrt((rdx-cx1)*(rdx-cx1) + (rdy-cy1)*(rdy-cy1));
        if (distSeg < t && proj >= 0.05 && proj <= 0.95) inCheck = true;
      }
      
      // Segment 2: mid -> end
      const dx2 = chEndX - chMidX;
      const dy2 = chEndY - chMidY;
      const len2 = Math.sqrt(dx2*dx2 + dy2*dy2);
      if (len2 > 0) {
        const px2 = rdx - chMidX;
        const py2 = rdy - chMidY;
        const proj2 = Math.max(0, Math.min(1, (px2*dx2 + py2*dy2) / (len2*len2)));
        const cx2 = chMidX + proj2 * dx2;
        const cy2 = chMidY + proj2 * dy2;
        const distSeg2 = Math.sqrt((rdx-cx2)*(rdx-cx2) + (rdy-cy2)*(rdy-cy2));
        if (distSeg2 < t && proj2 >= 0.05 && proj2 <= 0.95) inCheck = true;
      }
      
      if (inCheck) {
        // Teal check mark
        data[idx] = 13;
        data[idx+1] = 148;
        data[idx+2] = 136;
        data[idx+3] = 255;
      }
    }
  }
  
  return data;
}

function createChunk(type, data) {
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(crcData), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) { crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0); }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createPNG(pixelData, size) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0); ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8; ihdrData[9] = 6;
  const ihdr = createChunk('IHDR', ihdrData);
  const rawData = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    rawData[y * (size * 4 + 1)] = 0;
    pixelData.copy(rawData, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const compressed = zlib.deflateSync(rawData);
  const idat = createChunk('IDAT', compressed);
  const iend = createChunk('IEND', Buffer.alloc(0));
  return Buffer.concat([signature, ihdr, idat, iend]);
}

const outDir = path.join(__dirname, '..', 'icons');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

sizes.forEach(size => {
  const png = createPNG(generatePNG(size), size);
  const filename = path.join(outDir, `icon${size}.png`);
  fs.writeFileSync(filename, png);
  console.log(`Generated ${filename}`);
});