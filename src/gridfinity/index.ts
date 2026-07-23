// Gridfinity — Zack Freedman's open modular-storage standard: a 42 × 42 mm grid of stackable
// bins on baseplates, heights in 7 mm units. This module carries the spec numbers, the
// units↔mm math and the bin base (the chamfered feet that seat into a baseplate), so every
// Gridfinity-compatible app shares one implementation instead of re-deriving the profile.
//
// Corner fidelity: the spec's foot profile shrinks its corner radius through the chamfers
// (3.75 → 0.8 mm). A scaleTop extrusion scales the whole cross-section similarly, so our foot
// corners stay proportionally rounded (3.75 → 3.22 mm) instead. That keeps every level of the
// foot strictly INSIDE the spec envelope — rounder corners remove material — so bins seat in
// any spec-compliant baseplate; only the corner contact is marginally looser. The flats, where
// bins actually register, are exact, and the foot's top matches the 41.5 / r 3.75 bin body
// exactly so the seam is invisible.

import { Shape } from "three";
import type { Scope, Solid } from "../csg/index.ts";

/** Grid pitch: one cell is 42 × 42 mm. */
export const GRID = 42;

/** Height unit: bin heights are multiples of 7 mm (base included). */
export const UNIT_H = 7;

/** Bins run half a millimetre under pitch (41.5 for a 1×1) so neighbours never bind. */
export const BIN_CLEAR = 0.5;

/** Bin outer corner radius — also the foot's radius at its top. */
export const CORNER_R = 3.75;

/** Foot profile, bottom up: 45° chamfer, straight wall, 45° chamfer. */
export const BASE_LOWER_CH = 0.8;
export const BASE_STRAIGHT = 1.8;
export const BASE_UPPER_CH = 2.15;
export const BASE_H = BASE_LOWER_CH + BASE_STRAIGHT + BASE_UPPER_CH; // 4.75

/** Foot cross-section spans: 41.5 at the top, 35.6 on the bed. */
export const FOOT_TOP = GRID - BIN_CLEAR;
export const FOOT_BOT = FOOT_TOP - 2 * (BASE_LOWER_CH + BASE_UPPER_CH);

/** Magnet pockets in the feet: Ø 6.5 × 2.4 deep, four per cell on a 26 mm square. */
export const MAGNET_D = 6.5;
export const MAGNET_H = 2.4;
export const MAGNET_SPACING = 26;

/** Smallest number of cells whose bin footprint covers `mm` of outside dimension. */
export function unitsFor(mm: number): number {
  return Math.max(1, Math.ceil((mm + BIN_CLEAR) / GRID));
}

/** Outside footprint of a bin spanning `units` cells (continuous, not per-cell). */
export function binSpan(units: number): number {
  return units * GRID - BIN_CLEAR;
}

/** Snap a raw height (base included) UP to whole 7 mm Gridfinity units. */
export function binHeight(rawMm: number): number {
  return Math.max(1, Math.ceil(rawMm / UNIT_H)) * UNIT_H;
}

/** Centre of cell (i, j) in a cols × rows bin footprint centred on the origin. */
export function cellCenter(cols: number, rows: number, i: number, j: number): [number, number] {
  return [(i - (cols - 1) / 2) * GRID, (j - (rows - 1) / 2) * GRID];
}

// Local rounded rectangle (the kit keeps app profiles in apps; this one IS the spec's).
function roundedRect(w: number, l: number, radius: number): Shape {
  const s = new Shape();
  const hw = w / 2;
  const hl = l / 2;
  const r = Math.max(Math.min(radius, hw - 0.01, hl - 0.01), 0);
  s.moveTo(-hw + r, -hl);
  s.lineTo(hw - r, -hl);
  s.absarc(hw - r, -hl + r, r, -Math.PI / 2, 0, false);
  s.lineTo(hw, hl - r);
  s.absarc(hw - r, hl - r, r, 0, Math.PI / 2, false);
  s.lineTo(-hw + r, hl);
  s.absarc(-hw + r, hl - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-hw, -hl + r);
  s.absarc(-hw + r, -hl + r, r, Math.PI, Math.PI * 1.5, false);
  s.closePath();
  return s;
}

function circle(r: number): Shape {
  const s = new Shape();
  s.absarc(0, 0, r, 0, Math.PI * 2, false);
  return s;
}

// One foot (z = 0 .. BASE_H), centred on the origin: three stacked extrusions of similar
// cross-sections, so the stages meet exactly and the 45° chamfers hold on every flat.
function foot(s: Scope, magnets: boolean): Solid {
  const stage = (botSpan: number, topSpan: number, h: number, z: number): Solid => {
    const k = topSpan / botSpan;
    const shape = roundedRect(botSpan, botSpan, CORNER_R * (botSpan / FOOT_TOP));
    return s.move(s.extrude(shape, h, 12, { x: k, y: k }), 0, 0, z);
  };
  const midSpan = FOOT_BOT + 2 * BASE_LOWER_CH;
  let f = s.union([
    stage(FOOT_BOT, midSpan, BASE_LOWER_CH, 0),
    stage(midSpan, midSpan, BASE_STRAIGHT, BASE_LOWER_CH),
    stage(midSpan, FOOT_TOP, BASE_UPPER_CH, BASE_LOWER_CH + BASE_STRAIGHT),
  ]);
  if (magnets) {
    const holes: Solid[] = [];
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const hole = s.extrude(circle(MAGNET_D / 2), MAGNET_H + 0.1, 24);
        holes.push(s.move(hole, (sx * MAGNET_SPACING) / 2, (sy * MAGNET_SPACING) / 2, -0.1));
      }
    }
    f = s.sub(f, s.union(holes));
  }
  return f;
}

/**
 * The base of a cols × rows Gridfinity bin: one chamfered foot per cell, z = 0 .. BASE_H,
 * footprint centred on the origin. The caller unions its bin body on top from z = BASE_H
 * (outer profile binSpan(cols) × binSpan(rows), corner radius CORNER_R) and finishes the
 * scope itself — the returned Solid is tracked by `s` like any other.
 */
export function gridfinityBase(
  s: Scope,
  cols: number,
  rows: number,
  opts: { magnets?: boolean } = {},
): Solid {
  const one = foot(s, opts.magnets ?? false);
  const feet: Solid[] = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const [x, y] = cellCenter(cols, rows, i, j);
      feet.push(s.move(one, x, y, 0));
    }
  }
  return s.union(feet);
}
