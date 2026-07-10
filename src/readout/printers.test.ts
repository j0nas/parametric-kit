import { expect, test } from "vite-plus/test";
import { caveatOf, fitFor, fitTitle, type Printer, PRINTERS } from "./printers.ts";

function printer(name: string): Printer {
  const p = PRINTERS.find((x) => x.name === name);
  if (!p) throw new Error(`no printer named ${name}`);
  return p;
}

const a1mini = printer("A1 mini");
const p1 = printer("P1 / P2 / X1");
const h2 = printer("H2D / H2C");

test("a plain bed is 'ok' up to its edge and 'no' past it, in either orientation", () => {
  expect(fitFor(a1mini, 180, 180)).toBe("ok"); // exactly the bed
  expect(fitFor(a1mini, 180, 100)).toBe("ok");
  expect(fitFor(a1mini, 181, 100)).toBe("no"); // over in both orientations
  expect(fitFor(a1mini, 200, 179)).toBe("no");
});

test("P1/X1 corner: only 'mod' when the part reaches into both exclusion strips at once", () => {
  expect(fitFor(p1, 210, 210)).toBe("ok"); // inside the 220×200 clean window
  expect(fitFor(p1, 230, 210)).toBe("ok"); // dirty upright, but clean once rotated
  expect(fitFor(p1, 240, 230)).toBe("mod"); // dirty in both orientations
  expect(fitFor(p1, 250, 250)).toBe("mod");
  expect(fitFor(p1, 260, 100)).toBe("no"); // past the 256 bed
});

test("H2D/H2C: 'ok' within the both-nozzle band, 'mod' beyond it, 'no' past the single-nozzle area", () => {
  expect(fitFor(h2, 290, 290)).toBe("ok");
  expect(fitFor(h2, 300, 320)).toBe("ok"); // exactly the 300×320 both-nozzle band (rotated)
  expect(fitFor(h2, 301, 301)).toBe("mod"); // over 300 on both sides ⇒ single-nozzle only
  expect(fitFor(h2, 310, 310)).toBe("mod");
  expect(fitFor(h2, 322, 310)).toBe("mod"); // fits only in the orientation that overflows the band
  expect(fitFor(h2, 330, 310)).toBe("no"); // past the 325×320 single-nozzle area
});

test("caveatOf returns the corner mod, the single-nozzle note, or nothing", () => {
  expect(caveatOf(p1)?.note).toContain("exclusion-zone mod");
  expect(caveatOf(h2)?.note).toContain("single-nozzle only");
  expect(caveatOf(a1mini)).toBeUndefined();
});

test("fitTitle names the models and the verdict", () => {
  expect(fitTitle(a1mini, "ok")).toBe("A1 mini: 180 × 180 mm — fits");
  expect(fitTitle(a1mini, "no")).toBe("A1 mini: 180 × 180 mm — too big");
  expect(fitTitle(p1, "mod")).toContain("P1P · P1S · P2S · X1C · X1E");
  expect(fitTitle(p1, "mod")).toContain("exclusion-zone mod");
});
