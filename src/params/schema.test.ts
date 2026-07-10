import { describe, expect, test } from "vite-plus/test";
import {
  clampCeilings,
  defaults,
  defineParams,
  type Infer,
  num,
  pick,
  sanitize,
  toggle,
} from "./index.ts";

// A schema mirroring the deck box's persisted fields, so the sanitize suite below is a faithful copy
// of parametric-mtg-deck-box's `describe("sanitizeParams", …)`.
const schema = defineParams({
  cardCount: num({ def: 100, min: 10, max: 250, step: 1, group: "cards", label: "Card count" }),
  cardThickness: num({ def: 0.6, min: 0.25, max: 1.2, step: 0.005, group: "cards" }),
  wall: num({ def: 3, min: 2, max: 4.4, step: 0.2, group: "shell" }),
  stackRidge: toggle({ def: true, group: "stack" }),
  lidStyle: pick(["friction", "snap", "magnet"] as const, { def: "friction", group: "lid" }),
  bodyStyle: pick(["solid", "window", "slots", "hex"] as const, { def: "solid", group: "shell" }),
});
type Params = Infer<typeof schema>;
const def = defaults(schema);

describe("Infer / defaults", () => {
  test("infers number / boolean / string-literal-union value types from the schema", () => {
    // The explicit annotations are the compile-time check (enforced by `vp check`); the asserts keep
    // the test meaningful under the runtime runner, which strips types without checking them.
    const count: number = def.cardCount;
    const ridge: boolean = def.stackRidge;
    const lid: "friction" | "snap" | "magnet" = def.lidStyle;
    const body: "solid" | "window" | "slots" | "hex" = def.bodyStyle;
    expect(count).toBe(100);
    expect(ridge).toBe(true);
    expect(lid).toBe("friction");
    expect(body).toBe("solid");
  });

  test("defaults reads every field's def, and returns a fresh object each call", () => {
    expect(def).toEqual({
      cardCount: 100,
      cardThickness: 0.6,
      wall: 3,
      stackRidge: true,
      lidStyle: "friction",
      bodyStyle: "solid",
    });
    expect(defaults(schema)).not.toBe(def);
  });
});

describe("sanitize", () => {
  test("accepts a valid stored blob", () => {
    const stored: Params = { ...def, cardCount: 60, wall: 2.4 };
    const out = sanitize(schema, stored);
    expect(out.cardCount).toBe(60);
    expect(out.wall).toBe(2.4);
  });

  test("rejects wrong types, unknown keys, and non-finite values", () => {
    const out = sanitize(schema, {
      cardCount: "lots", // wrong type -> default
      cardThickness: null, // JSON'd NaN/Infinity -> default
      injected: 999, // unknown key -> dropped
    });
    expect(out.cardCount).toBe(def.cardCount);
    expect(out.cardThickness).toBe(def.cardThickness);
    expect("injected" in out).toBe(false);
  });

  test("rejects a wrong-typed toggle and keeps the default", () => {
    expect(sanitize(schema, { stackRidge: "true" }).stackRidge).toBe(true);
    expect(sanitize(schema, { stackRidge: false }).stackRidge).toBe(false);
  });

  test("pins lidStyle and bodyStyle to the known options", () => {
    expect(sanitize(schema, { lidStyle: "snap" }).lidStyle).toBe("snap");
    expect(sanitize(schema, { lidStyle: "banana" }).lidStyle).toBe(def.lidStyle);
    expect(sanitize(schema, { lidStyle: 3 }).lidStyle).toBe(def.lidStyle);
    expect(sanitize(schema, { bodyStyle: "hex" }).bodyStyle).toBe("hex");
    expect(sanitize(schema, { bodyStyle: "lace" }).bodyStyle).toBe(def.bodyStyle);
  });

  test("survives junk roots", () => {
    expect(sanitize(schema, null)).toEqual(def);
    expect(sanitize(schema, "junk")).toEqual(def);
    expect(sanitize(schema, 42)).toEqual(def);
  });
});

describe("clampCeilings", () => {
  const ceilSchema = defineParams({
    lipHeight: num({ def: 13, min: 6, max: 25, step: 0.5, group: "lid" }),
    notchDepth: num({ def: 11, min: 4, max: 25, step: 0.5, group: "notch", maxKey: "lipHeight" }),
    notchWidth: num({ def: 20, min: 0, max: 40, step: 1, group: "notch" }),
  });

  test("clamps a maxKey field down to the field it tracks", () => {
    const p = { ...defaults(ceilSchema), lipHeight: 13, notchDepth: 20, notchWidth: 20 };
    clampCeilings(ceilSchema, p);
    expect(p.notchDepth).toBe(13); // clamped to lipHeight
    expect(p.notchWidth).toBe(20); // no maxKey -> untouched
  });

  test("leaves a maxKey field alone when it is under its ceiling", () => {
    const p = { ...defaults(ceilSchema), lipHeight: 25, notchDepth: 11 };
    clampCeilings(ceilSchema, p);
    expect(p.notchDepth).toBe(11);
  });
});
