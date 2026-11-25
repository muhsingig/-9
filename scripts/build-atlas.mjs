// Packs /raw-shots/<shot>.png into one texture atlas the 3D wall samples from,
// plus one sharper image per project for the card that comes off the wall.
//   npm run cards
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { projects } from '../src/config.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rawDir = path.join(root, 'raw-shots');
const outDir = path.join(root, 'cards');
fs.mkdirSync(outDir, { recursive: true });

const COLS = 4;
const ROWS = Math.ceil(projects.length / COLS);

async function atlas(cellW, file) {
  const cellH = Math.round(cellW * 0.625); // 16:10
  const layers = [];
  for (const [i, p] of projects.entries()) {
    const src = path.join(rawDir, `${p.shot}.png`);
    if (!fs.existsSync(src)) throw new Error(`Missing screenshot: raw-shots/${p.shot}.png`);
    const buf = await sharp(src).resize(cellW, cellH, { fit: 'cover', position: 'top' }).toBuffer();
    layers.push({ input: buf, left: (i % COLS) * cellW, top: Math.floor(i / COLS) * cellH });
  }
  await sharp({ create: { width: cellW * COLS, height: cellH * ROWS, channels: 3, background: '#0b0b0b' } })
    .composite(layers)
    .webp({ quality: 80 })
    .toFile(path.join(outDir, file));
  console.log(`${file}: ${cellW * COLS}x${cellH * ROWS}`);
}

await atlas(1024, 'atlas.webp');
await atlas(512, 'atlas-sm.webp');

for (const p of projects) {
  await sharp(path.join(rawDir, `${p.shot}.png`))
    .resize(1600, 1000, { fit: 'cover', position: 'top' })
    .webp({ quality: 84 })
    .toFile(path.join(outDir, `${p.id}.webp`));
}

fs.writeFileSync(path.join(outDir, 'atlas.json'), JSON.stringify({ cols: COLS, rows: ROWS }, null, 2));
console.log(`${projects.length} cards written to cards/`);
