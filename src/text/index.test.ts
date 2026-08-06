import { describe, expect, test } from "vite-plus/test";
import { textGlyphs } from "./index.ts";

describe("textGlyphs", () => {
  test("cap height is exact for a digit run", () => {
    const g = textGlyphs("0123456789", 8);
    expect(g.maxY - g.minY).toBeCloseTo(8, 6);
  });

  test("scales linearly with the requested cap height", () => {
    const small = textGlyphs("240", 4);
    const large = textGlyphs("240", 12);
    expect((large.maxX - large.minX) / (small.maxX - small.minX)).toBeCloseTo(3, 4);
  });

  test("letters and Nordic characters produce outlines", () => {
    const g = textGlyphs("Prusament PLA blågrå", 5);
    expect(g.shapes.length).toBeGreaterThan(15);
    expect(g.maxX - g.minX).toBeGreaterThan(g.maxY - g.minY);
  });

  test("counters arrive as holes, not separate solids", () => {
    const zero = textGlyphs("0", 10);
    expect(zero.shapes).toHaveLength(1);
    expect(zero.shapes[0]!.holes.length).toBeGreaterThanOrEqual(1);
  });

  test("runs start at x=0 within rounding and are cached by (label, size)", () => {
    const a = textGlyphs("temp", 6);
    expect(a.minX).toBeGreaterThanOrEqual(-0.5);
    expect(textGlyphs("temp", 6)).toBe(a);
    expect(textGlyphs("temp", 7)).not.toBe(a);
  });
});
