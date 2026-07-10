// Geometry test probes for consuming apps' own suites: build the real solids through the Manifold
// kernel (Node build, no DOM) and probe the meshes — bounding boxes, volumes, and vertex positions.
// These catch what pure-math parameter tests can't: a cut in the wrong place, a boss that got clipped,
// an opening that broke through a margin.

import type { BufferGeometry } from "three";

export type Box = { min: [number, number, number]; max: [number, number, number] };

// Axis-aligned bounding box of the mesh's position attribute.
export function bbox(g: BufferGeometry): Box {
  const pos = g.getAttribute("position");
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.count; i++) {
    const v = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], v[a]);
      max[a] = Math.max(max[a], v[a]);
    }
  }
  return { min, max };
}

// Solid volume (mm³) via the signed-tetrahedron sum — valid because Manifold guarantees a closed mesh.
export function volume(g: BufferGeometry): number {
  const pos = g.getAttribute("position");
  const idx = g.index!;
  let v = 0;
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i);
    const b = idx.getX(i + 1);
    const c = idx.getX(i + 2);
    const ax = pos.getX(a),
      ay = pos.getY(a),
      az = pos.getZ(a);
    const bx = pos.getX(b),
      by = pos.getY(b),
      bz = pos.getZ(b);
    const cx = pos.getX(c),
      cy = pos.getY(c),
      cz = pos.getZ(c);
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return Math.abs(v);
}

// Count mesh vertices inside a horizontal disc — used to prove a pocket floor exists exactly where a
// feature (e.g. a magnet) should bottom out.
export function verticesOnDisc(
  g: BufferGeometry,
  cx: number,
  cy: number,
  z: number,
  r: number,
): number {
  const pos = g.getAttribute("position");
  let n = 0;
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(pos.getZ(i) - z) > 1e-4) continue;
    const dx = pos.getX(i) - cx;
    const dy = pos.getY(i) - cy;
    if (dx * dx + dy * dy <= r * r) n++;
  }
  return n;
}
