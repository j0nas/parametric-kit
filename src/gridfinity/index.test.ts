// Spec-level validation of the Gridfinity base: the numbers are the standard's, the meshes
// are checked against them on the real kernel.

import { beforeAll, describe, expect, test } from "vite-plus/test";
import { initCSG, scope } from "../csg/index.ts";
import { bbox, volume } from "../testkit/index.ts";
import {
  BASE_H,
  binHeight,
  binSpan,
  cellCenter,
  FOOT_BOT,
  FOOT_TOP,
  GRID,
  gridfinityBase,
  MAGNET_D,
  MAGNET_H,
  unitsFor,
} from "./index.ts";

beforeAll(async () => {
  await initCSG();
});

describe("units math", () => {
  test("spec constants line up: 41.5 top, 35.6 bed, 4.75 base", () => {
    expect(FOOT_TOP).toBeCloseTo(41.5, 6);
    expect(FOOT_BOT).toBeCloseTo(35.6, 6);
    expect(BASE_H).toBeCloseTo(4.75, 6);
  });

  test("unitsFor covers the requested span, binSpan runs half a mm under pitch", () => {
    expect(unitsFor(41.5)).toBe(1);
    expect(unitsFor(41.6)).toBe(2);
    expect(unitsFor(83.5)).toBe(2);
    expect(binSpan(1)).toBeCloseTo(41.5, 6);
    expect(binSpan(3)).toBeCloseTo(125.5, 6);
  });

  test("binHeight snaps up to whole 7 mm units, never zero", () => {
    expect(binHeight(8.45)).toBe(14);
    expect(binHeight(14)).toBe(14);
    expect(binHeight(0.5)).toBe(7);
  });

  test("cells are centred on the grid", () => {
    expect(cellCenter(2, 1, 0, 0)).toEqual([-GRID / 2, 0]);
    expect(cellCenter(2, 1, 1, 0)).toEqual([GRID / 2, 0]);
    expect(cellCenter(1, 1, 0, 0)).toEqual([0, 0]);
  });
});

describe("gridfinityBase", () => {
  test("a 1×1 base fills 41.5 at the top, stands on 35.6, is 4.75 tall", () => {
    const s = scope();
    const g = s.finish(gridfinityBase(s, 1, 1));
    const b = bbox(g);
    expect(b.max[0] - b.min[0]).toBeCloseTo(FOOT_TOP, 3);
    expect(b.min[2]).toBeCloseTo(0, 6);
    expect(b.max[2]).toBeCloseTo(BASE_H, 6);
    // Volume sits between the bed frustum floor and the top-span prism.
    const v = volume(g);
    expect(v).toBeGreaterThan(FOOT_BOT * FOOT_BOT * BASE_H * 0.9);
    expect(v).toBeLessThan(FOOT_TOP * FOOT_TOP * BASE_H);
  });

  test("a 2×1 base spans two cells and doubles the plastic", () => {
    const s1 = scope();
    const one = volume(s1.finish(gridfinityBase(s1, 1, 1)));
    const s2 = scope();
    const g = s2.finish(gridfinityBase(s2, 2, 1));
    const b = bbox(g);
    expect(b.max[0] - b.min[0]).toBeCloseTo(binSpan(2), 3);
    expect(volume(g) / one).toBeCloseTo(2, 4);
  });

  test("magnet pockets remove four Ø6.5 × 2.4 cylinders per cell", () => {
    const s1 = scope();
    const plain = volume(s1.finish(gridfinityBase(s1, 1, 1)));
    const s2 = scope();
    const magnets = volume(s2.finish(gridfinityBase(s2, 1, 1, { magnets: true })));
    const holes = 4 * Math.PI * (MAGNET_D / 2) ** 2 * MAGNET_H;
    expect(plain - magnets).toBeGreaterThan(holes * 0.9);
    expect(plain - magnets).toBeLessThan(holes * 1.05);
  });
});
