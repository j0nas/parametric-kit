import { BoxGeometry, BufferAttribute, BufferGeometry } from "three";
import { describe, expect, test } from "vite-plus/test";
import { bbox, verticesOnDisc, volume } from "./index.ts";

describe("bbox", () => {
  test("spans the extents of an origin-centred box", () => {
    const b = bbox(new BoxGeometry(2, 4, 6));
    expect(b.min).toEqual([-1, -2, -3]);
    expect(b.max).toEqual([1, 2, 3]);
  });
});

describe("volume", () => {
  test("equals width×depth×height of a closed box mesh", () => {
    expect(volume(new BoxGeometry(2, 2, 2))).toBeCloseTo(8, 6);
    expect(volume(new BoxGeometry(3, 4, 5))).toBeCloseTo(60, 6);
  });
});

describe("verticesOnDisc", () => {
  // Four explicit verts: two sit on the disc plane inside the radius, one is on-plane but too far
  // out, one is inside the radius but off the plane. Only the first two should count.
  const verts: [number, number, number][] = [
    [0, 0, 5], // on plane, centre
    [3, 0, 5], // on plane, inside r=4
    [10, 0, 5], // on plane, outside r=4
    [0, 0, 4.99], // inside r=4 but off plane
  ];
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(verts.flat()), 3));

  test("counts only in-plane verts within the radius", () => {
    expect(verticesOnDisc(g, 0, 0, 5, 4)).toBe(2);
  });

  test("a radius that excludes everything counts zero", () => {
    expect(verticesOnDisc(g, 0, 0, 5, 0.5)).toBe(1); // only the centre vert
    expect(verticesOnDisc(g, 50, 50, 5, 1)).toBe(0);
  });
});
