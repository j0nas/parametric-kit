import { BoxGeometry, Group, Mesh } from "three";
import { expect, test } from "vite-plus/test";
import { stlBinary } from "./index.ts";

// Binary STL is a fixed 84-byte header + 50 bytes per triangle, so the byte length is deterministic.
// three's BoxGeometry is 12 triangles (2 per face).
const STL = (tris: number): number => 84 + 50 * tris;

test("stlBinary emits a deterministic binary STL from a BufferGeometry", () => {
  expect(stlBinary(new BoxGeometry(1, 1, 1)).byteLength).toBe(STL(12));
});

test("stlBinary parses a Mesh as-is", () => {
  expect(stlBinary(new Mesh(new BoxGeometry(2, 3, 4))).byteLength).toBe(STL(12));
});

test("stlBinary traverses an Object3D and sums its meshes", () => {
  const group = new Group();
  group.add(new Mesh(new BoxGeometry(1, 1, 1)), new Mesh(new BoxGeometry(1, 1, 1)));
  expect(stlBinary(group).byteLength).toBe(STL(24));
});
