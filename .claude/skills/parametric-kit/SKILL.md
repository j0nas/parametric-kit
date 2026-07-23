---
name: parametric-kit
description: Building or modifying a browser-based parametric fabrication-file generator app — 3D printing (manifold-3d CSG → STL) or laser cutting (2D panel outlines → SVG), both with a tuned Three.js preview built from the same geometry that exports — or consuming/extending the parametric-kit library (subpath modules /csg /params /viewer /readout /export /laser /testkit). Load when writing a param schema, dims(), pure geometry/panel builders, viewer/panel wiring, or the GitHub-Pages + jonas-jensen.com deploy for such an app.
---

# parametric-kit

`parametric-kit` is the extracted, tested core of two proven generators (parametric-mtg-deck-box,
a4-stackable-trays). It ships the plumbing; an app writes only what makes it unique.

## Architecture (memorise this)

An app = **a param schema + a `dims()` + pure geometry builders**; everything else comes from the
kit. All units are **millimetres, Z-up**, and every model is built **in print orientation** (base on
z=0, support-free). The preview mesh and the exported STL come from the **same builder calls**, so
they can never drift. Builders are pure `Params -> BufferGeometry` (no DOM, no globals) so the
viewer, the STL export, and the Node geometry tests share one source of truth.

Repo layout of a consuming app: `src/params.ts` (schema + `dims()` + constants), `src/shapes.ts`
(2D `THREE.Shape` profiles), `src/<model>.ts` (builders), `src/main.ts` (wiring), `src/<model>.test.ts`.

## Setup: the WASM kernel

`initCSG()` loads the Manifold WASM kernel once and **must be awaited before any geometry is built**.

```ts
import wasmUrl from "manifold-3d/manifold.wasm?url"; // Vite resolves & bundles the wasm
import { initCSG } from "parametric-kit/csg";
await initCSG(wasmUrl); // BROWSER: pass the ?url so Emscripten's locateFile fetches it
// await initCSG();       // NODE/tests: no arg — the loader finds the wasm next to its module
```

Keep the `?url` import in the browser entry only (`main.ts`); it would break plain Node. Peer deps:
`three` (>=0.180) and `manifold-3d` (**pinned to exactly 3.5.1** — see gotchas).

## Module: `parametric-kit/csg`

`scope()` returns a build scope whose ops all return fresh `Solid`s (Manifold is immutable) that it
**tracks and frees in `finish()`** — so callers never call `.delete()` and the WASM heap never grows
across rebuilds. Lifetime rules: build entirely through `s.*` helpers; call `finish(final)` **exactly
once** per scope — it returns the `BufferGeometry` and deletes every tracked solid; **never retain a
`Solid` after `finish()`**, and never let a raw Manifold object escape a scope unfinished. One scope
per build call.

```ts
import { scope } from "parametric-kit/csg";
import { roundedRect, circle } from "./shapes.ts";

export function buildBody(p: Params): BufferGeometry {
  const d = dims(p);
  const s = scope();
  let body = s.extrude(roundedRect(d.outerW, d.outerD, d.outerR), d.shoulderZ);
  const cavity = s.move(
    s.extrude(roundedRect(d.innerW, d.innerD, d.innerR), d.bodyH),
    0,
    0,
    p.floor,
  );
  body = s.sub(body, cavity); // subtract; also add / union / intersect / move / transform
  if (p.holeD > 0)
    body = s.sub(body, s.move(s.extrude(circle(p.holeD / 2), p.floor + 2, 32), 0, 0, -1));
  return s.finish(body); // extracts geometry, frees everything tracked
}
```

Scope surface (verify signatures against `src/csg/index.ts` when in doubt):

- `extrude(shape, height, curveSegments=12, scaleTop={x,y})` — extrude a `THREE.Shape` (its `.holes`
  read as holes, EvenOdd) up +Z from z=0. `scaleTop<1` tapers into a frustum about the local origin.
- `box(w,d,h)` origin-centred · `union(parts[])` · `sub(a,b)` · `add(a,b)` · `intersect(a,b)`
- `move(a,x,y,z)` · `transform(a, mat)` — column-major 4×4 for exact 90° axis swaps (stand a
  face-plane profile upright, lay a cylinder on its side).
- `finish(final) -> BufferGeometry` — positions + index only; **the caller computes normals** (use
  `creased()` from the viewer module). Types: `Solid`, `Mat`, `Scope`.

2D profiles (`roundedRect`, `circle`, `teardropWindow`, `hexagon`, `notchSlot`, …) are plain
`THREE.Shape` builders that **stay in the app** — they are model-specific. The only three.js↔Manifold
conversion the kit does is the final `getMesh()` in `finish()`.

## Module: `parametric-kit/params`

One field declaration yields the `Params` type, defaults, the storage sanitizer, and the panel row.

```ts
import { defineParams, num, pick, toggle, type Infer } from "parametric-kit/params";

export const schema = defineParams({
  cardCount: num({ def: 100, min: 10, max: 250, step: 1, group: "cards", label: "Card count" }),
  wall: num({ def: 3, min: 2, max: 4.4, step: 0.2, group: "shell", label: "Wall thickness" }),
  lipHeight: num({ def: 13, min: 6, max: 25, step: 0.5, group: "lid", label: "Lip height" }),
  notchDepth: num({
    def: 11,
    min: 4,
    max: 25,
    step: 0.5,
    group: "notch",
    label: "Notch depth",
    maxKey: "lipHeight",
  }), // ceiling tracks lipHeight's live value
  bodyStyle: pick(["solid", "window", "slots", "hex"] as const, {
    def: "solid",
    group: "shell",
    label: "Body style",
    optionLabels: { hex: "Honeycomb" },
  }),
  lidStyle: pick(["friction", "snap", "magnet"] as const, {
    def: "friction",
    group: "lid",
    label: "Closure",
  }),
  stackRidge: toggle({ def: true, group: "stack", label: "Stacking ridge" }),
});
export type Params = Infer<typeof schema>;
```

- `defaults(schema)` → a fresh `Params` of every `.def`. `sanitize(schema, raw)` rebuilds a clean
  `Params` from untrusted storage (see contract in gotchas). `clampCeilings(schema, params)` clamps
  every `maxKey` field down to the field it tracks (the panel does this on first paint; call it
  yourself if you consume params before rendering the panel).

**Store** (versioned localStorage, degrades to defaults on private-mode / bad JSON / non-browser):

```ts
import { createStore } from "parametric-kit/params";
const store = createStore(schema, { key: "mtg-deck-box:params", version: 1 }); // key -> "...:v1"
const params: Params = store.load(); // sanitized stored blob, or defaults
// on change: store.save(params);  reset: store.clear(); Object.assign(params, store.defaults);
```

**Presets** — one `<select>` that writes several fields; `matchOn` lets a preset write a field it is
NOT identified by (so raising it afterwards doesn't drop the select to "Custom…"):

```ts
import { definePresets } from "parametric-kit/params";
const decks = definePresets<typeof schema>({
  id: "deck",
  label: "Deck preset",
  presets: [
    { name: "Standard (60)", set: { cardCount: 60 } },
    { name: "Commander (100)", set: { cardCount: 100 } },
  ],
});
const items = definePresets<typeof schema>({
  id: "item",
  label: "Item preset",
  presets: [
    {
      name: "A4",
      set: { itemWidth: 210, itemLength: 297, frontOverhang: 0 },
      matchOn: ["itemWidth", "itemLength"],
    },
  ],
});
```

**Panel** — `renderPanel(container, schema, params, opts)` builds the whole control panel and returns
`{ sync, refresh }`. It **mutates `params` in place** and calls `onChange(params)` after every edit.
Give it its own empty container (it appends `<section class="group">…`; keep your static h1 /
readout / buttons outside it).

```ts
import { renderPanel } from "parametric-kit/params";
const panel = renderPanel(document.getElementById("controls")!, schema, params, {
  presets: [decks, items],
  collapsible: { key: "my-app:collapse:v1" }, // optional accordion; true = no persisted state
  groups: [
    { id: "cards", title: "Cards", presets: ["deck"], open: true }, // presets render at the top of this block
    { id: "shell", title: "Shell" },
    { id: "opening", visibleWhen: (p) => p.bodyStyle !== "solid" }, // no title -> continues "Shell" section
    { id: "lid", title: "Lid", hint: (p) => CLOSURE_HINTS[p.lidStyle] }, // hint: string | (p)=>string
    { id: "snap", visibleWhen: (p) => p.lidStyle === "snap" },
    { id: "magnet", visibleWhen: (p) => p.lidStyle === "magnet" },
  ],
  onChange: () => scheduleRebuild(), // your rAF-coalesced rebuild
});
// after mutating params OUTSIDE the panel (reset, preset applied elsewhere): panel.sync();
// refresh() re-evaluates visibility/hints/preset selection only, without rewriting inputs.
```

Group semantics: a `title` opens a new `<section class="group">`; a **title-less group continues the
current section** — that is how one visual section holds several independently-hideable groups.
`maxKey` makes a num slider's ceiling track another field. The panel emits these class names for you
to style: `.group` (section) · `.row` (num slider) · `.sel` (pick / preset select) · `.toggle`
(checkbox) · `.sub` (hint). renderPanel calls `sync()` itself on first paint (normalising ceilings).

Accordion: with `collapsible` set, every titled group renders `<details class="group"><summary><h2>`
instead of a plain section (title-less groups still continue the current one, so they collapse with
it). Sections default CLOSED — mark the primary group `open: true`. `{ key }` persists the user's
toggles in localStorage as a `{groupId: boolean}` map; user choices override the app's `open`
defaults on reload. App-owned hand-written sections can be `<details class="group">` too and share
the same key (write their element id into the same blob). Style `summary` yourself (hide the marker,
add a chevron via `::before`).

## Module: `parametric-kit/viewer`

`createViewer(container, options?)` gives a Z-up scene (env light, soft shadow-catcher, on-demand
rendering, capture-ready) that knows nothing about the model — you add meshes and wire the UI.

```ts
import { createViewer, creased, installAppHook } from "parametric-kit/viewer";
const viewer = createViewer(document.getElementById("app")!); // options: sunPosition, shadowExtent,
// shadowFar, groundSize (grow for big models)
const bodyMesh = new Mesh(creased(buildBody(params)), bodyMat); // creased(): split normals at CAD edges,
bodyMesh.castShadow = bodyMesh.receiveShadow = true; // keep 90° edges crisp; disposes the source
viewer.scene.add(bodyMesh);
viewer.frameCamera([bodyMesh]); // fit camera to objects
viewer.start(); // begin the on-demand render loop

function rebuild() {
  // on any param change
  const old = bodyMesh.geometry;
  bodyMesh.geometry = creased(buildBody(params));
  old.dispose();
  viewer.invalidate(); // request ONE render after a non-camera scene change (camera drags self-invalidate)
}
installAppHook({
  params,
  rebuild,
  render: () => viewer.render(),
  frame: () => viewer.frameCamera([bodyMesh]),
});
```

Viewer surface: `{ scene, camera, renderer, controls, invalidate, render, frameCamera, start,
dispose }`. `render()` forces one **synchronous** draw now (bypasses rAF — used for headless
capture). `creased(geom, angle=30°)` returns a creased-normals clone and disposes the source; STL is
identical (positions/triangles untouched). `installAppHook(hook, opts?)` publishes `hook` on
`window.__app` **only under a Vite dev build** (unless `enabled`/`key`/`target` overridden) — the
consuming app owns the hook's shape. Also exported: `framingForBox`, `CREASE_ANGLE`, `VIEWER_DEFAULTS`.

## Module: `parametric-kit/readout`

Primitives for the size/weight readout and the Bambu bed-fit badges (you compose the sentences).

```ts
import {
  volumeCm3,
  filamentGrams,
  filamentMetres,
  PRINTERS,
  fitFor,
  fitTitle,
} from "parametric-kit/readout";
const vol = geoms.reduce((s, g) => s + volumeCm3(g), 0); // cm³, from the real cut solids (signed-tetra)
const grams = Math.round(filamentGrams(vol, material)); // material defaults to "PLA"; DENSITY table exported
const metres = filamentMetres(vol); // m of 1.75 mm filament
for (const printer of PRINTERS) {
  const fit = fitFor(printer, Math.max(w, d), Math.min(w, d)); // (longSide, shortSide) -> "ok" | "mod" | "no"
  badge.title = fitTitle(printer, fit);
}
```

## Module: `parametric-kit/export`

```ts
import { exportSTL, downloadBlob, downloadText, stlBinary } from "parametric-kit/export";
exportSTL(bodyMesh.geometry, stlName("body")); // binary STL (mm, Z-up, print-ready); accepts Mesh|Object3D|BufferGeometry
```

## Module: `parametric-kit/testkit`

Geometry probes for the app's Node suite — they build the real solids and check the mesh, catching
what pure-math param tests can't (a cut in the wrong place, a clipped boss, an opening through a margin).

```ts
import { beforeAll, describe, expect, test } from "vite-plus/test";
import { initCSG } from "parametric-kit/csg";
import { bbox, volume, verticesOnDisc } from "parametric-kit/testkit";
import { buildBody } from "./deckbox.ts";
import { defaults, dims, schema } from "./params.ts";

beforeAll(async () => {
  await initCSG();
}); // Node: loader finds the wasm; no ?url

test("body fills its advertised footprint", () => {
  const p = defaults(schema),
    d = dims(p),
    b = bbox(buildBody(p));
  expect(b.max[0] - b.min[0]).toBeCloseTo(d.outerW, 4);
  expect(b.min[2]).toBeCloseTo(0, 4); // base on the bed
});
// volume(g): mm³ signed-tetra sum. verticesOnDisc(g, cx, cy, z, r): count verts on a horizontal
// disc — proves a pocket floor bottoms out exactly where a feature (e.g. a magnet) should.
```

2D-panel apps get polygon probes instead (no WASM, no `initCSG`):
`pointInPolygon(outline, x, y)` — probe that a cutout/feature is void or material exactly where it
should be (probe clearly inside/outside features, never on an edge); `signedArea(outline)` — exact
shoelace area, positive ⇔ CCW winding (y-up), so it doubles as a winding assertion.

## New-app recipe (ordered)

1. **Scaffold:** `vp create vite:application` → choose **Vanilla TS** (NOT React; the panel is
   framework-free DOM). Then `cd` in.
2. **Deps** in `package.json`, then `pnpm install`:
   - `dependencies`: `"parametric-kit": "link:../parametric-kit"`, `"manifold-3d": "3.5.1"` (exact,
     lockstep with the kit), `"three": "^0.184.0"`.
   - `devDependencies`: `"@types/three": "^0.184.1"`.
3. **`pnpm-workspace.yaml`** — copy the kit's shape verbatim (prevents the dual-vitest crash): `catalog:`
   pins for `vite`/`vite-plus`, `overrides: { vite: "catalog:" }`, `peerDependencyRules.allowAny:
[vite, vitest]`, `allowBuilds: { sharp: false }`.
4. **`vite.config.ts`** — `base: "./"` (required for the proxied embed), and a test block:
   `test: { include: ["src/**/*.test.ts"], environment: "node", globals: false }`.
5. **`index.html`** — panel shell: full-viewport `#app` (canvas host) + a `#panel` overlay holding an
   empty `#controls` div (renderPanel fills it), `#dims`, `#warnings`, download buttons; CSS for
   `.group/.row/.sel/.toggle/.sub`; `<script type="module" src="/src/main.ts">`. Add `.node-version`.
6. **`src/params.ts`** — `schema = defineParams({...})`, `type Params = Infer<typeof schema>`, and a
   pure `dims(p): Dims` deriving every measurement (footprints, cavity, shoulder…) from raw params;
   plus app constants, `capacity()`-style helpers, and printability thresholds.
7. **`src/shapes.ts`** — 2D `THREE.Shape` profiles; **keep every cutout self-supporting** (45° rule).
8. **`src/<model>.ts`** — pure `Params -> BufferGeometry` builders via `scope()`, in print orientation.
9. **`src/main.ts`** — `await initCSG(wasmUrl)`; `createViewer`; `store.load()`; `renderPanel`;
   `rebuild()` coalesced to one call per frame with `requestAnimationFrame`; preset selects;
   `exportSTL`; `installAppHook`.
10. **`src/<model>.test.ts`** — testkit probes + `beforeAll(() => initCSG())`.
11. **`.github/workflows/deploy.yml`** — GitHub Pages workflow. The **build job runs the tests** before
    building: `pnpm install --frozen-lockfile` → `pnpm test --run` → `pnpm run build` (`tsc && vp
build`) → `upload-pages-artifact path: dist`; a `deploy` job needs it. `base: "./"` makes the
    bundle path-agnostic.
12. **Register on jonas-jensen.com** (see next section).

## Variant: 2D-panel apps (laser cutting) — `parametric-kit/laser`

The kit carries the flat-panel plumbing (extracted from laser-mtg-deck-box and the parametric-shop
product packages) with only these deltas from the recipe above:

- **No CSG:** skip `manifold-3d` and `parametric-kit/csg` entirely. Silence the kit's peer warning
  in `pnpm-workspace.yaml`: `peerDependencyRules.ignoreMissing: ["manifold-3d"]`. No `initCSG`
  anywhere — tests are pure Node from line one.
- **Geometry model:** instead of `Params -> BufferGeometry`, builders produce a serializable
  `Panel[]` (type from `parametric-kit/laser`) — `{ id, outline: [x,y][] (closed CCW,
kerf-compensated), holes (CW), size, place }` — consumed by BOTH the SVG exporter and the 3D
  preview, so cut file and preview can't drift.
- **`parametric-kit/laser`** (pure math, safe for servers/tests — never imports three):
  - Types `Pt`/`Place`/`Panel`/`Interval`/`Placement`/`Sheet`/`Layout`/`SheetSpec`.
  - Finger joints: `fingerCount` (largest odd n, ≥0.6·fingerWidth segments), `isFinger`,
    `combBreakpoints`/`combIntervals` — kerf shifts every INTERNAL boundary k/2 toward the slot;
    envelopes stay nominal. Kerf belongs in this outline math, never a polygon post-offset.
  - Placement: `applyPlace(pt, place)` (world = Rz·Ry·Rx·local + pos), `placeMatrix(place)`
    (column-major, for `Matrix4.fromArray`).
  - Outline helpers: `dedupe(pts)`, `circleCW(cx, cy, r, segs=24)` (CW hole winding).
  - Packing: `layoutSheets(panels, {sheetW, sheetH, gap}, {materialOf?, pin?})` — shelf-packs
    tallest-first, one material per sheet (null/body group first, then slug order), reports
    `oversize` ids instead of dropping parts; `pin: "lid"` reserves the first sheet's bottom-left
    corner for that panel (pre-foilable known spot). `sheetLabel(sheets, idx)` →
    `"sheet-2-acrylic"` fragments for download names.
  - Areas: `panelArea`/`totalPanelArea`/`materialPanelArea` (shoelace, holes subtracted) — feed
    weight/price readouts.
  - SVG: `sheetSvg(sheet, {sheetW, sheetH}, {prelude?})` — real-mm hairline cut paths, one path
    per part, y-flip handled; `prelude` injects filled engrave/foil layers before the cut paths.
    `fmtMm` formats mm for filenames. Ship with `downloadText(name, svg, "image/svg+xml")`.
- **`parametric-kit/laser/preview`** (imports three — keep out of server code):
  `panelGeometry(panel, thickness)` extrudes outline+holes and bakes in `place` (material group 0
  = sheet faces, group 1 = cut walls — tint the walls darker as end grain so joints read).
- **Tests:** `pointInPolygon`/`signedArea` from testkit + `combIntervals` math on shared edges
  (complementarity: fingers of one panel exactly partition against the mating panel's slots).

## Module: `parametric-kit/gridfinity`

Gridfinity (42 × 42 mm grid, 7 mm height units) support — reach for this whenever a container
or organizer product should offer a Gridfinity variant instead of hand-deriving the spec.

- Spec constants: `GRID` (42), `UNIT_H` (7), `BIN_CLEAR` (0.5 — bins run 41.5 per cell),
  `CORNER_R` (3.75), foot profile (`BASE_LOWER_CH`/`BASE_STRAIGHT`/`BASE_UPPER_CH`, `BASE_H`
  = 4.75, `FOOT_TOP` 41.5 / `FOOT_BOT` 35.6), magnet pocket spec (`MAGNET_D` 6.5, `MAGNET_H`
  2.4, `MAGNET_SPACING` 26).
- Snapping math (pure, safe anywhere): `unitsFor(mm)` → cells covering an outside dimension,
  `binSpan(units)` → bin footprint (n·42 − 0.5), `binHeight(rawMm)` → snap UP to whole 7 mm
  units, `cellCenter(cols, rows, i, j)`.
- `gridfinityBase(s: Scope, cols, rows, {magnets?})` → tracked `Solid`: one chamfered foot per
  cell, z = 0..4.75, footprint centred on origin. The app unions its bin body on top from
  z = BASE_H with outer profile `binSpan(cols) × binSpan(rows)`, corner radius `CORNER_R`,
  and snaps total height with `binHeight(...)`. Foot corners are built proportionally rounded
  (strictly inside the spec envelope) so bins seat in any spec baseplate; flats are exact.

## App-owned view controls (both app kinds)

`renderPanel` renders ONLY schema params. View state (preview mode select, explode slider, show/hide
toggles) is app chrome: keep it out of the schema (it must not persist or dirty presets), put it in
a hand-written `<section class="group">` after the `#controls` div reusing the same row/sel classes,
and have its listeners call `rebuild()` directly.

For small viewports, `installPanelCollapse(panelEl, headerEl, { startCollapsed })` (from
`parametric-kit/params`) collapses the whole `#panel` overlay to its `h1`: it appends a
`.panel-collapse` toggle button into the header and flips a `collapsed` class on the panel — the
app's CSS supplies `#panel.collapsed > :not(h1) { display: none }` / `#panel.collapsed { width:
auto }` and button styling. Pass `startCollapsed: matchMedia("(max-width: 640px)").matches` so
phones land with the preview visible. State is intentionally not persisted.

## Site registration (jonas-jensen.com embedded app)

The app is the source of truth and deploys itself; the site only proxies + registers it. Pushing the
app's `main` redeploys and the desktop serves it live — no commit on the site for app updates.

1. **`netlify.toml`** — add the rewrite **above the SPA catch-all** (Netlify uses the first match):
   ```toml
   [[redirects]]
   from = "/apps/<id>/*"
   to = "https://j0nas.github.io/<app-repo>/:splat"
   status = 200          # 200 = same-origin proxy: no CORS/framing exceptions needed
   ```
2. **`vite.config.ts`** — mirror the exact same from→to in the site's `embeddedProxy` (dev + preview).
3. **Icon** — `public/img/apps/<id>.svg`, a 32×32 pixel-art SVG (scales to the 16px title-bar icon too).
4. **`src/apps/registry.tsx`** — add `{ title, defaultSize, icon, iconSmall, embed: "/apps/<id>/" }`.
   The desktop icon, Start › Programs entry, and window all derive from this. Then `vp check && vp build`.

## Gotchas (each cost real debugging time — obey as imperatives)

- **Run tests with `pnpm test`, never a globally-installed `vp`.** A global `vp` brings a second
  vitest and crashes with `Cannot read properties of undefined (reading 'config')`. The
  `pnpm-workspace.yaml` catalog/`peerDependencyRules` shape is what makes the project-local vp win.
- **Keep `manifold-3d` pinned to exactly `3.5.1`, in lockstep with the kit.** The csg module drives
  private `_ToPolygons`/`_Extrude` bindings to plug a per-call WASM leak (fatal under a live slider);
  that workaround is validated against 3.5.1 only. To bump: **bump it in the kit first, run the kit's
  csg tests**, then update apps.
- **Don't trust `agent-browser screenshot` on the viewer.** rAF pauses while the window is occluded,
  so a screenshot can capture a stale/blank frame. Instead drive the dev `__app` hook
  (`installAppHook`): set params → `rebuild()` → `render()` (synchronous, bypasses rAF) → read
  `canvas.toDataURL()`.
- **Keep every cutout profile self-supporting (45° rule):** teardrop arches, semicircular slot/notch
  bottoms, point-up hexes — so parts print without supports and preview == print.
- **`sanitize` semantics are contractual — don't loosen them.** Non-object root → all defaults;
  unknown keys dropped; a stored value is taken only when its `typeof` matches the default's (JSON
  turns NaN/Infinity into null, so non-finite numbers are rejected and keep the default); `pick`
  values are pinned to the declared options. `createStore().load()` runs exactly this.
- **After any kit change, run `pnpm run build` in the kit** (apps import `dist/`, not `src/`), or
  `pnpm run dev` for watch mode, before the app picks it up.
- **Add new kit modules via `pack.entry` in the kit's `vite.config.ts`; never hand-edit the exports
  map** in `package.json` — it's generated by `vp pack` (`pack.exports: true`). Relative imports carry
  the `.ts` extension (`allowImportingTsExtensions` + nodenext).

## What stays in the app (don't import these from the kit — they don't exist there)

- `dims(p)` — the derived-dimensions function (footprints, cavity, shoulder, lid height…).
- The geometry builders (`buildBody`/`buildLid`/…) and their 2D `THREE.Shape` profiles (`shapes.ts`).
- Printability **warnings and thresholds** (min skirt/wall, "no room → stay solid" fallbacks).
- Readout **text composition** — the kit gives `volumeCm3`/`filamentGrams`/`fitFor` primitives; you
  compose the dims line, capacity phrasing, and warnings.
- **STL filenames** (e.g. `deck-box-body-100-cards-snap.stl`).
  </content>
  </invoke>
