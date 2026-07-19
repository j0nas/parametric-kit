// 3D preview geometry for flat-panel apps: a panel extruded to sheet thickness and baked into its
// assembled world placement — the same outline and placement the SVG export uses, so preview and
// cut file can't drift. Split from the laser index so servers pricing from the pure polygon math
// never pull in three.

import type { BufferGeometry } from "three";
import { ExtrudeGeometry, Matrix4, Path, Shape } from "three";
import { type Panel, placeMatrix } from "./index.ts";

// `placed: false` leaves the geometry panel-local (z ∈ [0, thickness]) for apps that apply
// placeMatrix() on the mesh instead — e.g. to animate an explode offset without rebuilding.
export function panelGeometry(
  panel: Panel,
  thickness: number,
  opts: { placed?: boolean } = {},
): BufferGeometry {
  const shape = new Shape();
  panel.outline.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
  shape.closePath();
  for (const hole of panel.holes) {
    const path = new Path();
    hole.forEach(([x, y], i) => (i === 0 ? path.moveTo(x, y) : path.lineTo(x, y)));
    path.closePath();
    shape.holes.push(path);
  }
  const geo = new ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  if (opts.placed !== false) geo.applyMatrix4(new Matrix4().fromArray(placeMatrix(panel.place)));
  return geo;
}
