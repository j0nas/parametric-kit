// Laser-cut flat-panel primitives, extracted from laser-mtg-deck-box and the parametric-shop
// product packages. An app supplies pure `Params -> Panel[]` builders (kerf-compensated outlines
// in panel-local mm); this module supplies the joint math those builders share, the sheet packer,
// the SVG writer and the area accounting — so the cut file, the 3D preview and the price all read
// the same polygons.

export type Pt = [number, number];

export type Place = { pos: [number, number, number]; rot: [number, number, number] };

export type Panel = {
  id: string;
  outline: Pt[]; // closed CCW polygon, panel-local mm, origin at the bbox min corner; first point not repeated
  holes: Pt[][]; // interior cutouts (CW wound)
  size: [number, number]; // outline bounding box, = the blank's nominal envelope
  place: Place;
};

// --- finger-count policy -------------------------------------------------------------------
//
// Largest odd n (>= 3) such that each segment (edgeLen / n) is still >= 0.6 * fingerWidth. Odd n
// means a comb starts and ends with the same element, so each panel edge is symmetric.
export function fingerCount(edgeLen: number, fingerWidth: number): number {
  const minSeg = fingerWidth * 0.6;
  let n = Math.floor(edgeLen / minSeg);
  if (n % 2 === 0) n -= 1;
  if (n < 3) n = 3;
  return n;
}

// Segment i is an "A" element (the material/finger/tab side) iff its parity matches firstIsA.
export function isFinger(i: number, firstIsA: boolean): boolean {
  return (i % 2 === 0) === firstIsA;
}

// --- kerf-adjusted comb breakpoints ---------------------------------------------------------
//
// n+1 breakpoints along [0, length], nominal at i·length/n. With kerf k, every INTERNAL breakpoint
// shifts k/2 toward the slot side of that boundary (fingers grow, slots shrink); the two outer
// breakpoints never move, so the panel's own envelope stays nominal. An interior finger therefore
// grows by a full k, an end finger by k/2 — mirroring how the laser eats k/2 from each cut face.
export function combBreakpoints(
  length: number,
  n: number,
  firstIsA: boolean,
  kerf: number,
): number[] {
  const pts: number[] = [];
  for (let i = 0; i <= n; i++) pts.push((length * i) / n);
  for (let i = 1; i < n; i++) {
    const prevIsFinger = isFinger(i - 1, firstIsA);
    pts[i]! += prevIsFinger ? kerf / 2 : -kerf / 2;
  }
  return pts;
}

export type Interval = { a: number; b: number; finger: boolean };

// The comb as labeled intervals — the unit the tests reason about.
export function combIntervals(
  length: number,
  n: number,
  firstIsA: boolean,
  kerf: number,
): Interval[] {
  const bp = combBreakpoints(length, n, firstIsA, kerf);
  const out: Interval[] = [];
  for (let i = 0; i < n; i++) out.push({ a: bp[i]!, b: bp[i + 1]!, finger: isFinger(i, firstIsA) });
  return out;
}

// --- rotation/placement --------------------------------------------------------------------

// world = Rz(rz)·Ry(ry)·Rx(rx) · local + pos (x-rotation applied first).
export function applyPlace(pt: [number, number, number], place: Place): [number, number, number] {
  const [rx, ry, rz] = place.rot;
  let [x, y, z] = pt;
  // Rx
  [y, z] = [y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)];
  // Ry
  [x, z] = [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
  // Rz
  [x, y] = [x * Math.cos(rz) - y * Math.sin(rz), x * Math.sin(rz) + y * Math.cos(rz)];
  return [x + place.pos[0], y + place.pos[1], z + place.pos[2]];
}

// Column-major 4×4 of the same transform, ready for three.js Matrix4.fromArray().
export function placeMatrix(place: Place): number[] {
  const o = applyPlace([0, 0, 0], place);
  const ex = applyPlace([1, 0, 0], place);
  const ey = applyPlace([0, 1, 0], place);
  const ez = applyPlace([0, 0, 1], place);
  const d = (v: [number, number, number]) => [v[0] - o[0], v[1] - o[1], v[2] - o[2]];
  const [bx, by, bz] = [d(ex), d(ey), d(ez)];
  return [
    bx[0]!,
    bx[1]!,
    bx[2]!,
    0,
    by[0]!,
    by[1]!,
    by[2]!,
    0,
    bz[0]!,
    bz[1]!,
    bz[2]!,
    0,
    o[0],
    o[1],
    o[2],
    1,
  ];
}

// --- outline utilities ----------------------------------------------------------------------

// Drop consecutive duplicate points (1e-9 mm) and an explicit closing point, so outline builders
// can emit segments naively.
export function dedupe(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last[0] - p[0]) > 1e-9 || Math.abs(last[1] - p[1]) > 1e-9) out.push(p);
  }
  const first = out[0]!;
  const last = out[out.length - 1]!;
  if (Math.abs(first[0] - last[0]) < 1e-9 && Math.abs(first[1] - last[1]) < 1e-9) out.pop();
  return out;
}

// A circle as a CW-wound polygon — the winding a Panel hole expects.
export function circleCW(cx: number, cy: number, r: number, segs = 24): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < segs; i++) {
    const th = (-2 * Math.PI * i) / segs; // negative sweep -> CW hole winding
    pts.push([cx + r * Math.cos(th), cy + r * Math.sin(th)]);
  }
  return pts;
}

// --- area accounting -------------------------------------------------------------------------

// One panel's consumed area (mm²) via the shoelace formula: outline minus interior holes.
export function panelArea(panel: Panel): number {
  const shoelace = (pts: Pt[]) => {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i]!;
      const [x2, y2] = pts[(i + 1) % pts.length]!;
      a += x1 * y2 - x2 * y1;
    }
    return Math.abs(a) / 2;
  };
  return panel.holes.reduce((area, hole) => area - shoelace(hole), shoelace(panel.outline));
}

// Total consumed area (mm²) — drives the price and the weight estimate.
export function totalPanelArea(panels: Panel[]): number {
  return panels.reduce((sum, panel) => sum + panelArea(panel), 0);
}

// Area (mm²) consumed from one material group's sheets — the per-material price input.
export function materialPanelArea(
  panels: Panel[],
  materialOf: (panel: Panel) => string | null,
  material: string | null,
): number {
  return panels
    .filter((panel) => materialOf(panel) === material)
    .reduce((sum, panel) => sum + panelArea(panel), 0);
}

// --- sheet packing ---------------------------------------------------------------------------

export type Placement = { panel: Panel; x: number; y: number };
export type Sheet = {
  placements: Placement[];
  /** Material slug this sheet is cut from; null = the body sheet stock. */
  material: string | null;
};
export type Layout = {
  sheets: Sheet[];
  oversize: string[]; // panel ids that cannot fit the sheet at all (readout warns, nothing is cut)
};

export type SheetSpec = {
  sheetW: number;
  sheetH: number;
  /** Part gap: separates parts from each other AND from the sheet edges. */
  gap: number;
};

// Shelf packer for one material group: tallest-first into left-to-right rows, a new sheet when a
// row won't fit. With `pinId` set and that panel present, the pinned panel lands at the FIRST
// sheet's bottom-left corner — partGap in from both edges, whatever the other params do — so a
// user can pre-treat that known spot of the raw sheet (e.g. foil for a marque). Other rows slide
// right past the reserved corner (the panel plus a gap-wide moat on its open sides) when they
// would reach down into it. Bottom-left (not top-left) because the packer puts its tallest rows
// at the top: the reserved corner then coexists with the naturally short last row instead of
// displacing a tall first row.
function pack(group: Panel[], material: string | null, spec: SheetSpec, pinId?: string): Layout {
  const gap = spec.gap;
  const usableW = spec.sheetW - 2 * gap;
  const usableH = spec.sheetH - 2 * gap;
  const pinned = pinId === undefined ? undefined : group.find((pl) => pl.id === pinId);
  const sorted = group
    .filter((pl) => pl !== pinned)
    .sort((a, b) => b.size[1] - a.size[1] || b.size[0] - a.size[0] || a.id.localeCompare(b.id));

  const sheets: Sheet[] = [];
  const oversize: string[] = [];
  let sheet: Sheet = { placements: [], material };
  let x = gap;
  let y = gap;
  let rowH = 0;

  // The reserved corner: the pinned panel plus a gap-wide moat on its open (right and top) sides.
  let corner: { right: number; top: number } | null = null;
  if (pinned) {
    const [w, h] = pinned.size;
    if (w > usableW || h > usableH) {
      oversize.push(pinned.id);
    } else {
      sheet.placements.push({ panel: pinned, x: gap, y: spec.sheetH - gap - h });
      corner = { right: gap + w + gap, top: spec.sheetH - gap - h - gap };
    }
  }

  const openSheet = () => {
    if (sheet.placements.length > 0) sheets.push(sheet);
    sheet = { placements: [], material };
    x = gap;
    y = gap;
    rowH = 0;
    corner = null; // only the first sheet hosts the pinned panel
  };

  for (const panel of sorted) {
    const [w, h] = panel.size;
    if (w > usableW || h > usableH) {
      oversize.push(panel.id);
      continue;
    }
    for (;;) {
      if (y + h > gap + usableH + 1e-9) {
        openSheet();
        continue;
      }
      // Slide right past the reserved corner when this part would reach down into it.
      const px = corner && x < corner.right && y + h > corner.top + 1e-9 ? corner.right : x;
      if (px + w > gap + usableW + 1e-9) {
        if (x === gap && rowH === 0) {
          // A fresh row and still no room: the corner blocks this whole band, and every row
          // below reaches even deeper into it — only a new sheet can help.
          openSheet();
        } else {
          x = gap;
          y += rowH + gap;
          rowH = 0;
        }
        continue;
      }
      sheet.placements.push({ panel, x: px, y });
      x = px + w + gap;
      rowH = Math.max(rowH, h);
      break;
    }
  }
  if (sheet.placements.length > 0) sheets.push(sheet);
  return { sheets, oversize };
}

// Pack panels onto sheets, grouped by material — sheets never mix materials, because they are
// physically different stock on the laser bed. The null (body) group packs first, then each named
// material in slug order. `pin` reserves the first-sheet bottom-left corner of whichever group
// holds that panel (see pack()).
export function layoutSheets(
  panels: Panel[],
  spec: SheetSpec,
  opts: { materialOf?: (panel: Panel) => string | null; pin?: string } = {},
): Layout {
  const materialOf = opts.materialOf ?? (() => null);
  const groups = new Map<string | null, Panel[]>();
  for (const panel of panels) {
    const material = materialOf(panel);
    groups.set(material, [...(groups.get(material) ?? []), panel]);
  }
  const order = [...groups.keys()].sort((a, b) =>
    a === b ? 0 : a === null ? -1 : b === null ? 1 : a.localeCompare(b),
  );
  const sheets: Sheet[] = [];
  const oversize: string[] = [];
  for (const material of order) {
    const packed = pack(groups.get(material) ?? [], material, spec, opts.pin);
    sheets.push(...packed.sheets);
    oversize.push(...packed.oversize);
  }
  return { sheets, oversize };
}

// Download-name fragment for sheet idx, e.g. "sheet-2-acrylic": material sheets carry their slug
// so two stocks can never be mixed up at the laser. The app prepends its filename stem.
export function sheetLabel(sheets: Sheet[], idx: number): string {
  const material = sheets[idx]?.material;
  return `sheet-${idx + 1}${material ? `-${material}` : ""}`;
}

// --- SVG export ------------------------------------------------------------------------------

// mm to at most 3 decimals — SVG-attribute friendly, also used by app filename stems.
export const fmtMm = (n: number): string => String(Math.round(n * 1000) / 1000);

// One closed subpath. Panel outlines are y-up; SVG is y-down, so flip within the panel's own height.
function subpath(pts: Pt[], ox: number, oy: number, panelH: number): string {
  const d = pts.map(
    ([x, y], i) => `${i === 0 ? "M" : "L"}${fmtMm(ox + x)} ${fmtMm(oy + panelH - y)}`,
  );
  return `${d.join("")}Z`;
}

// A full sheet as a standalone SVG in real millimetre units: hairline red cut strokes, one path per
// panel (outline + interior holes as subpaths), ids preserved for laser software that shows them.
// `prelude` is raw markup inserted BEFORE the cut paths (e.g. filled engrave/foil layers, so a
// laser processes them first and the cut releases the part last).
export function sheetSvg(
  sheet: Sheet,
  spec: { sheetW: number; sheetH: number },
  opts: { prelude?: string } = {},
): string {
  const paths = sheet.placements
    .map(({ panel, x, y }) => {
      const h = panel.size[1];
      const d = [subpath(panel.outline, x, y, h), ...panel.holes.map((ho) => subpath(ho, x, y, h))];
      return `  <path id="${panel.id}" d="${d.join(" ")}" fill="none" stroke="#ff0000" stroke-width="0.1"/>`;
    })
    .join("\n");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmtMm(spec.sheetW)}mm" height="${fmtMm(spec.sheetH)}mm" viewBox="0 0 ${fmtMm(spec.sheetW)} ${fmtMm(spec.sheetH)}">`,
    ...(opts.prelude ? [opts.prelude] : []),
    paths,
    `</svg>`,
    ``,
  ].join("\n");
}
