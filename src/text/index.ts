// Text as extrudable glyph outlines. Droid Sans Bold (Apache-2.0, The Android Open Source
// Project — see ./assets/NOTICE) is parsed ONCE at module load: FontLoader.parse is synchronous,
// so geometry builders using text stay pure `Params -> BufferGeometry` with no async font init
// (unlike the WASM CSG kernel, which does need initCSG). The full face is bundled — letters,
// digits and Nordic æøå all render; a bold sans survives extrusion and inlay far better than
// hairline faces or hand-drawn segment glyphs.

import type { Shape } from "three";
import { type Font, type FontData, FontLoader } from "three/examples/jsm/loaders/FontLoader.js";
import fontData from "./assets/droid-sans-bold.typeface.json" with { type: "json" };

const font: Font = new FontLoader().parse(fontData as unknown as FontData);

// The rendered cap height (mm) of a digit generated at size 100. Glyphs scale linearly with the
// size argument, so this converts a requested cap height straight into the generateShapes size.
const CAP_PER_100 = boxOf(font.generateShapes("0", 100)).h;

export type Glyphs = {
  /** One THREE.Shape per glyph (letter counters carried as `.holes`), baseline at y=0, run
   *  starting at x=0. Extrude each, then translate the SOLID to place/centre it. */
  shapes: Shape[];
  /** Tight bounds of the whole run — the caller centres the extruded solid on these. */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

// Outline generation is pure in (label, capHeight) and the consumers only read the shapes
// (extrude + bounds), so runs are cached — a rebuild re-requests the same handful of labels
// every time. Bounded so a parameter sweep can't grow it forever.
const glyphCache = new Map<string, Glyphs>();

/** Glyph outlines for `label`, sized so capital letters and digits stand exactly
 *  `capHeightMm` tall (descenders and diacritics extend beyond the cap band). */
export function textGlyphs(label: string, capHeightMm: number): Glyphs {
  const key = `${label}@${capHeightMm}`;
  const hit = glyphCache.get(key);
  if (hit) return hit;
  const shapes = font.generateShapes(label, (capHeightMm * 100) / CAP_PER_100);
  const b = boxOf(shapes);
  const out = { shapes, minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY };
  if (glyphCache.size >= 256) glyphCache.clear();
  glyphCache.set(key, out);
  return out;
}

function boxOf(shapes: Shape[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  h: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const shape of shapes) {
    // Outer contour only bounds the glyph; counters (holes) sit inside it.
    for (const pt of shape.getPoints(4)) {
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0, h: 0 };
  return { minX, minY, maxX, maxY, h: maxY - minY };
}
