// Pure-helper tests: option merging, framing math, the dev hook installer, and the creased-normals
// helper. The WebGL wiring in createViewer needs a real GL context and is exercised in the apps, not
// here.

import { Box3, BoxGeometry, Vector3 } from "three";
import { describe, expect, test } from "vite-plus/test";
import {
  creased,
  framingForBox,
  installAppHook,
  resolveViewerOptions,
  VIEWER_DEFAULTS,
} from "./index.ts";

describe("resolveViewerOptions", () => {
  test("fills every field with the deck-box defaults when passed nothing", () => {
    expect(resolveViewerOptions()).toEqual(VIEWER_DEFAULTS);
    expect(VIEWER_DEFAULTS.sunPosition).toEqual([120, -180, 300]);
    expect(VIEWER_DEFAULTS.shadowExtent).toBe(220);
    expect(VIEWER_DEFAULTS.shadowFar).toBe(1200);
    expect(VIEWER_DEFAULTS.groundSize).toBe(3000);
  });

  test("overrides only the given fields (trays values)", () => {
    const merged = resolveViewerOptions({
      sunPosition: [180, -260, 420],
      shadowExtent: 320,
      shadowFar: 1600,
      groundSize: 4000,
    });
    expect(merged).toEqual({
      sunPosition: [180, -260, 420],
      shadowExtent: 320,
      shadowFar: 1600,
      groundSize: 4000,
    });
  });

  test("a partial override leaves the rest at defaults", () => {
    const merged = resolveViewerOptions({ groundSize: 5000 });
    expect(merged.groundSize).toBe(5000);
    expect(merged.shadowExtent).toBe(VIEWER_DEFAULTS.shadowExtent);
    expect(merged.sunPosition).toEqual(VIEWER_DEFAULTS.sunPosition);
  });
});

describe("framingForBox", () => {
  test("returns null for an empty box", () => {
    expect(framingForBox(new Box3())).toBeNull();
  });

  test("frames a centered cube: dist = 1.9·maxDim, near/far scale with size", () => {
    const box = new Box3(new Vector3(-10, -10, -10), new Vector3(10, 10, 10));
    const f = framingForBox(box)!;
    expect(f).not.toBeNull();
    // maxDim = 20, dist = 38
    expect(f.target).toEqual([0, 0, 0]);
    expect(f.position[0]).toBeCloseTo(28.5); // 38 * 0.75
    expect(f.position[1]).toBeCloseTo(-38);
    expect(f.position[2]).toBeCloseTo(26.6); // 38 * 0.7
    expect(f.near).toBeCloseTo(0.2); // 20 / 100
    expect(f.far).toBeCloseTo(1200); // 20 * 60
  });

  test("targets the box center for an off-origin box", () => {
    const box = new Box3(new Vector3(0, 0, 0), new Vector3(4, 6, 2));
    const f = framingForBox(box)!;
    expect(f.target).toEqual([2, 3, 1]);
    // maxDim = 6, dist = 11.4 -> position offset from the center
    expect(f.position[0]).toBeCloseTo(2 + 11.4 * 0.75);
    expect(f.position[1]).toBeCloseTo(3 - 11.4);
    expect(f.position[2]).toBeCloseTo(1 + 11.4 * 0.7);
  });
});

describe("installAppHook", () => {
  test("installs on the target under the default key when enabled", () => {
    const target: Record<string, unknown> = {};
    const hook = { params: { a: 1 } };
    expect(installAppHook(hook, { target, enabled: true })).toBe(true);
    expect(target.__app).toBe(hook);
  });

  test("is a no-op when disabled", () => {
    const target: Record<string, unknown> = {};
    expect(installAppHook({}, { target, enabled: false })).toBe(false);
    expect(target.__app).toBeUndefined();
  });

  test("honours a custom key", () => {
    const target: Record<string, unknown> = {};
    installAppHook({ x: 1 }, { target, enabled: true, key: "__viewer" });
    expect(target.__viewer).toEqual({ x: 1 });
  });
});

describe("creased", () => {
  test("returns a geometry with per-vertex normals and a bounding box", () => {
    const g = creased(new BoxGeometry(10, 20, 30));
    expect(g.getAttribute("normal")).toBeTruthy();
    expect(g.boundingBox).not.toBeNull();
    const size = g.boundingBox!.getSize(new Vector3());
    expect(size.x).toBeCloseTo(10);
    expect(size.y).toBeCloseTo(20);
    expect(size.z).toBeCloseTo(30);
  });
});
