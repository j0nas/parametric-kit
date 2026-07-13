// @vitest-environment happy-dom
import { describe, expect, test } from "vite-plus/test";
import { installPanelCollapse } from "./panel-collapse.ts";

function mount(startCollapsed?: boolean) {
  const panel = document.createElement("div");
  const header = document.createElement("h1");
  header.textContent = "My builder";
  panel.append(header);
  const api = installPanelCollapse(panel, header, { startCollapsed });
  const btn = header.querySelector<HTMLButtonElement>("button.panel-collapse")!;
  return { panel, header, btn, api };
}

describe("installPanelCollapse", () => {
  test("adds the toggle to the header, expanded by default", () => {
    const { panel, btn, api } = mount();
    expect(btn).toBeTruthy();
    expect(api.collapsed).toBe(false);
    expect(panel.classList.contains("collapsed")).toBe(false);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
  });

  test("clicking toggles the collapsed class, button glyph and aria state", () => {
    const { panel, btn, api } = mount();
    btn.click();
    expect(api.collapsed).toBe(true);
    expect(panel.classList.contains("collapsed")).toBe(true);
    expect(btn.textContent).toBe("▸");
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    btn.click();
    expect(api.collapsed).toBe(false);
    expect(panel.classList.contains("collapsed")).toBe(false);
    expect(btn.textContent).toBe("▾");
  });

  test("startCollapsed starts hidden; set() drives it programmatically", () => {
    const { panel, api } = mount(true);
    expect(panel.classList.contains("collapsed")).toBe(true);
    api.set(false);
    expect(panel.classList.contains("collapsed")).toBe(false);
    expect(api.collapsed).toBe(false);
  });
});
