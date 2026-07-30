// The shared profiles replaced byte-identical copies in four consuming apps, so their
// exact point output is contract: a drifting vertex here moves geometry in every shop
// product at once.

import { describe, expect, test } from "vite-plus/test";
import { circle, circleAt, regularPolygon, roundedRect, roundedRectInto } from "./index.ts";
import { Path } from "three";

const bounds = (pts: { x: number; y: number }[]) => ({
  minX: Math.min(...pts.map((p) => p.x)),
  maxX: Math.max(...pts.map((p) => p.x)),
  minY: Math.min(...pts.map((p) => p.y)),
  maxY: Math.max(...pts.map((p) => p.y)),
});

describe("circle / circleAt", () => {
  test("circle spans its diameter, centred on the origin", () => {
    const b = bounds(circle(5).getPoints(64));
    expect(b.minX).toBeCloseTo(-5, 3);
    expect(b.maxX).toBeCloseTo(5, 3);
    expect(b.minY).toBeCloseTo(-5, 3);
    expect(b.maxY).toBeCloseTo(5, 3);
  });

  test("circleAt carries its centre", () => {
    const b = bounds(circleAt(10, -4, 2).getPoints(64));
    expect((b.minX + b.maxX) / 2).toBeCloseTo(10, 3);
    expect((b.minY + b.maxY) / 2).toBeCloseTo(-4, 3);
  });
});

describe("roundedRect", () => {
  test("keeps the advertised footprint at any radius", () => {
    for (const r of [0, 2, 100]) {
      const b = bounds(roundedRect(30, 20, r).getPoints(32));
      expect(b.maxX - b.minX).toBeCloseTo(30, 3);
      expect(b.maxY - b.minY).toBeCloseTo(20, 3);
    }
  });

  test("r = 0 degenerates to exactly four corners", () => {
    const pts = roundedRect(30, 20, 0).getPoints(1);
    const uniq = new Set(pts.map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`));
    expect(uniq.size).toBe(4);
  });

  test("squareFront squares only the −Y corners", () => {
    const pts = roundedRect(30, 20, 3, true).getPoints(32);
    // Square front corners: the extreme corner point itself is on the outline…
    expect(pts.some((p) => p.x === -15 && p.y === -10)).toBe(true);
    expect(pts.some((p) => p.x === 15 && p.y === -10)).toBe(true);
    // …while the rounded back corners never reach theirs.
    expect(pts.some((p) => p.x === 15 && p.y === 10)).toBe(false);
  });

  test("roundedRectInto onto a Path yields the same outline (for ring holes)", () => {
    const a = roundedRect(30, 20, 3).getPoints(16);
    const b = roundedRectInto(new Path(), 30, 20, 3).getPoints(16);
    expect(b.length).toBe(a.length);
    for (let i = 0; i < a.length; i++) {
      expect(b[i].x).toBeCloseTo(a[i].x, 6);
      expect(b[i].y).toBeCloseTo(a[i].y, 6);
    }
  });
});

describe("regularPolygon", () => {
  test("n vertices on the circumradius, first at rot", () => {
    const pts = regularPolygon(6, 10, Math.PI / 2).getPoints(1);
    const uniq = new Set(pts.map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`));
    expect(uniq.size).toBe(6);
    // rot = π/2 → point-up: the first vertex sits on +Y.
    expect(pts[0].x).toBeCloseTo(0, 4);
    expect(pts[0].y).toBeCloseTo(10, 4);
    for (const p of pts) expect(Math.hypot(p.x, p.y)).toBeCloseTo(10, 4);
  });

  test("optional centre offsets every vertex", () => {
    const pts = regularPolygon(5, 4, 0, 7, -3).getPoints(1);
    for (const p of pts) expect(Math.hypot(p.x - 7, p.y + 3)).toBeCloseTo(4, 4);
  });
});
