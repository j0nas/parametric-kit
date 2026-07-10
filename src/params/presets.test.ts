import { describe, expect, test } from "vite-plus/test";
import {
  applyPreset,
  defaults,
  defineParams,
  definePresets,
  matchPreset,
  num,
  pick,
} from "./index.ts";

const schema = defineParams({
  cardCount: num({ def: 100, min: 10, max: 250, step: 1, group: "cards" }),
  cardWidth: num({ def: 66.5, min: 60, max: 72, step: 0.1, group: "cards" }),
  cardHeight: num({ def: 92, min: 85, max: 97, step: 0.1, group: "cards" }),
  cardThickness: num({ def: 0.6, min: 0.25, max: 1.2, step: 0.005, group: "cards" }),
  itemWidth: num({ def: 210, min: 40, max: 400, step: 1, group: "size" }),
  itemLength: num({ def: 297, min: 40, max: 400, step: 1, group: "size" }),
  frontOverhang: num({ def: 0, min: 0, max: 400, step: 1, group: "size", maxKey: "itemLength" }),
  bodyStyle: pick(["solid", "window"] as const, { def: "solid", group: "shell" }),
});

const decks = definePresets<typeof schema>({
  id: "deck",
  label: "Deck preset",
  presets: [
    { name: "Standard (60)", set: { cardCount: 60 } },
    { name: "Commander (100)", set: { cardCount: 100 } },
  ],
});

const sleeves = definePresets<typeof schema>({
  id: "sleeve",
  label: "Sleeves",
  presets: [
    { name: "Standard sleeves", set: { cardWidth: 66.5, cardHeight: 92, cardThickness: 0.6 } },
    { name: "Double sleeved", set: { cardWidth: 68, cardHeight: 93.5, cardThickness: 0.78 } },
  ],
});

// The tray item presets: apply width + length AND force frontOverhang to 0, but stay identified by
// width + length only (matchOn), so raising the overhang afterwards does not drop to "Custom…".
const items = definePresets<typeof schema>({
  id: "item",
  label: "Item preset",
  presets: [
    {
      name: "A4 paper",
      set: { itemWidth: 210, itemLength: 297, frontOverhang: 0 },
      matchOn: ["itemWidth", "itemLength"],
    },
    {
      name: "A5",
      set: { itemWidth: 148, itemLength: 210, frontOverhang: 0 },
      matchOn: ["itemWidth", "itemLength"],
    },
  ],
});

describe("matchPreset", () => {
  test("matches when every match field equals the current params", () => {
    expect(matchPreset(decks, { ...defaults(schema), cardCount: 60 })).toBe("Standard (60)");
    expect(
      matchPreset(sleeves, {
        ...defaults(schema),
        cardWidth: 68,
        cardHeight: 93.5,
        cardThickness: 0.78,
      }),
    ).toBe("Double sleeved");
  });

  test("falls back to Custom (null) when nothing matches", () => {
    expect(matchPreset(decks, { ...defaults(schema), cardCount: 137 })).toBeNull();
    // Sleeve match needs all three fields; one off -> Custom.
    expect(
      matchPreset(sleeves, {
        ...defaults(schema),
        cardWidth: 68,
        cardHeight: 92,
        cardThickness: 0.78,
      }),
    ).toBeNull();
  });

  test("ignores apply-only fields (matchOn subset)", () => {
    const applied = { ...defaults(schema), itemWidth: 210, itemLength: 297, frontOverhang: 0 };
    expect(matchPreset(items, applied)).toBe("A4 paper");
    // Overhang raised after applying -> still A4, because frontOverhang is not in matchOn.
    expect(matchPreset(items, { ...applied, frontOverhang: 50 })).toBe("A4 paper");
    // A different width -> Custom.
    expect(matchPreset(items, { ...applied, itemWidth: 211 })).toBeNull();
  });
});

describe("applyPreset", () => {
  test("writes the preset's set fields in place and reports success", () => {
    const p = defaults(schema);
    expect(applyPreset(sleeves, "Double sleeved", p)).toBe(true);
    expect(p.cardWidth).toBe(68);
    expect(p.cardHeight).toBe(93.5);
    expect(p.cardThickness).toBe(0.78);
    expect(p.cardCount).toBe(100); // untouched
  });

  test("writes apply-only fields too", () => {
    const p = { ...defaults(schema), frontOverhang: 120 };
    applyPreset(items, "A4 paper", p);
    expect(p.itemWidth).toBe(210);
    expect(p.itemLength).toBe(297);
    expect(p.frontOverhang).toBe(0); // forced by the preset, even though not matched on
  });

  test("leaves params untouched and returns false for the Custom sentinel / unknown name", () => {
    const p = defaults(schema);
    expect(applyPreset(decks, "", p)).toBe(false);
    expect(applyPreset(decks, "Nope", p)).toBe(false);
    expect(p).toEqual(defaults(schema));
  });
});
