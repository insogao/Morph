import { test } from "node:test";
import assert from "node:assert/strict";
import { circle, shapeFromRings, star } from "../packages/morph-engine/src/vector/shape";
import { alignEllipse, applySim, camThrough, describeShape, describeMask, frameEllipse, HOME, lerpCam, rhymeScore, suggestRhymes } from "../packages/morph-engine/src/vector/rhyme";
import type { Vec2 } from "../packages/morph-engine/src/vector/geom";

const ellipseRing = (c: Vec2, a: number, b: number, angle: number, n = 180) =>
  Array.from({ length: n }, (_, i) => { const t = 2 * Math.PI * i / n, x = a * Math.cos(t), y = b * Math.sin(t); return [c[0] + x * Math.cos(angle) - y * Math.sin(angle), c[1] + x * Math.sin(angle) + y * Math.cos(angle)] as Vec2; });
const near = (x: number, y: number, eps: number) => assert.ok(Math.abs(x - y) < eps, x + " vs " + y);

test("moment ellipse recovers an ellipse's centre, axes and angle", () => {
  const d = describeShape(shapeFromRings([ellipseRing([300, 200], 120, 40, 0.5)]));
  near(d.ellipse.c[0], 300, 0.5); near(d.ellipse.c[1], 200, 0.5);
  near(d.ellipse.a, 120, 1.5); near(d.ellipse.b, 40, 1);
  near(d.ellipse.angle, 0.5, 0.01);
  near(d.elongation, 1 / 3, 0.02);
  assert.ok(d.solidity > 0.98);
});

test("silhouette: a ring (letter O) rhymes with a disc of the same outline; the hole only counts a little", () => {
  const ring = describeShape(shapeFromRings([circle([0, 0], 100), circle([0, 0], 60)]));
  const disc = describeShape(shapeFromRings([circle([0, 0], 100)]));
  assert.equal(ring.holes, 1);
  near(ring.ellipse.a, 100, 1.5);
  const s = rhymeScore(ring, disc);
  assert.ok(s > 0.8 && s < 1, String(s));
});

test("rhyme: disc ↔ disc beats disc ↔ thin bar beats nothing; star is concave", () => {
  const disc = describeShape(shapeFromRings([circle([0, 0], 50)]));
  const disc2 = describeShape(shapeFromRings([circle([500, 90], 9)]));
  const bar = describeShape(shapeFromRings([ellipseRing([0, 0], 200, 8, 0)]));
  const st = describeShape(shapeFromRings([star([0, 0], 60, 22, 5)]));
  assert.ok(rhymeScore(disc, disc2) > 0.95);
  assert.ok(rhymeScore(disc, bar) < 0.3);
  assert.ok(st.solidity < 0.7);
  const ranked = suggestRhymes([{ id: "o", d: disc }], [{ id: "bar", d: bar }, { id: "sun", d: disc2 }, { id: "star", d: st }]);
  assert.equal(ranked[0].b, "sun");
});

test("alignEllipse lays B's ellipse exactly onto A's", () => {
  const a = describeShape(shapeFromRings([ellipseRing([400, 300], 90, 30, 0.2)])).ellipse;
  const b = describeShape(shapeFromRings([ellipseRing([50, 60], 30, 10, -0.4)])).ellipse;
  const t = alignEllipse(a, b);
  near(t.scale, 3, 0.05); near(t.angle, 0.6, 0.02);
  const p = applySim(t, b.c); near(p[0], 400, 1e-6); near(p[1], 300, 1e-6);
  // B's long-axis tip lands on A's long-axis tip.
  const tip = applySim(t, [b.c[0] + b.a * Math.cos(b.angle), b.c[1] + b.a * Math.sin(b.angle)]);
  near(Math.hypot(tip[0] - 400, tip[1] - 300), 90, 2);
});

test("camThrough shows a transformed world exactly like HOME shows the original", () => {
  const t = { scale: 0.25, angle: 0.3, from: [640, 360] as Vec2, to: [100, 80] as Vec2 };
  const cam = camThrough(t);
  const screen = (p: Vec2) => { // world → screen through cam
    const x = p[0] - cam.c[0], y = p[1] - cam.c[1], c = Math.cos(-cam.angle), s = Math.sin(-cam.angle);
    return [640 + cam.zoom * (c * x - s * y), 360 + cam.zoom * (s * x + c * y)];
  };
  for (const q of [[0, 0], [1280, 720], [300, 500]] as Vec2[]) { const r = screen(applySim(t, q)); near(r[0], q[0], 1e-6); near(r[1], q[1], 1e-6); }
});

test("lerpCam: zoom is geometric and the zoom target does not drift on screen", () => {
  const a = HOME, b = { c: [900, 200] as Vec2, zoom: 8, angle: 0 };
  near(lerpCam(a, b, 0.5).zoom, Math.sqrt(8), 1e-9);
  // The fixed point of a pure push-in from a to b: p with a-screen == b-screen.
  const fixed: Vec2 = [(b.zoom * b.c[0] - a.zoom * a.c[0]) / (b.zoom - a.zoom), (b.zoom * b.c[1] - a.zoom * a.c[1]) / (b.zoom - a.zoom)];
  for (const k of [0.2, 0.5, 0.8]) { const c = lerpCam(a, b, k); near(640 + c.zoom * (fixed[0] - c.c[0]), 640 + a.zoom * (fixed[0] - a.c[0]), 1e-6); }
  const f = frameEllipse({ c: [100, 100], a: 50, b: 20, angle: 0 }, 0.5);
  near(f.zoom, 0.5 * 1280 / 100, 1e-9);
});

test("describeMask finds the moment ellipse of opaque pixels in a box", () => {
  const w = 200, h = 100, data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (((x - 120) / 40) ** 2 + ((y - 50) / 20) ** 2 <= 1) data[(y * w + x) * 4 + 3] = 255;
  const d = describeMask(data, w, [0, 0, w, h], 1);
  near(d.ellipse.c[0], 120, 0.5); near(d.ellipse.a, 40, 1.5); near(d.ellipse.b, 20, 1);
});

import { colorScore } from "../packages/morph-engine/src/vector/rhyme";
import { curve } from "../packages/morph-engine/src/vector/camera-move";

test("colour is half of a rhyme: same shape in different colours scores low", () => {
  const disc = describeShape(shapeFromRings([circle([0, 0], 50)]));
  const cream = { ...disc, color: "#efe6d4" }, cream2 = { ...disc, color: "#ece3d0" }, red = { ...disc, color: "#c8283c" };
  assert.ok(colorScore(cream, cream2) > 0.95);
  assert.ok(rhymeScore(cream, red) < 0.4);
});

test("camera curves are C1: no velocity jump at any key", () => {
  const f = curve([{ t: 0, v: 0, d: 0 }, { t: 1, v: -0.2, d: 0 }, { t: 2.3, v: 3, d: 6 }, { t: 3, v: 4, d: 0 }, { t: 5, v: 1 }]);
  for (const k of [1, 2.3, 3]) {
    const e = 1e-4, left = (f(k) - f(k - e)) / e, right = (f(k + e) - f(k)) / e;
    near(left, right, 0.01 * Math.max(1, Math.abs(left)));
  }
});
