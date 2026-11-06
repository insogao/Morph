import type { MorphScene } from "../../packages/morph-engine/src/core/scene";
import { createSdfRenderer, type Prim, type RGB, type SdfRenderer, type Vec2 } from "../../packages/morph-engine/src/renderers/sdf-gl";
import {
  along, backOut, blendStroke, clamp, curve, hex, lerp, mixRGB, resample, rng, smooth, smoother, strokePrims,
  taper, transformPrims, win, type Stroke,
} from "../../packages/morph-engine/src/effects/skeleton";

/*
 * Umbrella → octopus.
 * Tracked parts (see plan.json):
 *   canopy dome      → mantle          (ellipsoid, cut plane slides away)
 *   canopy rim disc  → head            (eyes sit here)
 *   rib i            → tentacle i      (rib tip stubs droop, drip, grow)
 *   shaft + handle   → two front arms  (shaft unzips from the hook upward)
 *   ferrule tip      → both eyes       (melts, runs down the dome, splits)
 */

const DURATION = 8;
const CX = 520;
const RIM_Y = 300;
const W = 210, H = 132, E = 40;
const THETAS = Array.from({ length: 8 }, (_, i) => (i + .5) * Math.PI / 4);
const SHAFT_ARMS = new Map([[1, 0], [2, 1]]); // tentacle index → strand index

const C = {
  fabric: hex("#c4262f"), seam: hex("#7d1219"), metal: hex("#4a4c55"), wood: hex("#3a2620"),
  skin: hex("#d4533b"), skinBack: hex("#8f2f25"), sucker: hex("#f4c7a4"), eye: hex("#f1cf6e"), pupil: hex("#160907"),
  chrome: hex("#c9ced6"),
};

// ---------- timeline ----------
const water = (t: number) => lerp(780, -60, smoother((t - .5) / 2.9));
const sagT = (t: number) => win(t, 1.45, 2.7);
const meltT = (t: number) => win(t, 1.7, 2.9) * (1 - .85 * win(t, 3.7, 4.6));
const formT = (t: number) => smoother((t - 2.45) / 2.05);
const skinT = (t: number) => win(t, 2.8, 4.3);

// ---------- body ----------
function bodyFrame(t: number) {
  const f = formT(t), sag = sagT(t);
  const mx = CX + 30 * f;
  return {
    f,
    dome: { x: lerp(CX, mx - 10, f), y: lerp(RIM_Y, 246, f), rx: lerp(W * (1 + .04 * sag), 102, f), ry: lerp(H * (1 - .12 * sag), 114, f), rot: lerp(0, -.24, f) },
    cut: lerp(RIM_Y, 900, smooth((f - .15) / .6)),
    rim: { x: lerp(CX, mx, f), y: lerp(RIM_Y + 2, 346, f), rx: lerp(W, 82, f), ry: lerp(E, 58, f) },
    root: (theta: number): Vec2 => [
      lerp(CX + W * Math.cos(theta), mx + 64 * Math.cos(theta), f),
      lerp(RIM_Y + E * Math.sin(theta), 384 + 15 * Math.sin(theta), f),
    ],
  };
}

function surfaceColor(t: number, back = false): RGB {
  return mixRGB(C.fabric, back ? C.skinBack : C.skin, skinT(t));
}

// ---------- tentacles ----------
const tentacleLength = [232, 250, 246, 226, 214, 222, 218, 208];

function octoStroke(i: number, t: number, grow: number, frame = bodyFrame(t)): Stroke {
  const theta = THETAS[i], c = Math.cos(theta);
  const [rx, ry] = frame.root(theta);
  const swim = win(t, 5, 5.4);
  const pulse = jetPulse(t);
  const len = lerp(18, tentacleLength[i], grow) * (1 - .06 * pulse);
  const spread = lerp(.78, .25, pulse * swim);
  const angle = Math.PI / 2 - spread * c + lerp(0, .25, swim) * -1;
  const curl = -Math.sign(c || 1) * lerp(.004, i === 2 ? .034 : .021, grow) * (1 - .55 * pulse * swim);
  const phase = i * 1.7;
  const alive = win(t, 3.6, 4.6);
  const points = curve({
    x: rx, y: ry, angle, length: len, segments: 13,
    curvature: s => curl * smooth((s - .35) / .65) + alive * (.006 + .004 * swim) * Math.sin(s * 7.5 - t * (3 + swim * 2.4) + phase) * (.3 + s),
  });
  return { points, radii: taper(14, lerp(5, 20, grow), lerp(2.6, 1.5, grow), 1.25) };
}

function ribStub(i: number, t: number, frame = bodyFrame(t)): Stroke {
  const theta = THETAS[i], c = Math.cos(theta), sag = sagT(t);
  const [rx, ry] = frame.root(theta);
  const angle = Math.atan2(.32 + sag * .9, c * 1.1);
  return {
    points: curve({ x: rx, y: ry, angle, length: lerp(16, 44, sag), segments: 13, curvature: s => Math.sign(c) * sag * .028 * s }),
    radii: taper(14, lerp(4.2, 6, sag), lerp(2.6, 2.4, sag), 1),
  };
}

function tentacle(i: number, t: number, frame = bodyFrame(t)): Stroke {
  const grow = smoother((t - 2.55 - [3, 0, 0, 3, 1, 2, 2, 1][i] * .07) / 1.95);
  const stub = ribStub(i, t, frame);
  if (grow <= 0) return stub;
  return blendStroke(stub, octoStroke(i, t, grow, frame), smooth(grow * 1.6));
}

// The shaft is a straight rod plus a J hook. Both strands start identical, then unzip from the hook up.
const shaftLine = (() => {
  const L = 250, hook = 84;
  const pts = curve({ x: CX, y: RIM_Y + 10, angle: Math.PI / 2, length: L + hook, segments: 60,
    curvature: s => s > L / (L + hook) ? Math.PI / hook : 0 });
  return resample(pts, 14);
})();

function strand(k: number, t: number, frame = bodyFrame(t)): Stroke {
  const i = k === 0 ? 1 : 2;
  const sway = swayAngle(t);
  const melt = meltT(t);
  const base: Stroke = {
    points: shaftLine.map(([x, y], j) => {
      const s = j / 13;
      const droop = melt * 14 * Math.sin(s * 3 + t * 2.2) * s;
      return [x + droop + Math.sin(sway) * (y - RIM_Y), y] as Vec2;
    }),
    radii: shaftLine.map((_, j) => j === 0 ? 7 : 6.2 + melt * 1.6 * Math.sin(j * 1.3 + t * 3)),
  };
  const target = octoStroke(i, t, smoother((t - 2.6) / 1.9), frame);
  return {
    points: base.points.map((p, j) => {
      const s = j / 13;
      const w = smoother((t - 2.7 - (1 - s) * .55 - (k ? .08 : 0)) / 1.0);
      return [lerp(p[0], target.points[j][0], w), lerp(p[1], target.points[j][1], w)] as Vec2;
    }),
    radii: base.radii.map((r, j) => {
      const s = j / 13;
      const w = smoother((t - 2.7 - (1 - s) * .55) / 1.0);
      return lerp(r, target.radii[j], w);
    }),
  };
}

// ---------- motion ----------
function swayAngle(t: number) {
  return .035 * Math.sin(t * 1.9) * (1 - win(t, 2.2, 3.2));
}

function jetPulse(t: number) {
  let p = 0;
  for (const start of [5.25, 6.65]) {
    const u = (t - start) / 1.25;
    if (u > 0 && u < 1) p = Math.max(p, u < .3 ? smooth(u / .3) : 1 - smooth((u - .3) / .7));
  }
  return p;
}

function swimOffset(t: number): { move: Vec2; angle: number } {
  let d = 0;
  for (const start of [5.25, 6.65]) {
    const u = clamp((t - start) / 1.35);
    d += 1 - Math.pow(1 - u, 3);
  }
  const drift = win(t, 4.6, 8) * 26;
  const dist = d * 138 + drift;
  const heading = -.58;
  return { move: [Math.cos(heading) * dist, Math.sin(heading) * dist * .32], angle: .3 * win(t, 4.9, 6.2) };
}

// ---------- assemble primitives ----------
function frontPrims(t: number): Prim[] {
  const fr = bodyFrame(t);
  const f = fr.f;
  const skin = surfaceColor(t);
  const wob = meltT(t) * 4.5 + win(t, 4, 5) * .8;
  const sss = lerp(.25, 1, skinT(t));
  const gloss = lerp(.32, .6, skinT(t));
  const mottle = .9 * skinT(t);
  const anchor: Vec2 = [fr.rim.x, fr.rim.y];
  const pulse = jetPulse(t);
  const squeeze = 1 - .1 * pulse;
  const base = { sss, gloss, mottle, anchor, wobble: wob };
  const prims: Prim[] = [];

  // Canopy dome → mantle. The halfplane cut makes the umbrella's flat underside; it slides away.
  prims.push({ ...base, shape: { kind: "ellipse", x: fr.dome.x, y: fr.dome.y, rx: fr.dome.rx * squeeze, ry: fr.dome.ry * (1 + .06 * pulse), rotation: fr.dome.rot }, color: skin });
  prims.push({ ...base, op: "intersect", blend: 4, shape: { kind: "halfplane", nx: 0, ny: 1, offset: fr.cut }, color: skin });
  // Rim disc → head.
  prims.push({ ...base, blend: lerp(8, 30, f), shape: { kind: "ellipse", x: fr.rim.x, y: fr.rim.y, rx: fr.rim.rx * (1 - .05 * pulse), ry: fr.rim.ry }, color: skin });

  // Scallops between front ribs deepen as the fabric sags, then close into skin.
  const scallop = sagT(t) * (1 - smooth((f - .1) / .5));
  if (scallop > .01) {
    for (let k = 0; k <= 4; k++) {
      const a = k * Math.PI / 4;
      const r = 18 + 26 * scallop;
      prims.push({ ...base, op: "subtract", blend: 6, color: skin,
        shape: { kind: "ellipse", x: CX + (W + r * .55) * Math.cos(a), y: RIM_Y + (E + r * .2) * Math.sin(a) + r * .62, rx: r * 1.15, ry: r } });
    }
  }

  // Ferrule: a metal spike that melts into the bead that becomes the eyes.
  const ferrule = 1 - win(t, 1.65, 2.25);
  if (ferrule > 0) {
    const top: Vec2 = [fr.dome.x, fr.dome.y - fr.dome.ry];
    prims.push({ shape: { kind: "capsule", ax: top[0], ay: top[1] + 4, bx: top[0], by: top[1] - 30 * ferrule, ra: 6 * ferrule + 2, rb: 2.2 * ferrule },
      color: C.metal, gloss: .9, blend: 5 });
  }

  // Front tentacles (sin θ > 0 → nearer the viewer).
  for (let i = 0; i < 4; i++) {
    const strandIndex = SHAFT_ARMS.get(i);
    let stroke: Stroke;
    if (strandIndex !== undefined) {
      // This rib retracts; the shaft half takes its place.
      const stub = ribStub(i, t, fr);
      const gone = win(t, 2.2, 3.0);
      stroke = { points: stub.points, radii: stub.radii.map(r => r * (1 - gone)) };
      prims.push(...strokePrims(stroke, { ...base, color: mixRGB(C.metal, skin, gone), rootBlend: 4, jointBlend: .5 }));
      continue;
    }
    stroke = tentacle(i, t, fr);
    prims.push(...strokePrims(stroke, { ...base, color: s => mixRGB(C.metal, skin, smooth(skinT(t) * 1.6 - s * .5 + win(t, 2.4, 3) * .4)), rootBlend: lerp(4, 16, f), jointBlend: .8 }));
  }

  // Shaft strands.
  for (let k = 0; k < 2; k++) {
    const st = strand(k, t, fr);
    const woodToSkin = (s: number) => mixRGB(C.wood, skin, smooth((t - 2.7 - (1 - s) * .55) / 1.1));
    prims.push(...strokePrims(st, { ...base, wobble: wob * .6, gloss: lerp(.55, gloss, skinT(t)), color: woodToSkin, rootBlend: lerp(3, 16, f), jointBlend: .6 }));
  }

  // Drips from the outer front ribs, caught later by the same tentacle tips.
  for (const [i, release] of [[0, 2.15], [3, 2.3]] as const) {
    const grow = win(t, release - .5, release);
    const catchAt = 3.75;
    const absorbed = win(t, catchAt, catchAt + .35);
    if (grow <= 0 || absorbed >= 1) continue;
    const stubAtRelease = ribStub(i, release);
    const from = stubAtRelease.points.at(-1)!;
    const to = tentacle(i, catchAt).points.at(-1)!;
    const tipNow = tentacle(i, t, fr).points.at(-1)!;
    let p: Vec2;
    if (t < release) p = ribStub(i, t, fr).points.at(-1)!;
    else if (t < catchAt) {
      const u = (t - release) / (catchAt - release);
      const e = 1 - Math.pow(1 - u, 2.2);
      p = [lerp(from[0], to[0], e), lerp(from[1], to[1], e) + Math.sin(u * Math.PI) * 10];
    } else p = tipNow;
    const r = 6.5 * grow * (1 - absorbed);
    const stretch = t > release && t < release + .3 ? 1 + .5 * Math.sin((t - release) / .3 * Math.PI) : 1;
    prims.push({ ...base, wobble: 0, shape: { kind: "ellipse", x: p[0], y: p[1] + r * .5, rx: r / Math.sqrt(stretch), ry: r * stretch }, color: mixRGB(C.fabric, skin, skinT(t)), blend: 7 });
  }

  // ---- decals ----
  // Seams of the canopy panels, tracing ribs; they dissolve into skin.
  const seam = 1 - win(t, 2.5, 3.5);
  if (seam > 0) {
    for (let i = 0; i < 4; i++) {
      const theta = THETAS[i];
      const pts: Vec2[] = [];
      for (let j = 0; j <= 10; j++) {
        const phi = j / 10 * Math.PI / 2;
        const x3 = fr.dome.rx * Math.sin(phi) * Math.cos(theta), z3 = fr.dome.rx * Math.sin(phi) * Math.sin(theta);
        pts.push([fr.dome.x + x3, fr.dome.y - fr.dome.ry * Math.cos(phi) + z3 * E / W]);
      }
      for (let j = 0; j < 10; j++) {
        prims.push({ decal: true, opacity: seam * .85, bump: -1.2, color: C.seam, gloss: .2,
          shape: { kind: "capsule", ax: pts[j][0], ay: pts[j][1], bx: pts[j + 1][0], by: pts[j + 1][1], ra: 1.6, rb: 1.6 } });
      }
    }
    // A soft sheen band on the fabric.
    prims.push({ decal: true, opacity: seam * .18, color: hex("#ff8c86"), gloss: .2, bump: 0,
      shape: { kind: "ellipse", x: fr.dome.x - 60, y: fr.dome.y - 70, rx: 70, ry: 26, rotation: -.35 } });
  }

  // Suckers on the front arms, root to tip.
  const suckers = win(t, 4.05, 4.3);
  if (suckers > 0) {
    for (let i = 0; i < 4; i++) {
      const st = SHAFT_ARMS.has(i) ? strand(SHAFT_ARMS.get(i)!, t, fr) : tentacle(i, t, fr);
      const side = Math.cos(THETAS[i]) > 0 ? -1 : 1;
      for (let k = 0; k < 9; k++) {
        const s = .14 + k * .085;
        const appear = win(t, 4.05 + s * .7, 4.25 + s * .7);
        if (appear <= 0) continue;
        const { p, t: tan } = along(st.points, s);
        const r = lerp(st.radii[0], st.radii.at(-1)!, Math.pow(s, .8)) * .42 * backOut(appear);
        const nx = -tan[1] * side, ny = tan[0] * side;
        const off = r * 1.4;
        prims.push({ decal: true, opacity: appear, bump: 2.2, color: C.sucker, gloss: .5,
          shape: { kind: "ellipse", x: p[0] + nx * off, y: p[1] + ny * off, rx: r, ry: r * .82, rotation: Math.atan2(tan[1], tan[0]) } });
      }
    }
  }

  // Ferrule bead travels down the dome front, splits in two, and opens as eyes.
  prims.push(...eyes(t, fr));
  return prims;
}

function eyes(t: number, fr: ReturnType<typeof bodyFrame>): Prim[] {
  const travel = smoother((t - 2.05) / 1.65);
  const visible = win(t, 1.85, 2.15);
  if (visible <= 0) return [];
  const out: Prim[] = [];
  const top: Vec2 = [fr.dome.x, fr.dome.y - fr.dome.ry + 6];
  const split = smooth((t - 2.75) / .7);
  const open = backOut(smooth((t - 3.65) / .6), 1.6);
  const blink = 1 - .9 * Math.max(0, Math.sin(clamp((t - 6.45) / .22) * Math.PI));
  for (const side of [-1, 1]) {
    const target: Vec2 = [fr.rim.x + side * lerp(70, 33, fr.f) + 6, fr.rim.y + lerp(20, -4, fr.f)];
    const mid: Vec2 = [fr.dome.x + side * 18 * split + 18, fr.dome.y - fr.dome.ry * .3];
    const u = travel;
    const p: Vec2 = [
      (1 - u) * (1 - u) * top[0] + 2 * u * (1 - u) * mid[0] + u * u * target[0],
      (1 - u) * (1 - u) * top[1] + 2 * u * (1 - u) * mid[1] + u * u * target[1],
    ];
    const px = p[0];
    const bead = lerp(7, 5, split) * visible;
    const lid = 18 * open;
    if (lid > .5) out.push({ decal: true, opacity: clamp(open), bump: 6, color: mixRGB(C.skin, hex("#e9745a"), .4), gloss: .5,
      shape: { kind: "ellipse", x: p[0], y: p[1] - 1, rx: lid * 1.08, ry: lid } });
    out.push({ decal: true, opacity: 1, bump: 3 + 2 * open, color: mixRGB(C.chrome, C.eye, smooth(open)), gloss: .95,
      shape: { kind: "ellipse", x: px, y: p[1], rx: Math.max(bead, 12.5 * open), ry: Math.max(bead, 12.5 * open) * blink } });
    if (open > .3) {
      out.push({ decal: true, opacity: clamp((open - .3) * 2), bump: 0, color: C.pupil, gloss: .9,
        shape: { kind: "box", x: px + side * 1.5, y: p[1] + 1, hw: 8, hh: 2.6 * blink, radius: 1.6, rotation: side * .1 } });
      out.push({ decal: true, opacity: clamp((open - .5) * 2) * blink, bump: .5, color: [1, 1, 1], gloss: 1,
        shape: { kind: "ellipse", x: px - 3.5, y: p[1] - 4, rx: 2.2, ry: 2.2 } });
    }
  }
  return out;
}

function backPrims(t: number): Prim[] {
  const fr = bodyFrame(t);
  const prims: Prim[] = [];
  const color = surfaceColor(t, true);
  const wob = meltT(t) * 5 + 1;
  for (let i = 4; i < 8; i++) {
    prims.push(...strokePrims(tentacle(i, t, fr), {
      color: mixRGB(mixRGB(C.metal, C.fabric, .3), color, skinT(t)), sss: lerp(.2, .9, skinT(t)), gloss: .45, mottle: .7 * skinT(t),
      anchor: [fr.rim.x, fr.rim.y], wobble: wob, rootBlend: 0, jointBlend: 6,
    }));
  }
  return prims;
}

// ---------- environment ----------
const r = rng(42);
const rain = Array.from({ length: 220 }, () => ({ x: r() * 1340 - 30, phase: r(), speed: .8 + r() * .5, len: 14 + r() * 22 }));
const bubbles = Array.from({ length: 70 }, () => ({ x: r() * 1280, phase: r(), size: 1.2 + r() * 3.8, wob: r() * 6 }));
const motes = Array.from({ length: 160 }, () => ({ x: r() * 1280, y: r() * 720, s: .4 + r() * 1.2, p: r() * 6 }));

function background(ctx: CanvasRenderingContext2D, t: number, wl: number) {
  const sky = ctx.createLinearGradient(0, 0, 0, 720);
  sky.addColorStop(0, "#2a313b");
  sky.addColorStop(1, "#46505a");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1280, 720);
  // Rain above the surface.
  ctx.strokeStyle = "#c6d3e044";
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  for (const d of rain) {
    const y = ((d.phase + t * d.speed * 1.35) % 1) * 820 - 60;
    if (y > wl) continue;
    ctx.moveTo(d.x, y);
    ctx.lineTo(d.x - d.len * .18, y + Math.min(d.len, wl - y));
  }
  ctx.stroke();
  if (wl < 720) {
    const sea = ctx.createLinearGradient(0, wl, 0, Math.max(wl + 700, 720));
    sea.addColorStop(0, "#1f6e7c");
    sea.addColorStop(.35, "#0e4253");
    sea.addColorStop(1, "#06202c");
    ctx.fillStyle = sea;
    ctx.fillRect(0, Math.max(0, wl), 1280, 720);
    // Light shafts.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let k = 0; k < 6; k++) {
      const x = 180 + k * 210 + Math.sin(t * .4 + k) * 30;
      const g = ctx.createLinearGradient(x, wl, x + 160, 720);
      g.addColorStop(0, "#7fe0e81c");
      g.addColorStop(1, "#7fe0e800");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - 30, Math.max(wl, -40));
      ctx.lineTo(x + 40 + k * 6, Math.max(wl, -40));
      ctx.lineTo(x + 260, 760);
      ctx.lineTo(x + 90, 760);
      ctx.fill();
    }
    ctx.restore();
    // Suspended motes and rising bubbles below the surface.
    ctx.fillStyle = "#a8e6e830";
    for (const m of motes) if (m.y > wl) ctx.fillRect(m.x + Math.sin(t * .6 + m.p) * 4, m.y, m.s, m.s);
    for (const b of bubbles) {
      const y = 760 - ((b.phase + t * .11) % 1) * 820;
      if (y < wl + 6) continue;
      ctx.strokeStyle = "#bff3f560";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(b.x + Math.sin(t * 2 + b.wob) * 3, y, b.size, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function surface(ctx: CanvasRenderingContext2D, t: number, wl: number) {
  if (wl > 740 || wl < -40) return;
  ctx.save();
  // Submerged tint over everything below the surface.
  ctx.fillStyle = "#0b4a5a24";
  ctx.fillRect(0, wl, 1280, 720 - wl);
  ctx.beginPath();
  for (let x = 0; x <= 1280; x += 8) {
    const y = wl + Math.sin(x * .021 + t * 3.1) * 3.5 + Math.sin(x * .053 - t * 2.3) * 1.8;
    if (x) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.strokeStyle = "#dff9ff";
  ctx.globalAlpha = .75;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.globalAlpha = .18;
  ctx.lineWidth = 9;
  ctx.stroke();
  ctx.restore();
  // Rain rings on the surface.
  ctx.strokeStyle = "#e6fbff55";
  ctx.lineWidth = 1;
  for (let k = 0; k < 14; k++) {
    const life = (t * 1.7 + k * .37) % 1;
    const x = (k * 97.3 + Math.floor(t * 1.7 + k * .37) * 211) % 1280;
    ctx.globalAlpha = 1 - life;
    ctx.beginPath();
    ctx.ellipse(x, wl, 4 + life * 26, 1 + life * 4, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function frameText(ctx: CanvasRenderingContext2D, t: number) {
  ctx.fillStyle = "#e7f1f2a8";
  ctx.font = "11px ui-monospace, Menlo, monospace";
  ctx.fillText("CREATIVE MORPH  /  02", 44, 50);
  ctx.fillStyle = "#e7f1f266";
  ctx.fillText("UMBRELLA  →  OCTOPUS", 44, 66);
  ctx.textAlign = "right";
  ctx.fillText(t.toFixed(2).padStart(5, "0") + " s", 1236, 676);
  ctx.textAlign = "left";
  const g = ctx.createRadialGradient(640, 360, 260, 640, 360, 820);
  g.addColorStop(0, "#00000000");
  g.addColorStop(1, "#00000088");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1280, 720);
}

let renderer: SdfRenderer | null = null;

export const scene: MorphScene = {
  id: "umbrella-octopus",
  title: "雨伞 → 章鱼",
  duration: DURATION,
  draw(ctx, t) {
    renderer ??= createSdfRenderer();
    const wl = water(t);
    background(ctx, t, wl);
    const sub = smooth((RIM_Y + 60 - wl) / 220);
    const pivot: Vec2 = [CX + 30, 350];
    const { move, angle } = swimOffset(t);
    const sway = swayAngle(t);
    const look = {
      thickness: 24, time: t, seed: 3,
      light: [-.42, -.7, .6] as const,
      keyColor: mixRGB([1, .96, .9], [.86, .98, 1], sub),
      ambientTop: mixRGB([.5, .52, .58], [.32, .6, .66], sub),
      ambientBottom: mixRGB([.2, .18, .2], [.08, .16, .22], sub),
      rimColor: mixRGB([.75, .8, .9], [.5, 1, 1], sub),
      sssColor: [1, .42, .22] as RGB,
    };
    const place = (prims: Prim[]) => transformPrims(transformPrims(prims, sway, [CX, RIM_Y]), angle, pivot, move);
    renderer.draw(ctx, place(backPrims(t)), { ...look, keyColor: mixRGB(look.keyColor, [.5, .6, .7], .4) });
    renderer.draw(ctx, place(frontPrims(t)), look);
    surface(ctx, t, wl);
    frameText(ctx, t);
  },
};
