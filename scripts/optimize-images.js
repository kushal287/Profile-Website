// Generates small, modern-format versions of the hero photo (AVIF / WebP / JPEG, two sizes).
// Run once after changing public/assets/kushal.jpg:   node scripts/optimize-images.js
const sharp = require('sharp');
const path = require('path');
const dir = path.join(__dirname, '..', 'public', 'assets');

(async () => {
  const src = path.join(dir, 'kushal.jpg');
  const meta = await sharp(src).metadata();
  // crop to the 4:5 frame used on the page, keeping the face (same focus as object-position: 50% 25%)
  const h = Math.min(meta.height, Math.round(meta.width * 1.25));
  const top = Math.round((meta.height - h) * 0.25);
  const base = () => sharp(src).rotate().extract({ left: 0, top, width: meta.width, height: h });
  for (const w of [400, 800]) {
    const hh = Math.round(w * 1.25);
    const r = () => base().resize(w, hh, { fit: 'cover' });
    await r().avif({ quality: 50, effort: 6 }).toFile(path.join(dir, `hero-${w}.avif`));
    await r().webp({ quality: 78 }).toFile(path.join(dir, `hero-${w}.webp`));
    await r().jpeg({ quality: 78, progressive: true, mozjpeg: true }).toFile(path.join(dir, `hero-${w}.jpg`));
  }
  console.log('done');
})().catch((e) => { console.error(e); process.exit(1); });
