import { BoxGeometry } from "three";
import { expect, test } from "vite-plus/test";
import { DENSITY, filamentGrams, filamentMetres, volumeCm3 } from "./filament.ts";

test("filamentGrams multiplies volume by the material density", () => {
  expect(filamentGrams(100, "PLA")).toBeCloseTo(124, 10);
  expect(filamentGrams(50, "PETG")).toBeCloseTo(63.5, 10);
  expect(filamentGrams(10, "ABS")).toBeCloseTo(10.4, 10);
  expect(filamentGrams(200, "TPU")).toBeCloseTo(242, 10);
});

test("filamentGrams falls back to PLA density for an unknown or omitted material", () => {
  expect(filamentGrams(100, "NYLON")).toBe(filamentGrams(100, "PLA"));
  expect(filamentGrams(100)).toBe(filamentGrams(100, "PLA"));
});

test("filamentMetres divides volume by the 1.75 mm filament cross-section", () => {
  const area = Math.PI * (1.75 / 2) ** 2; // one cm³ per mm² of cross-section ⇒ exactly 1 m
  expect(filamentMetres(area)).toBeCloseTo(1, 12);
  expect(filamentMetres(2 * area)).toBeCloseTo(2, 12);
  expect(filamentMetres(0)).toBe(0);
});

test("DENSITY lists the four supported materials in g/cm³", () => {
  expect(DENSITY).toEqual({ PLA: 1.24, PETG: 1.27, ABS: 1.04, TPU: 1.21 });
});

test("volumeCm3 converts a mesh's mm³ volume to cm³", () => {
  expect(volumeCm3(new BoxGeometry(10, 10, 10))).toBeCloseTo(1, 6); // 1000 mm³ = 1 cm³
  expect(volumeCm3(new BoxGeometry(20, 20, 20))).toBeCloseTo(8, 6); // 8000 mm³ = 8 cm³
});
