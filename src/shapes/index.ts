// Shared 2D profiles (THREE.Shape) for the geometry builders to extrude. These started
// app-side by design ("2D profiles are model-specific"), but circle and roundedRect were
// copied verbatim into four consumers and the regular polygon existed in three divergent
// signatures — that is past the rule of threes, so the general-purpose primitives live
// here now. Model-specific profiles (teardrop windows, dovetails, notch slots…) stay in
// their apps.
//
// Conventions: everything is drawn in the XY plane in mm, centred on the origin unless a
// centre is part of the signature, counter-clockwise so extrusions face outward.

import { Path, Shape } from "three";

/**
 * A circle centred on the origin. The extruder polygonises it (inscribed, so a hair
 * under r) — pass more curveSegments to extrude() where the fit matters.
 */
export function circle(r: number): Shape {
  const s = new Shape();
  s.absarc(0, 0, r, 0, Math.PI * 2, false);
  return s;
}

/**
 * A circle centred at (cx, cy) — for features positioned in shape space so a shared
 * tapered extrusion (scaleTop) moves and grows them in lockstep with the surface they
 * sit on.
 */
export function circleAt(cx: number, cy: number, r: number): Shape {
  const s = new Shape();
  s.absarc(cx, cy, r, 0, Math.PI * 2, false);
  return s;
}

/**
 * Trace a rounded rectangle (centred on the origin) onto an existing Path or Shape —
 * the Path form is what ring profiles push into `.holes`. The radius is clamped so
 * opposite arcs never overlap; r = 0 degenerates to straight corners.
 *
 * `squareFront` leaves the two −Y corners square (an open-front tray has no front wall
 * to round into); footprint is identical either way.
 */
export function roundedRectInto<T extends Path>(
  path: T,
  w: number,
  l: number,
  radius: number,
  squareFront = false,
): T {
  const hw = w / 2;
  const hl = l / 2;
  const r = Math.max(Math.min(radius, hw - 0.01, hl - 0.01), 0);
  const fr = squareFront ? 0 : r; // front (−Y) corner radius
  path.moveTo(-hw + fr, -hl);
  path.lineTo(hw - fr, -hl);
  if (fr > 0) path.absarc(hw - fr, -hl + fr, fr, -Math.PI / 2, 0, false);
  path.lineTo(hw, hl - r);
  if (r > 0) path.absarc(hw - r, hl - r, r, 0, Math.PI / 2, false);
  path.lineTo(-hw + r, hl);
  if (r > 0) path.absarc(-hw + r, hl - r, r, Math.PI / 2, Math.PI, false);
  path.lineTo(-hw, -hl + fr);
  if (fr > 0) path.absarc(-hw + fr, -hl + fr, fr, Math.PI, Math.PI * 1.5, false);
  path.closePath();
  return path;
}

/** A rounded rectangle centred on the origin — see roundedRectInto. */
export function roundedRect(w: number, l: number, r: number, squareFront = false): Shape {
  return roundedRectInto(new Shape(), w, l, r, squareFront);
}

/**
 * A regular n-gon sized by circumradius. rot turns the first vertex away from the +X
 * axis (rot = π/n puts an edge midpoint there; rot = π/2 makes a point-up polygon).
 * Callers keeping a nominal wall thickness across the flats pass
 * circumR = inradius / cos(π/n).
 */
export function regularPolygon(n: number, circumR: number, rot = 0, cx = 0, cy = 0): Shape {
  const s = new Shape();
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    const x = cx + circumR * Math.cos(a);
    const y = cy + circumR * Math.sin(a);
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}
