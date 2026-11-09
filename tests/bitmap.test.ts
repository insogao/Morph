import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { cellsFromRGBA, flightAt, hilbert, matchCells, place, schedule, type Placement } from "../packages/morph-engine/src/vector/bitmap";

/** RGBA image of a filled disc (anti-aliased by coverage), on transparency. */
function disc(w: number, h: number, cx: number, cy: number, r: number, rgb: [number, number, number]) {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    const a = Math.max(0, Math.min(1, r - d + 0.5));
    const i = (y * w + x) * 4;
    data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = Math.round(a * 255);
  }
  return data;
}
const IDENTITY: Placement = { at: [0, 0], scale: 1, center: [0, 0] };

test("alpha tracing is accurate to about a pixel (gate: contour error < 1–2 px)", () => {
  const dir = mkdtempSync(join(tmpdir(), "mm-trace-"));
  const png = new PNG({ width: 400, height: 300 });
  png.data = Buffer.from(disc(400, 300, 200, 150, 100, [200, 40, 40]));
  writeFileSync(join(dir, "disc.png"), PNG.sync.write(png));
  execFileSync("npx", ["tsx", "tools/trace-layers.ts", "--out", join(dir, "out.json"), "--scale", "1", "disc=" + join(dir, "disc.png")], { stdio: "pipe" });
  const { layers } = JSON.parse(readFileSync(join(dir, "out.json"), "utf8"));
  assert.equal(layers.disc.rings.length, 1);
  const errors = (layers.disc.rings[0] as Array<[number, number]>).map(([x, y]) => Math.abs(Math.hypot(x - 200, y - 150) - 100));
  assert.ok(Math.max(...errors) < 1.5, "max radial error " + Math.max(...errors).toFixed(2));
  assert.ok(errors.reduce((s, e) => s + e, 0) / errors.length < 0.6, "mean radial error");
});

test("cells keep the image's own colours and skip transparent blocks", () => {
  const data = disc(64, 64, 32, 32, 20, [10, 120, 230]);
  const cells = cellsFromRGBA(data, 64, 64, 4, IDENTITY);
  assert.ok(cells.length > 60 && cells.length < 110, "about π·20² / 16 cells, got " + cells.length);
  for (const c of cells) assert.deepEqual([Math.round(c.r), Math.round(c.g), Math.round(c.b)], [10, 120, 230]);
  assert.ok(cells.every(c => Math.hypot(c.x - 32, c.y - 32) < 23));
  const placed = cellsFromRGBA(data, 64, 64, 4, { at: [100, 100], scale: 2, center: [32, 32] });
  assert.ok(Math.abs(placed[0].x - place({ at: [100, 100], scale: 2, center: [32, 32] }, [cells[0].x, cells[0].y])[0]) < 1e-9);
});

test("Hilbert order keeps neighbours near each other", () => {
  const seen = new Set<number>();
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) seen.add(hilbert(x, y, 4));
  assert.equal(seen.size, 256, "a bijection on the grid");
  const pts: Array<[number, number]> = [];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) pts[hilbert(x, y, 4)] = [x, y];
  for (let i = 1; i < 256; i++) assert.equal(Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]), 1, "consecutive indices are grid neighbours");
});

test("matching preserves layout: the top-left of A flies to the top-left of B", () => {
  const a = cellsFromRGBA(disc(80, 80, 40, 40, 30, [255, 0, 0]), 80, 80, 4, IDENTITY);
  const b = cellsFromRGBA(disc(80, 80, 40, 40, 30, [0, 0, 255]), 80, 80, 4, { at: [300, 0], scale: 1, center: [0, 0] });
  const pairs = matchCells(a, b);
  assert.equal(pairs.length, Math.max(a.length, b.length));
  // Same shape: every cell should land close to its own relative position.
  const off = pairs.map(([i, j]) => Math.hypot(b[j].x - 300 - a[i].x, b[j].y - a[i].y));
  assert.ok(off.reduce((s, d) => s + d, 0) / off.length < 6, "mean layout error " + (off.reduce((s, d) => s + d, 0) / off.length).toFixed(1));
  assert.throws(() => matchCells([], b), /visible pixels/);
});

test("the release sweep starts at the cause and flights end exactly on their target cells", () => {
  const a = cellsFromRGBA(disc(80, 80, 40, 40, 30, [255, 0, 0]), 80, 80, 4, IDENTITY);
  const b = cellsFromRGBA(disc(60, 60, 30, 30, 20, [0, 0, 255]), 60, 60, 4, { at: [200, 200], scale: 1, center: [30, 30] });
  const pairs = matchCells(a, b);
  const flights = schedule(a, b, pairs, [40, 10]);
  const near = flights.filter(f => a[f.from].y < 25), farther = flights.filter(f => a[f.from].y > 55);
  const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  assert.ok(avg(near.map(f => f.release)) < avg(farther.map(f => f.release)), "cells near the cause leave first");
  for (const f of flights.slice(0, 40)) {
    const start = flightAt(a[f.from], b[f.to], f, f.release - 0.01), end = flightAt(a[f.from], b[f.to], f, f.land + 0.01);
    assert.ok(Math.hypot(start.x - a[f.from].x, start.y - a[f.from].y) < 1e-9);
    assert.ok(Math.hypot(end.x - b[f.to].x, end.y - b[f.to].y) < 1e-9);
    assert.ok(f.release >= 0 && f.land <= 1 && f.land > f.release);
  }
  const s1 = JSON.stringify(schedule(a, b, pairs, [40, 10])), s2 = JSON.stringify(schedule(a, b, pairs, [40, 10]));
  assert.equal(s1, s2, "deterministic");
});
