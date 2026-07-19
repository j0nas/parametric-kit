import { describe, expect, test } from "vite-plus/test";
import { bbox, volume } from "../testkit/index.ts";
import type { Panel } from "./index.ts";
import { panelGeometry } from "./preview.ts";

const panel: Panel = {
  id: "wall",
  outline: [
    [0, 0],
    [10, 0],
    [10, 20],
    [0, 20],
  ],
  holes: [
    [
      [2, 2],
      [2, 6],
      [6, 6],
      [6, 2],
    ],
  ],
  size: [10, 20],
  place: { pos: [0, 0, 0], rot: [0, 0, 0] },
};

describe("panelGeometry", () => {
  test("extrudes outline minus holes to the sheet thickness", () => {
    const g = panelGeometry(panel, 3);
    expect(volume(g)).toBeCloseTo((200 - 16) * 3, 4);
    const b = bbox(g);
    expect(b.min).toEqual([0, 0, 0]);
    expect(b.max[0]).toBeCloseTo(10, 9);
    expect(b.max[1]).toBeCloseTo(20, 9);
    expect(b.max[2]).toBeCloseTo(3, 9);
  });

  test("bakes the world placement into the geometry", () => {
    const placed: Panel = {
      ...panel,
      holes: [],
      place: { pos: [5, 7, 2], rot: [Math.PI / 2, 0, 0] },
    };
    const local = bbox(panelGeometry(placed, 3, { placed: false }));
    expect(local.max[2]).toBeCloseTo(3, 6); // placed:false stays panel-local
    expect(local.max[1]).toBeCloseTo(20, 6);
    const g = panelGeometry(placed, 3);
    const b = bbox(g);
    // Rx(90°): local (u, v, w) -> world (u, -w, v), then +pos
    expect(b.min[0]).toBeCloseTo(5, 6);
    expect(b.max[0]).toBeCloseTo(15, 6);
    expect(b.min[1]).toBeCloseTo(4, 6);
    expect(b.max[1]).toBeCloseTo(7, 6);
    expect(b.min[2]).toBeCloseTo(2, 6);
    expect(b.max[2]).toBeCloseTo(22, 6);
    expect(volume(g)).toBeCloseTo(600, 3);
  });
});
