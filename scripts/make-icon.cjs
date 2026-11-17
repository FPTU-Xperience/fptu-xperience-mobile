// Composites the transparent fptux logo onto square canvases.
// Uses only pngjs (already a dependency) — no new install needed.
//
// Writes (all under assets/images/):
//   icon.png                     1024x1024 opaque white  -> app icon
//   android-icon-foreground.png 1024x1024 transparent     -> Android adaptive icon foreground
//   splash-icon.png             512x512 transparent      -> splash screen image
//
// The logo is centered on its opaque content bounds with ~24% padding so it
// also survives Android's adaptive-icon safe zone (visible circle ~72% of 108dp).

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const root = path.join(__dirname, '..');
const imgDir = path.join(root, 'assets', 'images');
const logo = PNG.sync.read(fs.readFileSync(path.join(root, 'assets', 'fptux.png')));

// Opaque content bounds (sampled on a grid — fast enough for a 1000px image).
function contentBounds() {
  let minx = logo.width, miny = logo.height, maxx = 0, maxy = 0, found = false;
  const step = Math.max(1, Math.floor(logo.width / 400));
  for (let y = 0; y < logo.height; y += step) {
    for (let x = 0; x < logo.width; x += step) {
      if (logo.data[(y * logo.width + x) * 4 + 3] > 8) {
        found = true;
        if (x < minx) minx = x;
        if (x > maxx) maxx = x;
        if (y < miny) miny = y;
        if (y > maxy) maxy = y;
      }
    }
  }
  return found ? { minx, miny, maxx: maxx + 1, maxy: maxy + 1 } : null;
}

// Nearest-neighbour crop+scale of the content region into a center-aligned
// square target. `fill` = null for transparent, [r,g,b] for an opaque base.
function intoSquare(size, fill) {
  const out = new PNG({ width: size, height: size });
  for (let i = 0; i < size * size; i++) {
    const o = i * 4;
    if (fill) {
      out.data[o] = fill[0];
      out.data[o + 1] = fill[1];
      out.data[o + 2] = fill[2];
      out.data[o + 3] = 255;
    }
  }

  const b = contentBounds();
  if (!b) return out; // fully transparent source — nothing to draw
  const cw = b.maxx - b.minx;
  const ch = b.maxy - b.miny;
  const pad = 0.24;
  const scale = (size * (1 - pad * 2)) / Math.max(cw, ch);
  const offX = (size - cw * scale) / 2;
  const offY = (size - ch * scale) / 2;

  for (let ty = 0; ty < size; ty++) {
    const sy = b.miny + Math.floor((ty - offY) / scale);
    if (sy < b.miny || sy >= b.maxy) continue;
    for (let tx = 0; tx < size; tx++) {
      const sx = b.minx + Math.floor((tx - offX) / scale);
      if (sx < b.minx || sx >= b.maxx) continue;
      const so = (sy * logo.width + sx) * 4;
      const a = logo.data[so + 3] / 255;
      if (a === 0) continue;
      const o = (ty * size + tx) * 4;
      // Alpha-composite the logo pixel over the target base.
      out.data[o] = Math.round(logo.data[so] * a + out.data[o] * (1 - a));
      out.data[o + 1] = Math.round(logo.data[so + 1] * a + out.data[o + 1] * (1 - a));
      out.data[o + 2] = Math.round(logo.data[so + 2] * a + out.data[o + 2] * (1 - a));
      // Opaque base (fill) => fully opaque result; transparent base => keep source alpha.
      out.data[o + 3] = fill ? 255 : Math.round(a * 255);
    }
  }
  return out;
}

// 1) App icon — opaque white.
fs.writeFileSync(path.join(imgDir, 'icon.png'), PNG.sync.write(intoSquare(1024, [255, 255, 255])));

// 2) Android adaptive foreground — transparent.
fs.writeFileSync(
  path.join(imgDir, 'android-icon-foreground.png'),
  PNG.sync.write(intoSquare(1024, null)),
);

// 3) Splash image — transparent (splash backgroundColor provides the white).
fs.writeFileSync(path.join(imgDir, 'splash-icon.png'), PNG.sync.write(intoSquare(512, null)));

console.log('Generated icon.png / android-icon-foreground.png / splash-icon.png from fptux.png');
