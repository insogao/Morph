import type { MorphScene } from "../../packages/morph-engine/src/core/scene";
import type { Vec2 } from "../../packages/morph-engine/src/renderers/sdf-gl";
import { colonize } from "../../packages/morph-engine/src/effects/growth";
import { clamp, lerp, rng, smooth, win } from "../../packages/morph-engine/src/effects/skeleton";

/*
 * Growth fills a silhouette. A seed splits, a sapling climbs, and space-colonization
 * branching spreads only where the target (a sitting hare) has volume, so the canopy
 * *is* the animal. Blossoms open at the twig tips, the outline resolves, a petal-wind
 * passes, and the hare's ear twitches.
 */

const HARE: Vec2[] = [
  [520, 598], [498, 540], [508, 472], [556, 424], [596, 398], [600, 352], [618, 322], [646, 306], [636, 268], [626, 196], [636, 140],
  [656, 128], [672, 160], [672, 240], [684, 292], [702, 272], [722, 196], [744, 158], [762, 168], [754, 224], [726, 300],
  [748, 330], [764, 360], [748, 386], [712, 396], [722, 450], [738, 520], [764, 586], [742, 602], [650, 606], [560, 604],
];
const ROOT: Vec2 = [600, 690];
const { nodes } = colonize(HARE, ROOT, { seed: 9, attractors: 1500, influence: 70, step: 6, kill: 9, maxIterations: 600 });
const T0 = .9, T1 = 4.6;
// Reveal by node order (not iteration) so growth speed stays even while stragglers finish.
const bornAt = (i: number) => T0 + Math.pow(i / nodes.length, .8) * (T1 - T0);
const tips = nodes.map((n, i) => ({ n, i })).filter(({ n, i }) => n.children === 0 || (i % 3 === 0 && n.radius < 2.2));
const r = rng(4);
const blossoms = tips.map(({ n, i }) => ({ p: n.p, i, delay: r() * .5, size: 3 + r() * 3.5, hue: r(), rot: r() * Math.PI }));
const EAR_TIP_Y = 250;

/** Wind and the final ear twitch, applied as a bend that grows with height above the root. */
function bend(p: Vec2, t: number): Vec2 {
  const h = clamp((ROOT[1] - p[1]) / 560);
  const wind = win(t, 5.4, 6.0) * (1 - win(t, 6.6, 7.4)) * Math.sin(t * 5) * 6 * h * h;
  let x = p[0] + wind, y = p[1];
  const twitch = Math.max(0, Math.sin(clamp((t - 6.8) / .35) * Math.PI));
  if (p[1] < EAR_TIP_Y + 60 && p[0] > 690) {
    const k = clamp((EAR_TIP_Y + 60 - p[1]) / 140) * twitch * .35;
    const cx = 700, cy = 300, c = Math.cos(k), s = Math.sin(k);
    [x, y] = [cx + c * (x - cx) - s * (y - cy), cy + s * (x - cx) + c * (y - cy)];
  }
  return [x, y];
}

function petalColor(h: number, a: number) {
  const pink = [248, 196, 210], white = [255, 244, 240];
  return `rgba(${pink.map((v, k) => Math.round(lerp(v, white[k], h))).join(",")},${a})`;
}

export const scene: MorphScene = {
  id: "seed-rabbit",
  title: "Lab · 生长成形（种子 → 兔）",
  duration: 7.6,
  draw(ctx, t) {
    const g = ctx.createLinearGradient(0, 0, 0, 720);
    g.addColorStop(0, "#1d2a24"); g.addColorStop(1, "#0d1411");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1280, 720);
    // Soil line.
    ctx.fillStyle = "#2a2219";
    ctx.fillRect(0, 676, 1280, 44);

    // Seed: a husk that splits open as the root emerges.
    const crack = win(t, .3, .9);
    const husk = 1 - win(t, 1.4, 2.2);
    if (husk > 0) {
      ctx.save();
      ctx.translate(ROOT[0], ROOT[1] - 4);
      ctx.globalAlpha = husk;
      ctx.fillStyle = "#8a5a35";
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.rotate(side * crack * .5);
        ctx.beginPath();
        ctx.ellipse(side * 4 * crack, 0, 11, 16, 0, side < 0 ? Math.PI / 2 : -Math.PI / 2, side < 0 ? Math.PI * 1.5 : Math.PI / 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // Branches, root to tip, each segment grows over a short window after its node is born.
    ctx.lineCap = "round";
    for (let i = 1; i < nodes.length; i++) {
      const n = nodes[i];
      const grow = clamp((t - bornAt(i)) / .18);
      if (grow <= 0) continue;
      const a = bend(nodes[n.parent].p, t), b = bend(n.p, t);
      const tip: Vec2 = [lerp(a[0], b[0], grow), lerp(a[1], b[1], grow)];
      const age = clamp((t - bornAt(i)) / 1.2);
      ctx.strokeStyle = `rgb(${Math.round(lerp(150, 92, age))},${Math.round(lerp(190, 70, age))},${Math.round(lerp(110, 52, age))})`;
      ctx.lineWidth = Math.max(.8, n.radius * 1.15 * lerp(.6, 1, age));
      ctx.beginPath();
      ctx.moveTo(...a);
      ctx.lineTo(...tip);
      ctx.stroke();
    }

    // Blossoms open at twig tips.
    for (const b of blossoms) {
      const open = smooth((t - Math.max(bornAt(b.i) + .25, 3.6 + (1 - (b.p[1] - 120) / 500) * .8) - b.delay) / .5);
      if (open <= 0) continue;
      const p = bend(b.p, t);
      const s = b.size * open;
      ctx.fillStyle = petalColor(b.hue, .85);
      for (let k = 0; k < 5; k++) {
        const ang = b.rot + k * Math.PI * 2 / 5;
        ctx.beginPath();
        ctx.ellipse(p[0] + Math.cos(ang) * s * .7, p[1] + Math.sin(ang) * s * .7, s * .62, s * .4, ang, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#f0c060";
      ctx.beginPath(); ctx.arc(p[0], p[1], s * .22, 0, Math.PI * 2); ctx.fill();
    }

    // Once the canopy is full, a soft glow resolves the hare's silhouette and its eye.
    const resolve = win(t, 5.0, 6.0);
    if (resolve > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = resolve * .1;
      ctx.fillStyle = "#ffd6e2";
      ctx.beginPath();
      HARE.forEach((p, i) => { const q = bend(p, t); if (i) ctx.lineTo(...q); else ctx.moveTo(...q); });
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      const eye = bend([712, 340], t);
      ctx.fillStyle = `rgba(40,12,20,${resolve})`;
      ctx.beginPath(); ctx.arc(eye[0], eye[1], 6 * resolve, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${resolve})`;
      ctx.beginPath(); ctx.arc(eye[0] - 2, eye[1] - 2, 1.6, 0, Math.PI * 2); ctx.fill();
    }

    // Petal wind.
    const wind = win(t, 5.4, 6.0);
    if (wind > 0) {
      const pr = rng(31);
      for (let k = 0; k < 40; k++) {
        const b = blossoms[Math.floor(pr() * blossoms.length)];
        const age = t - 5.4 - pr() * .8;
        if (age < 0) continue;
        const x = b.p[0] + age * (160 + pr() * 120), y = b.p[1] + age * (30 + pr() * 40) + Math.sin(age * 5 + k) * 10;
        ctx.fillStyle = petalColor(b.hue, clamp(1 - age / 2) * .8);
        ctx.beginPath(); ctx.ellipse(x, y, 3.2, 1.8, age * 4 + k, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.fillStyle = "#d8e6d8aa";
    ctx.font = "11px ui-monospace, Menlo, monospace";
    ctx.fillText("LAB  /  GROWTH FILLS A SILHOUETTE   种子 → 兔", 44, 50);
  },
};
