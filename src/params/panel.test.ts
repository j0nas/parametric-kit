// @vitest-environment happy-dom
import { describe, expect, test } from "vite-plus/test";
import {
  defaults,
  defineParams,
  definePresets,
  type Infer,
  num,
  pick,
  renderPanel,
  toggle,
} from "./index.ts";

const schema = defineParams({
  cardCount: num({ def: 100, min: 10, max: 250, step: 1, group: "cards", label: "Card count" }),
  lidStyle: pick(["friction", "snap", "magnet"] as const, {
    def: "friction",
    group: "lid",
    label: "Closure",
    optionLabels: { friction: "Friction fit", snap: "Snap fit", magnet: "Magnets" },
  }),
  lipHeight: num({ def: 13, min: 6, max: 25, step: 0.5, group: "lid", label: "Lip height" }),
  snapBump: num({
    def: 0.3,
    min: 0.1,
    max: 0.6,
    step: 0.05,
    group: "snap",
    label: "Snap engagement",
  }),
  notchDepth: num({
    def: 11,
    min: 4,
    max: 25,
    step: 0.5,
    group: "notch",
    label: "Notch depth",
    maxKey: "lipHeight",
  }),
  showRail: toggle({ def: false, group: "notch", label: "Rail" }),
});
type Params = Infer<typeof schema>;

const decks = definePresets<typeof schema>({
  id: "deck",
  label: "Deck preset",
  presets: [
    { name: "Standard (60)", set: { cardCount: 60 } },
    { name: "Commander (100)", set: { cardCount: 100 } },
  ],
});

function mount(params: Params, onChange: (p: Params) => void = () => {}) {
  const container = document.createElement("div");
  const panel = renderPanel(container, schema, params, {
    presets: [decks],
    onChange,
    groups: [
      { id: "cards", title: "Cards", presets: ["deck"] },
      { id: "lid", title: "Lid", hint: (p) => `closure:${p.lidStyle}` },
      { id: "snap", visibleWhen: (p) => p.lidStyle === "snap" },
      { id: "notch", title: "Retrieval" },
    ],
  });
  return { container, panel };
}

function row(container: HTMLElement, label: string) {
  const rows = [...container.querySelectorAll<HTMLDivElement>(".row")];
  const found = rows.find((r) => r.querySelector("label")?.textContent === label);
  if (!found) throw new Error(`no row for "${label}"`);
  return {
    range: found.querySelector<HTMLInputElement>('input[type="range"]')!,
    text: found.querySelector<HTMLInputElement>('input[type="text"]')!,
  };
}

function select(container: HTMLElement, label: string) {
  const sels = [...container.querySelectorAll<HTMLLabelElement>("label.sel")];
  const found = sels.find((s) => s.textContent?.startsWith(label));
  if (!found) throw new Error(`no select for "${label}"`);
  return found.querySelector<HTMLSelectElement>("select")!;
}

describe("renderPanel structure", () => {
  test("builds a section per titled group and a row/select/toggle per field", () => {
    const { container } = mount(defaults(schema));
    const sections = container.querySelectorAll("section.group");
    expect(sections.length).toBe(3); // cards, lid, retrieval (snap is a title-less continuation)
    expect(container.querySelectorAll(".row").length).toBe(4); // cardCount, lipHeight, snapBump, notchDepth
    expect(container.querySelectorAll("label.sel select").length).toBe(2); // deck preset + closure
    expect(container.querySelectorAll("label.toggle input").length).toBe(1); // showRail
  });

  test("initial inputs reflect the params", () => {
    const { container } = mount({ ...defaults(schema), cardCount: 60 });
    expect(row(container, "Card count").text.value).toBe("60");
    expect(select(container, "Closure").value).toBe("friction");
    // optionLabels drive the display text (raw value -> label): friction -> "Friction fit".
    expect(select(container, "Closure").querySelector("option")?.textContent).toBe("Friction fit");
  });
});

describe("renderPanel behaviour", () => {
  test("a slider edit writes params and calls onChange once with the params object", () => {
    const params = defaults(schema);
    let calls = 0;
    let last: Params | null = null;
    const { container } = mount(params, (p) => {
      calls++;
      last = p;
    });
    const { range } = row(container, "Card count");
    range.value = "120";
    range.dispatchEvent(new Event("input"));
    expect(params.cardCount).toBe(120);
    expect(calls).toBe(1);
    expect(last).toBe(params);
  });

  test("maxKey ceiling: lowering lipHeight clamps notchDepth down and updates its inputs", () => {
    const params = { ...defaults(schema), lipHeight: 20, notchDepth: 18 };
    const { container } = mount(params);
    const notch = row(container, "Notch depth");
    expect(notch.range.max).toBe("20");
    const lip = row(container, "Lip height");
    lip.range.value = "10";
    lip.range.dispatchEvent(new Event("input"));
    expect(params.notchDepth).toBe(10); // clamped to the new lip height
    expect(notch.range.max).toBe("10");
    expect(notch.text.value).toBe("10");
  });

  test("maxKey ceiling: editing a field above its live ceiling clamps to the ceiling", () => {
    const params = { ...defaults(schema), lipHeight: 12, notchDepth: 8 };
    const { container } = mount(params);
    const notch = row(container, "Notch depth");
    notch.range.value = "25";
    notch.range.dispatchEvent(new Event("input"));
    expect(params.notchDepth).toBe(12); // capped at lipHeight, not the static max 25
  });

  test("conditional group visibility follows a pick field", () => {
    const params = defaults(schema);
    const { container } = mount(params);
    const snapRow = row(container, "Snap engagement");
    const snapBlock = snapRow.range.closest("div:not(.row)") as HTMLElement;
    expect(snapBlock.hidden).toBe(true); // friction -> hidden
    const closure = select(container, "Closure");
    closure.value = "snap";
    closure.dispatchEvent(new Event("change"));
    expect(snapBlock.hidden).toBe(false);
  });

  test("a dynamic hint updates when its group's params change", () => {
    const params = defaults(schema);
    const { container } = mount(params);
    const hint = [...container.querySelectorAll("p.sub")].find((p) =>
      p.textContent?.startsWith("closure:"),
    )!;
    expect(hint.textContent).toBe("closure:friction");
    const closure = select(container, "Closure");
    closure.value = "magnet";
    closure.dispatchEvent(new Event("change"));
    expect(hint.textContent).toBe("closure:magnet");
  });

  test("toggle writes a boolean", () => {
    const params = defaults(schema);
    const { container } = mount(params);
    const box = container.querySelector<HTMLInputElement>("label.toggle input")!;
    box.checked = true;
    box.dispatchEvent(new Event("change"));
    expect(params.showRail).toBe(true);
  });
});

describe("renderPanel presets", () => {
  test("the preset select shows the matching preset, and Custom when off-preset", () => {
    const params = defaults(schema); // cardCount 100
    const { container } = mount(params);
    const deckSel = select(container, "Deck preset");
    expect(deckSel.value).toBe("Commander (100)");
    // Move the count off every preset -> the select drops to Custom ("").
    const { range } = row(container, "Card count");
    range.value = "137";
    range.dispatchEvent(new Event("input"));
    expect(deckSel.value).toBe("");
  });

  test("applying a preset writes its fields and repaints the rows", () => {
    const params = defaults(schema);
    let calls = 0;
    const { container } = mount(params, () => calls++);
    const deckSel = select(container, "Deck preset");
    deckSel.value = "Standard (60)";
    deckSel.dispatchEvent(new Event("change"));
    expect(params.cardCount).toBe(60);
    expect(row(container, "Card count").text.value).toBe("60");
    expect(deckSel.value).toBe("Standard (60)");
    expect(calls).toBe(1);
  });
});

describe("panel.sync", () => {
  test("pushes external param mutations (reset) back into every input and select", () => {
    const params = { ...defaults(schema), cardCount: 60, lidStyle: "snap" as const };
    const { container, panel } = mount(params);
    Object.assign(params, defaults(schema)); // simulate reset-to-defaults
    panel.sync();
    expect(row(container, "Card count").text.value).toBe("100");
    expect(select(container, "Closure").value).toBe("friction");
    expect(select(container, "Deck preset").value).toBe("Commander (100)");
  });
});
