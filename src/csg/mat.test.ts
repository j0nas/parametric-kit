// Two layers of proof for the named transforms: the literals equal the mathematically
// derived rotation matrices, and a real extrusion lands where the doc comment promises
// (the second catches a doc/literal mismatch the first can't).

import { beforeAll, describe, expect, test } from "vite-plus/test";
import { bbox } from "../testkit/index.ts";
import { circle, roundedRect } from "../shapes/index.ts";
import {
  AXIS_CYCLE,
  AXIS_CYCLE_INV,
  ROT_X_90,
  ROT_X_270,
  ROT_Y_90,
  ROT_Y_270,
  ROT_Z_90,
  ROT_Z_270,
  initCSG,
  rotZDeg,
  scope,
  type Mat,
} from "./index.ts";

beforeAll(async () => {
  await initCSG();
});

/** Column-major rotation about one axis, derived from cos/sin — the ground truth. */
function rotation(axis: "x" | "y" | "z", deg: number): Mat {
  const a = (deg * Math.PI) / 180;
  const c = Math.round(Math.cos(a));
  const s = Math.round(Math.sin(a));
  if (axis === "x") return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
  if (axis === "y") return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

describe("quarter-turn literals match derived rotations", () => {
  test.each([
    ["ROT_X_90", ROT_X_90, rotation("x", 90)],
    ["ROT_X_270", ROT_X_270, rotation("x", -90)],
    ["ROT_Y_90", ROT_Y_90, rotation("y", 90)],
    ["ROT_Y_270", ROT_Y_270, rotation("y", -90)],
    ["ROT_Z_90", ROT_Z_90, rotation("z", 90)],
    ["ROT_Z_270", ROT_Z_270, rotation("z", -90)],
  ] as const)("%s", (_name, literal, derived) => {
    expect([...literal]).toEqual([...derived]);
  });

  test("rotZDeg agrees with the exact Z quarter-turns", () => {
    expect(rotZDeg(90).map(Math.round)).toEqual([...ROT_Z_90]);
    expect(rotZDeg(-90).map(Math.round)).toEqual([...ROT_Z_270]);
  });
});

describe("transformed extrusions land as documented", () => {
  // A 30×20 profile extruded 5 up +Z: distinct spans on every axis, so any wrong
  // axis mapping shows up in the bbox.
  const build = (m: Mat) => {
    const s = scope();
    return s.finish(s.transform(s.extrude(roundedRect(30, 20, 0), 5), m));
  };
  const spans = (m: Mat) => {
    const b = bbox(build(m));
    return [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
  };

  test("ROT_X_90 sends the extrusion along −Y", () => {
    expect(spans(ROT_X_90)).toEqual([30, 5, 20]);
    const b = bbox(build(ROT_X_90));
    expect(b.max[1]).toBeCloseTo(0, 4); // extrusion went into −Y
  });

  test("ROT_X_270 sends the extrusion along +Y", () => {
    const b = bbox(build(ROT_X_270));
    expect(b.min[1]).toBeCloseTo(0, 4);
    expect(b.max[1]).toBeCloseTo(5, 4);
  });

  test("ROT_Y_90 lays the extrusion along +X", () => {
    expect(spans(ROT_Y_90)).toEqual([5, 20, 30]);
    const b = bbox(build(ROT_Y_90));
    expect(b.min[0]).toBeCloseTo(0, 4);
  });

  test("AXIS_CYCLE stands the profile up facing +X (extrusion → +X)", () => {
    expect(spans(AXIS_CYCLE)).toEqual([5, 30, 20]);
    const b = bbox(build(AXIS_CYCLE));
    expect(b.min[0]).toBeCloseTo(0, 4);
  });

  test("AXIS_CYCLE_INV inverts AXIS_CYCLE", () => {
    const s = scope();
    const g = s.finish(
      s.transform(s.transform(s.extrude(circle(4), 9, 32), AXIS_CYCLE), AXIS_CYCLE_INV),
    );
    const b = bbox(g);
    expect(b.max[2] - b.min[2]).toBeCloseTo(9, 4); // back in the original orientation
    expect(b.min[2]).toBeCloseTo(0, 4);
  });
});
