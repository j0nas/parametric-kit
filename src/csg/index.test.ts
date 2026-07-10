// Geometry-level validation of the Manifold CSG layer AND of the _ToPolygons/_Extrude leak-workaround
// against the installed manifold-3d (3.5.1): if the private-binding path drifted, the extruded volume
// would come out wrong here rather than only leaking silently in production.

import { Shape } from "three";
import { beforeAll, describe, expect, test } from "vite-plus/test";
import { bbox, volume } from "../testkit/index.ts";
import { initCSG, type Mat, scope } from "./index.ts";

beforeAll(async () => {
  await initCSG(); // Node: the Emscripten loader finds the wasm next to its own module
});

function square(side: number): Shape {
  const s = new Shape();
  s.moveTo(0, 0);
  s.lineTo(side, 0);
  s.lineTo(side, side);
  s.lineTo(0, side);
  s.lineTo(0, 0);
  return s;
}

describe("extrude (drives the _Extrude leak-workaround path)", () => {
  test("a 10×10 square extruded 10 up is exactly 1000 mm³", () => {
    const s = scope();
    const solid = s.extrude(square(10), 10);
    const g = s.finish(solid);
    expect(volume(g)).toBeCloseTo(1000, 3);
    const b = bbox(g);
    expect(b.min).toEqual([0, 0, 0]);
    expect(b.max[0]).toBeCloseTo(10, 6);
    expect(b.max[1]).toBeCloseTo(10, 6);
    expect(b.max[2]).toBeCloseTo(10, 6);
  });
});

describe("boolean subtraction", () => {
  test("a centred 10-cube removed from a 20-cube leaves 8000 − 1000 = 7000 mm³", () => {
    const s = scope();
    const cut = s.sub(s.box(20, 20, 20), s.box(10, 10, 10));
    expect(volume(s.finish(cut))).toBeCloseTo(7000, 3);
  });
});

describe("transforms", () => {
  test("move translates the box without changing its volume", () => {
    const s = scope();
    const moved = s.move(s.box(10, 10, 10), 5, 0, 0);
    const g = s.finish(moved);
    const b = bbox(g);
    expect(b.min[0]).toBeCloseTo(0, 6);
    expect(b.max[0]).toBeCloseTo(10, 6);
    expect(volume(g)).toBeCloseTo(1000, 3);
  });

  test("a 90° Z-swap matrix exchanges the X and Y extents", () => {
    // Column-major 4×4: +90° rotation about Z. Box is 20 wide × 10 deep, so the extents swap.
    const swapZ90: Mat = [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const s = scope();
    const g = s.finish(s.transform(s.box(20, 10, 10), swapZ90));
    const b = bbox(g);
    expect(b.max[0] - b.min[0]).toBeCloseTo(10, 4);
    expect(b.max[1] - b.min[1]).toBeCloseTo(20, 4);
    expect(b.max[2] - b.min[2]).toBeCloseTo(10, 4);
    expect(volume(g)).toBeCloseTo(2000, 3);
  });
});

describe("scope disposal", () => {
  test("finish() frees tracked solids but the returned geometry stays usable", () => {
    const s = scope();
    const g = s.finish(s.box(10, 10, 10));
    // Data was copied out of WASM before disposal, so it survives independently.
    expect(g.getAttribute("position").count).toBeGreaterThan(0);
    expect(volume(g)).toBeCloseTo(1000, 3);
    // A fresh scope after the previous one disposed still builds correctly (heap intact).
    const s2 = scope();
    expect(volume(s2.finish(s2.box(2, 2, 2)))).toBeCloseTo(8, 3);
  });
});
