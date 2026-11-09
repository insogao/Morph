import { centroid, fracture } from "../../packages/morph-engine/src/effects/fracture";
import { CREAM, INK, TAU, clamp, deepestPoint, fillRings, fillShape, glyphAt, heavy, hit, lazyFieldMorph, lerp, outQuad, pathOf, rng, samplePoints, smooth, span, thin, type V } from "./common";
import { curve } from "../../packages/morph-engine/src/vector/camera-move";

/*
 * 第一章 (beats 0–32): 道可道，非常道。名可名，非常名。…玄之又玄，众妙之门。
 *   道 gains weight (hairline → Black, field morph), then — "非常道" — breaks along a Voronoi fracture on the beat; the
 *   shards drift apart, turning. 名 forms in the gap and is blown into dust (a wipe releases it left to right). The
 *   dust drifts as a field (无名天地之始), splits into two arms (此两者同出而异名) and winds into a double spiral
 *   (玄之又玄), which contracts into the real 门 (众妙之门). The camera pushes through the door's opening — found
 *   from the glyph's own distance field — into darkness, where 第十一章 begins.
 */
const C: V = [0, -20];
const daoThin = glyphAt(thin, "道", C, 300), daoHeavy = glyphAt(heavy, "道", C, 300);
const weight = lazyFieldMorph(() => daoThin, () => daoHeavy, C, 190, 380);
const ming = glyphAt(heavy, "名", C, 230), men = glyphAt(heavy, "门", [0, -10], 330);

// the fracture: Voronoi cells over the glyph's box; each shard keeps its piece of the real glyph (clipped)
const BOX: V[] = [[-175, -195], [175, -195], [175, 155], [-175, 155]];
const shards = fracture(BOX, 34, 11, 2).map((cell, i) => {
  const r = rng(100 + i), c = centroid(cell), dx = c[0] - C[0], dy = c[1] - C[1], l = Math.hypot(dx, dy) || 1;
  const a = Math.atan2(dy, dx) + (r() - 0.5) * 0.5;
  return { cell, c, dir: [Math.cos(a), Math.sin(a)] as V, speed: 0.6 + r() * 0.9 * (0.6 + l / 200), spin: (r() - 0.5) * 1.6 };
});
const cellPaths = shards.map(s => { const p = new Path2D(); s.cell.forEach(([x, y], i) => i ? p.lineTo(x, y) : p.moveTo(x, y)); p.closePath(); return p; });

// the dust: points of 名, released by a wipe; each drifts on the wind to its own place in the field
const DUST = samplePoints(ming, 4.4, 5).map((p, i) => {
  const r = rng(7000 + i), a = -0.3 + (r() - 0.5) * 5.0, far = 150 + r() * 380;
  return { p, release: 9.5 + clamp((p[0] + 120) / 240) * 2.4 + r() * 0.2, to: [p[0] + Math.cos(a) * far + 60, p[1] + Math.sin(a) * far * 0.7] as V, g: i % 2, s: 0, sway: r() * TAU, jit: (r() - 0.5) * 2 };
});
// rank in each arm → place along the spiral (inner → outer)
[0, 1].forEach(g => { const arm = DUST.filter(d => d.g === g); arm.forEach((d, k) => { d.s = k / arm.length; }); });
// the door: as many points of 门 as there is dust, matched by angle around the centre (no crossing tangle)
const MEN_PTS = samplePoints(men, 3.1, 9);
const byAngle = (ps: readonly V[], c: V) => ps.map((p, i) => ({ i, a: Math.atan2(p[1] - c[1], p[0] - c[0]) })).sort((x, y) => x.a - y.a).map(x => x.i);
const spiralAt = (d: (typeof DUST)[number], b: number): V => {
  const r = 26 + 300 * d.s + d.jit * 22 * d.s, th = d.g * Math.PI + 5.2 * d.s + 0.42 * (b - 18) + 0.06 * Math.max(0, b - 22) ** 2;
  return [C[0] + Math.cos(th) * r, C[1] + Math.sin(th) * r * 0.86];
};
let doorOf: number[] | null = null;
function doorTargets() {
  if (doorOf) return doorOf;
  const sp = DUST.map(d => spiralAt(d, 25)), order = byAngle(sp, C), mo = byAngle(MEN_PTS, [0, -10]);
  doorOf = new Array(DUST.length);
  order.forEach((di, k) => { doorOf![di] = mo[Math.floor(k / order.length * mo.length)]; });
  return doorOf;
}
// the opening of 门: the point deepest in its empty space
let opening: V | null = null;
const logZoom = curve([{ t: 28, v: 0, d: 0 }, { t: 28.8, v: -0.06, d: 0 }, { t: 31.7, v: 3.9, d: 2.2 }]);

export function drawS1(ctx: CanvasRenderingContext2D, b: number) {
  ctx.fillStyle = INK; ctx.fillRect(-700, -400, 1400, 800);
  ctx.save();
  // the push through the door (and a slow push all along before it)
  const base = 1 + 0.05 * smooth(span(b, -4, 27));
  if (b > 28) {
    opening ??= deepestPoint(men, false, 140, 0.6).at;
    const z = Math.exp(Math.min(3.9, logZoom(b)));
    ctx.translate(opening[0], opening[1]); ctx.scale(z, z); ctx.translate(-opening[0], -opening[1]);
  }
  ctx.translate(C[0], C[1]); ctx.scale(base, base); ctx.translate(-C[0], -C[1]);

  // 道: hairline → Black → shattered
  if (b < 0) fillShape(ctx, daoThin, CREAM, 0.95 * smooth(span(b, -3.5, -0.6)));
  else if (b < 2) fillRings(ctx, weight(hit(span(b, 0, 2))), CREAM);
  else if (b < 4) fillShape(ctx, daoHeavy, CREAM);
  else if (b < 17) {
    const open = 4 * hit(span(b, 4, 4.25)), drift = outQuad(span(b, 4.25, 11)), fade = 1 - smooth(span(b, 11, 16.5));
    shards.forEach((s, i) => {
      const d = open + 330 * s.speed * drift, rot = s.spin * drift;
      ctx.save(); ctx.globalAlpha = fade * (1 - 0.35 * drift);
      ctx.translate(s.c[0] + s.dir[0] * d, s.c[1] + s.dir[1] * d); ctx.rotate(rot); ctx.translate(-s.c[0], -s.c[1]);
      ctx.clip(cellPaths[i]); ctx.fillStyle = CREAM; ctx.fill(pathOf(daoHeavy), "evenodd");
      ctx.restore();
    });
  }
  // 名 forms in the gap, then is blown into dust left to right
  if (b > 6 && b < 12.5) {
    const k = smooth(span(b, 6.2, 7.6)), wipe = lerp(-125, 125, span(b, 9.5, 11.9));
    ctx.save(); ctx.beginPath(); ctx.rect(b < 9.5 ? -400 : wipe, -400, 800, 800); ctx.clip();
    ctx.translate(C[0], C[1]); ctx.scale(0.9 + 0.1 * k, 0.9 + 0.1 * k); ctx.translate(-C[0], -C[1]);
    fillShape(ctx, ming, CREAM, k); ctx.restore();
  }
  if (b > 9.5 && b < 28.6) {
    const door = b > 24.5 ? doorTargets() : null, dustA = 1 - smooth(span(b, 27.4, 28.4));
    ctx.fillStyle = CREAM;
    DUST.forEach((d, i) => {
      if (b < d.release) return;
      const a = b - d.release, free = outQuad(a / 9);
      let x = lerp(d.p[0], d.to[0], free) + Math.sin(d.sway + a * 0.5) * 10 * free, y = lerp(d.p[1], d.to[1], free) - 14 * Math.min(a, 1);
      const ks = smooth(span(b, 18 + d.s * 2.5, 22 + d.s * 2.5));
      if (ks > 0) { const [sx, sy] = spiralAt(d, b); x = lerp(x, sx, ks); y = lerp(y, sy, ks); }
      if (door) { const t = MEN_PTS[door[i]], kd = hit(span(b, 25 + 0.9 * ((i * 0.618) % 1), 27 + 0.9 * ((i * 0.618) % 1))); x = lerp(x, t[0], kd); y = lerp(y, t[1], kd); }
      const size = 2.3 - 0.6 * free * (1 - ks);
      ctx.globalAlpha = dustA * (0.55 + 0.45 * Math.max(ks, 1 - free));
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
    });
    ctx.globalAlpha = 1;
  }
  if (b > 27) fillShape(ctx, men, CREAM, smooth(span(b, 27.2, 28.2)));
  ctx.restore();
}

export const prewarm = () => { weight(0.5); opening ??= deepestPoint(men, false, 140, 0.6).at; doorTargets(); };
