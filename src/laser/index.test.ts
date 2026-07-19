import { describe, expect, test } from "vite-plus/test";
import { signedArea } from "../testkit/index.ts";
import {
  applyPlace,
  circleCW,
  combBreakpoints,
  combIntervals,
  dedupe,
  fingerCount,
  isFinger,
  layoutSheets,
  materialPanelArea,
  panelArea,
  type Panel,
  type Place,
  placeMatrix,
  sheetLabel,
  sheetSvg,
  totalPanelArea,
} from "./index.ts";

const rect = (id: string, w: number, h: number): Panel => ({
  id,
  outline: [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ],
  holes: [],
  size: [w, h],
  place: { pos: [0, 0, 0], rot: [0, 0, 0] },
});

describe("fingerCount", () => {
  test("largest odd n with segments >= 0.6 * fingerWidth, floor 3", () => {
    expect(fingerCount(100, 10)).toBe(15); // 100/6 = 16.67 -> 16 -> odd 15
    expect(fingerCount(60, 10)).toBe(9); // 60/6 = 10 -> even -> 9
    expect(fingerCount(5, 10)).toBe(3); // tiny edge still gets the 3 floor
    expect(fingerCount(100, 10) % 2).toBe(1);
  });
});

describe("combBreakpoints", () => {
  test("outer breakpoints never move; internal ones shift k/2 toward the slot", () => {
    const k = 0.2;
    const bp = combBreakpoints(30, 3, true, k); // finger, slot, finger
    expect(bp[0]).toBe(0);
    expect(bp[3]).toBe(30);
    expect(bp[1]).toBeCloseTo(10 + k / 2, 9); // finger before -> grows right
    expect(bp[2]).toBeCloseTo(20 - k / 2, 9); // slot before -> shrinks from the left
  });

  test("intervals partition the edge and complementary phases mirror", () => {
    const iv = combIntervals(40, 5, true, 0.2);
    expect(iv).toHaveLength(5);
    expect(iv[0]!.a).toBe(0);
    expect(iv[4]!.b).toBe(40);
    for (let i = 1; i < iv.length; i++) expect(iv[i]!.a).toBe(iv[i - 1]!.b);
    const mate = combIntervals(40, 5, false, 0.2);
    iv.forEach((seg, i) => expect(seg.finger).toBe(!mate[i]!.finger));
    expect(isFinger(0, true)).toBe(true);
    expect(isFinger(1, true)).toBe(false);
  });
});

describe("placement", () => {
  const place: Place = { pos: [5, -2, 3], rot: [Math.PI / 2, 0, Math.PI / 2] };

  test("applyPlace applies Rz·Ry·Rx then the offset", () => {
    const [x, y, z] = applyPlace([1, 2, 0], place);
    // Rx(90°): (1,2,0)->(1,0,2); Rz(90°): ->(0,1,2); +pos
    expect(x).toBeCloseTo(5, 9);
    expect(y).toBeCloseTo(-1, 9);
    expect(z).toBeCloseTo(5, 9);
  });

  test("placeMatrix agrees with applyPlace on arbitrary points", () => {
    const m = placeMatrix(place);
    for (const pt of [
      [0, 0, 0],
      [1, 2, 3],
      [-4, 0.5, 2],
    ] as [number, number, number][]) {
      const direct = applyPlace(pt, place);
      const viaM = [
        m[0]! * pt[0] + m[4]! * pt[1] + m[8]! * pt[2] + m[12]!,
        m[1]! * pt[0] + m[5]! * pt[1] + m[9]! * pt[2] + m[13]!,
        m[2]! * pt[0] + m[6]! * pt[1] + m[10]! * pt[2] + m[14]!,
      ];
      viaM.forEach((v, i) => expect(v).toBeCloseTo(direct[i]!, 9));
    }
  });
});

describe("outline utilities", () => {
  test("dedupe drops consecutive duplicates and the explicit closing point", () => {
    expect(
      dedupe([
        [0, 0],
        [1, 0],
        [1, 0],
        [1, 1],
        [0, 0],
      ]),
    ).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
    ]);
  });

  test("circleCW winds clockwise (negative shoelace in y-up)", () => {
    const c = circleCW(10, 10, 3);
    expect(c).toHaveLength(24);
    expect(signedArea(c)).toBeLessThan(0);
    expect(circleCW(0, 0, 1, 8)).toHaveLength(8);
  });
});

describe("areas", () => {
  test("panelArea subtracts holes; totals sum across panels", () => {
    const withHole: Panel = {
      ...rect("a", 10, 20),
      holes: [
        [
          [2, 2],
          [2, 6],
          [6, 6],
          [6, 2],
        ],
      ],
    };
    expect(panelArea(withHole)).toBeCloseTo(200 - 16, 9);
    expect(totalPanelArea([withHole, rect("b", 5, 5)])).toBeCloseTo(184 + 25, 9);
  });

  test("materialPanelArea partitions the total across material groups", () => {
    const panels = [rect("a", 10, 10), rect("b", 5, 5), rect("c", 4, 4)];
    const materialOf = (p: Panel) => (p.id === "c" ? "acrylic" : null);
    const body = materialPanelArea(panels, materialOf, null);
    const acrylic = materialPanelArea(panels, materialOf, "acrylic");
    expect(body).toBeCloseTo(125, 9);
    expect(acrylic).toBeCloseTo(16, 9);
    expect(body + acrylic).toBeCloseTo(totalPanelArea(panels), 9);
  });
});

const SPEC = { sheetW: 100, sheetH: 100, gap: 5 };

describe("layoutSheets", () => {
  test("packs tallest-first with gap margins, everything inside the sheet", () => {
    const { sheets, oversize } = layoutSheets(
      [rect("a", 30, 40), rect("b", 30, 20), rect("c", 30, 60)],
      SPEC,
    );
    expect(oversize).toEqual([]);
    expect(sheets).toHaveLength(1);
    const placed = sheets[0]!.placements;
    expect(placed[0]!.panel.id).toBe("c"); // tallest first
    for (const { panel, x, y } of placed) {
      expect(x).toBeGreaterThanOrEqual(SPEC.gap);
      expect(y).toBeGreaterThanOrEqual(SPEC.gap);
      expect(x + panel.size[0]).toBeLessThanOrEqual(SPEC.sheetW - SPEC.gap + 1e-9);
      expect(y + panel.size[1]).toBeLessThanOrEqual(SPEC.sheetH - SPEC.gap + 1e-9);
    }
  });

  test("opens a new sheet when a row cannot fit and reports oversize panels", () => {
    const { sheets, oversize } = layoutSheets(
      [rect("a", 80, 80), rect("b", 80, 80), rect("huge", 200, 10)],
      SPEC,
    );
    expect(sheets).toHaveLength(2);
    expect(oversize).toEqual(["huge"]);
  });

  test("no two placements overlap (gap respected)", () => {
    const { sheets } = layoutSheets(
      Array.from({ length: 8 }, (_, i) => rect(`p${i}`, 25 + i, 20 + 2 * i)),
      SPEC,
    );
    for (const sheet of sheets) {
      const boxes = sheet.placements.map(({ panel, x, y }) => ({
        x0: x,
        y0: y,
        x1: x + panel.size[0],
        y1: y + panel.size[1],
      }));
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i]!;
          const b = boxes[j]!;
          const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
          expect(overlap).toBe(false);
        }
    }
  });

  test("pin reserves the first sheet's bottom-left corner", () => {
    const { sheets } = layoutSheets(
      [rect("lid", 40, 30), rect("a", 40, 40), rect("b", 40, 40)],
      SPEC,
      { pin: "lid" },
    );
    const lid = sheets[0]!.placements.find((pl) => pl.panel.id === "lid")!;
    expect(lid.x).toBe(SPEC.gap);
    expect(lid.y).toBe(SPEC.sheetH - SPEC.gap - 30);
    // later sheets never host the pinned panel again
    for (const sheet of sheets.slice(1))
      expect(sheet.placements.some((pl) => pl.panel.id === "lid")).toBe(false);
  });

  test("materials never share a sheet; body group first, then slug order", () => {
    const materialOf = (p: Panel) =>
      p.id.startsWith("ac-") ? "acrylic" : p.id.startsWith("br-") ? "brass" : null;
    const { sheets } = layoutSheets(
      [rect("ac-1", 20, 20), rect("body", 20, 20), rect("br-1", 20, 20)],
      SPEC,
      { materialOf },
    );
    expect(sheets.map((s) => s.material)).toEqual([null, "acrylic", "brass"]);
    for (const sheet of sheets)
      for (const { panel } of sheet.placements) expect(materialOf(panel)).toBe(sheet.material);
  });
});

describe("sheetLabel", () => {
  test("carries the material slug, 1-based", () => {
    const sheets = [
      { placements: [], material: null },
      { placements: [], material: "acrylic" },
    ];
    expect(sheetLabel(sheets, 0)).toBe("sheet-1");
    expect(sheetLabel(sheets, 1)).toBe("sheet-2-acrylic");
    expect(sheetLabel(sheets, 5)).toBe("sheet-6");
  });
});

describe("sheetSvg", () => {
  const panel: Panel = {
    ...rect("wall", 10, 20),
    holes: [
      [
        [2, 2],
        [2, 6],
        [6, 6],
        [6, 2],
      ],
    ],
  };

  test("real-mm document, one path per panel, holes as subpaths, y flipped", () => {
    const svg = sheetSvg({ placements: [{ panel, x: 5, y: 5 }], material: null }, SPEC);
    expect(svg).toContain(`width="100mm" height="100mm" viewBox="0 0 100 100"`);
    expect(svg).toContain(`id="wall"`);
    expect((svg.match(/<path /g) ?? []).length).toBe(1);
    expect((svg.match(/Z/g) ?? []).length).toBe(2); // outline + hole
    // panel-local (0,0) lands at oy + panelH (y-down flip)
    expect(svg).toContain(`M5 25`);
  });

  test("prelude markup lands before the cut paths", () => {
    const svg = sheetSvg({ placements: [{ panel, x: 5, y: 5 }], material: null }, SPEC, {
      prelude: `  <g id="marque"/>`,
    });
    expect(svg.indexOf(`id="marque"`)).toBeGreaterThan(-1);
    expect(svg.indexOf(`id="marque"`)).toBeLessThan(svg.indexOf(`id="wall"`));
  });
});
