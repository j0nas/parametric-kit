# parametric-kit

Shared toolkit for browser-based parametric 3D-print generators — the proven, previously
copy-pasted core of [parametric-mtg-deck-box](https://github.com/j0nas/parametric-mtg-deck-box)
and a4-stackable-trays, extracted into one tested library. An app built on it only writes what
makes it unique: a param schema, a `dims()`, and pure geometry builders.

## Modules (subpath exports)

| Import                      | What it gives you                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parametric-kit/csg`        | manifold-3d layer: `initCSG()`, `scope()` tracked-solid lifetimes, Manifold → three `BufferGeometry`, and the `_ToPolygons`/`_Extrude` leak workaround for manifold-3d 3.5.1                                                                                                                                                                                                                                                      |
| `parametric-kit/params`     | Schema-driven params: `defineParams` + `num`/`pick`/`toggle` → inferred `Params` type, `defaults`, `sanitize`, versioned localStorage store, `renderPanel` (groups, sliders, selects, dynamic `maxKey` ceilings, conditional visibility, hints, collapsible `<details>` accordion with persisted open state), `installPanelCollapse` (collapse the whole panel to its header on small viewports), presets with "Custom…" fallback |
| `parametric-kit/viewer`     | `createViewer(container, options)`: tuned three.js scene (env light, soft shadow catcher, on-demand rendering, capture-ready), `creased()` normals, `framingForBox`, dev-only `installAppHook` for headless automation                                                                                                                                                                                                            |
| `parametric-kit/readout`    | `volumeCm3`, `filamentGrams`/`filamentMetres`, filament `DENSITY` table, Bambu printer bed-fit (`PRINTERS`, `fitFor`)                                                                                                                                                                                                                                                                                                             |
| `parametric-kit/export`     | `downloadBlob`/`downloadText`, `stlBinary`, `exportSTL` (binary STL via three's exporter)                                                                                                                                                                                                                                                                                                                                         |
| `parametric-kit/testkit`    | Geometry test probes for consuming apps' suites: `bbox`, `volume` (signed-tetra, mm³), `verticesOnDisc`, and 2D polygon probes (`pointInPolygon`, `signedArea`)                                                                                                                                                                                                                                                                   |
| `parametric-kit/laser`      | Flat-panel (laser-cut) primitives, pure math: `Panel` types, finger-joint comb math with kerf, `applyPlace`/`placeMatrix`, sheet packing (`layoutSheets`), shoelace areas, `sheetSvg`; 3D preview extrusion in `parametric-kit/laser/preview`                                                                                                                                                                                     |
| `parametric-kit/gridfinity` | Gridfinity standard: spec constants (42 mm grid, 7 mm units, foot profile, magnet pockets), `unitsFor`/`binSpan`/`binHeight` snapping math, and `gridfinityBase(scope, cols, rows, {magnets})` — the chamfered per-cell feet a bin body sits on                                                                                                                                                                                   |

One param declaration replaces the four places apps used to touch (type + defaults, control
row, sanitizer, panel HTML):

```ts
const schema = defineParams({
  cardCount: num({ def: 100, min: 10, max: 250, step: 1, group: "cards", label: "Card count" }),
  notchDepth: num({ def: 11, min: 4, max: 25, step: 0.5, group: "notch", maxKey: "lipHeight" }),
  lidStyle: pick(["friction", "snap", "magnet"], { def: "friction", group: "lid" }),
});
type Params = Infer<typeof schema>;
```

## Peer dependencies

`three` and `manifold-3d`. The csg module drives **private** manifold bindings
(`_ToPolygons`/`_Extrude`) to plug a WASM leak in `CrossSection.extrude`/`Mesh.merge`; that
workaround is validated against manifold-3d **3.5.1** by this repo's tests. When bumping
manifold, bump it here first and run the suite.

## Development

```bash
vp install     # or: pnpm install
pnpm test      # run through the project-local vp, NOT a global vp (dual-vitest crash)
vp check       # format + lint + typecheck
pnpm run build # vp pack → dist/, regenerates the exports map
```

Tests are co-located (`src/<module>/*.test.ts`) and run in Node — the manifold WASM kernel
initialises headlessly, so CSG geometry is tested for real (exact volumes, probe counts).

## Consuming from an app

Sibling-checkout apps use a path dependency until the planned monorepo migration:

```jsonc
// app package.json
"dependencies": { "parametric-kit": "link:../parametric-kit" }
```

Run `pnpm run build` here after kit changes (apps import `dist/`), or `pnpm run dev` for watch
mode. The Claude skill in `.claude/skills/parametric-kit/` documents the full
new-app recipe (schema → dims → builders → viewer wiring → deploy).
