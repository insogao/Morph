import type { Vec2 } from "../../packages/morph-engine/src/vector/geom";
import { buildMesh, type Mesh } from "../../packages/morph-engine/src/vector/mesh";
import swallowJson from "./swallow.json";
import koiJson from "./koi.json";

/*
 * Pure rig for r2-swallow-koi (no DOM, testable with tsx).
 *
 * Frames:
 *   A  the swallow's own design space (1920×1080 art × 2/3), head up.
 *   W  the koi's design space (head left). Every mesh lives here.
 * S0 lays the swallow into W: turned −90° (head → left), scaled ×K, body centre on the koi's fore-body.
 * Each part has a pre-warp pose Q (S0, or S0 then a wing fold about the shoulder). The mesh warps Q(A part) → B part.
 * A global carrier G(t) (scene.ts) flies the whole thing on screen.
 */

type Rings = Record<string, { rings: Array<Array<[number, number]>> }>;
const SW = (swallowJson as unknown as { layers: Rings }).layers;
const KO = (koiJson as unknown as { layers: Rings }).layers;

/** A similarity z ↦ m·z + b as complex numbers. */
export interface Sim { m: Vec2; b: Vec2 }
export const apply = (s: Sim, [x, y]: Vec2): Vec2 => [s.m[0] * x - s.m[1] * y + s.b[0], s.m[1] * x + s.m[0] * y + s.b[1]];
export const inverse = (s: Sim): Sim => {
  const d = s.m[0] ** 2 + s.m[1] ** 2, mi: Vec2 = [s.m[0] / d, -s.m[1] / d];
  const nb = apply({ m: mi, b: [0, 0] }, s.b);
  return { m: mi, b: [-nb[0], -nb[1]] };
};
export const compose = (outer: Sim, inner: Sim): Sim => {
  const m: Vec2 = [outer.m[0] * inner.m[0] - outer.m[1] * inner.m[1], outer.m[0] * inner.m[1] + outer.m[1] * inner.m[0]];
  return { m, b: apply(outer, inner.b) };
};
/** Similarity that rotates by a, scales by s about pivot c, then moves c to w. */
export const simAbout = (c: Vec2, w: Vec2, a: number, s: number): Sim => {
  const m: Vec2 = [s * Math.cos(a), s * Math.sin(a)];
  return { m, b: [w[0] - (m[0] * c[0] - m[1] * c[1]), w[1] - (m[1] * c[0] + m[0] * c[1])] };
};
const angleOf = (s: Sim) => Math.atan2(s.m[1], s.m[0]);
const scaleOf = (s: Sim) => Math.hypot(s.m[0], s.m[1]);
/** Pose interpolation S0 → Q: log-scale, shortest angle, and the anchor point travels straight. */
export function lerpSim(a: Sim, b: Sim, anchor: Vec2, t: number): Sim {
  let da = angleOf(b) - angleOf(a);
  while (da > Math.PI) da -= 2 * Math.PI;
  while (da < -Math.PI) da += 2 * Math.PI;
  const ang = angleOf(a) + da * t, sc = scaleOf(a) * Math.pow(scaleOf(b) / scaleOf(a), t);
  const pa = apply(a, anchor), pb = apply(b, anchor);
  return simAbout(anchor, [pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t], ang, sc);
}

const ring = (L: Rings, id: string, i = 0): Vec2[] => L[id].rings[i].map(([x, y]) => [x, y] as Vec2);
const by = <T>(pts: T[], f: (p: T) => number) => pts.reduce((best, p) => (f(p) < f(best) ? p : best));

/** Sutherland–Hodgman: keep the side of line L0→L1 where sign(cross) === keep. */
function clip(r: Vec2[], L0: Vec2, L1: Vec2, keep: 1 | -1): Vec2[] {
  const side = (p: Vec2) => keep * ((L1[0] - L0[0]) * (p[1] - L0[1]) - (L1[1] - L0[1]) * (p[0] - L0[0]));
  const out: Vec2[] = [];
  for (let i = 0; i < r.length; i++) {
    const p = r[i], q = r[(i + 1) % r.length], sp = side(p), sq = side(q);
    if (sp >= 0) out.push(p);
    if ((sp >= 0) !== (sq >= 0)) { const u = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u]); }
  }
  return out;
}

// ---- A: the swallow (A space). The forked tail is two streamers (two rings). ----
const A = {
  body: ring(SW, "body"),
  wing_left: ring(SW, "wing_left"),
  wing_right: ring(SW, "wing_right"),
  ...(() => {
    const r0 = ring(SW, "tail", 0), r1 = ring(SW, "tail", 1);
    const left = Math.min(...r0.map(p => p[0])) < Math.min(...r1.map(p => p[0]));
    return { streamer_left: left ? r0 : r1, streamer_right: left ? r1 : r0 };
  })(),
};
// ---- B: the koi (W space). The caudal fin is cut along its fork into an upper and a lower lobe. ----
const koiTail = ring(KO, "tail");
const NOTCH = by(koiTail.filter(p => p[0] > 880 && p[1] > 330 && p[1] < 370), p => p[0]); // the fork's inner point
const ROOT: Vec2 = [806, 357];
const B = {
  body: ring(KO, "body", 0),
  dorsal: ring(KO, "dorsal"),
  pectoral: ring(KO, "pectoral"),
  lobe_up: clip(koiTail, ROOT, NOTCH, -1),
  lobe_lo: clip(koiTail, ROOT, NOTCH, 1),
};
export const KOI_EYE: Vec2 = (() => { const r = ring(KO, "eye"); return [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length]; })();

// ---- S0: swallow → koi frame. ----
export const K = 1.55;
export const P_A: Vec2 = [641, 378];   // swallow body centre
export const P_W: Vec2 = [560, 368];   // where it sits on the koi
export const S0 = simAbout(P_A, P_W, -Math.PI / 2, K);

// Landmarks (A space).
const BEAK = by(A.body, p => p[1]);                                   // top of the body ring
const RUMP = by(A.body, p => -p[1]);                                  // bottom of the body ring
const SHOULDER_L: Vec2 = [609, 343], SHOULDER_R: Vec2 = [672, 343];
const TIP_L = by(A.wing_left, p => p[0]), TIP_R = by(A.wing_right, p => -p[0]);
const tipOf = (r: Vec2[]) => by(r, p => -p[1]);                       // streamer tip = lowest point
// Landmarks (W space).
const SNOUT = by(B.body, p => p[0]);
const PEDUNCLE: Vec2 = by(B.body, p => -p[0]);
const DORSAL_ROOT = by(B.dorsal, p => p[0]), DORSAL_TIP = by(B.dorsal, p => -p[0]);
const PECT_ROOT: Vec2 = [427, 400], PECT_TIP = by(B.pectoral, p => -p[1]);
const LOBE_UP_TIP = by(B.lobe_up, p => p[1] + 0.3 * -p[0]), LOBE_LO_TIP = by(B.lobe_lo, p => -p[1] - 0.3 * p[0]);

/**
 * Wing fold: after S0 the wing sticks straight up (right wing) or down (left wing). It sweeps back about the shoulder
 * until its root→tip line lies along the fin's root→tip line, and goes halfway to the fin's size and place.
 */
function foldPose(shoulder: Vec2, tip: Vec2, finRoot: Vec2, finTip: Vec2): Sim {
  const s = apply(S0, shoulder), w = apply(S0, tip);
  const wingAng = Math.atan2(w[1] - s[1], w[0] - s[0]), finAng = Math.atan2(finTip[1] - finRoot[1], finTip[0] - finRoot[0]);
  const wingLen = Math.hypot(w[0] - s[0], w[1] - s[1]), finLen = Math.hypot(finTip[0] - finRoot[0], finTip[1] - finRoot[1]);
  const at: Vec2 = [(s[0] + finRoot[0]) / 2, (s[1] + finRoot[1]) / 2];
  return compose(simAbout(s, at, finAng - wingAng, Math.sqrt(finLen / wingLen)), S0);
}

export interface PartRig {
  id: string;
  /** Swallow layer this part's A texture comes from, and the koi layer for B. */
  artA: "body" | "wing_left" | "wing_right" | "tail";
  artB: "body" | "dorsal" | "pectoral" | "tail";
  Q: Sim;
  /** Pose anchor (A space): travels straight while the part turns about it. */
  anchor: Vec2;
  mesh: Mesh;
  /** A texture coordinates (A space) per vertex. */
  texA: Vec2[];
}

function part(id: string, artA: PartRig["artA"], artB: PartRig["artB"], a: Vec2[], b: Vec2[], Q: Sim, anchor: Vec2,
  pins: Array<[Vec2, Vec2]>, spacing = 9): PartRig {
  const qa = a.map(p => apply(Q, p));
  const mesh = buildMesh(qa, b, { boundary: 120, spacing, pins: pins.map(([pa, pb]) => ({ a: apply(Q, pa), b: pb })) });
  const Qi = inverse(Q);
  return { id, artA, artB, Q, anchor, mesh, texA: mesh.rest.map(p => apply(Qi, p)) };
}

export const PARTS: Record<string, PartRig> = {
  // spread → spread: the right wing (up after the turn) folds back over the body into the dorsal fin.
  wing_right: part("wing_right", "wing_right", "dorsal", A.wing_right, B.dorsal, foldPose(SHOULDER_R, TIP_R, DORSAL_ROOT, DORSAL_TIP), SHOULDER_R,
    [[TIP_R, DORSAL_TIP], [SHOULDER_R, DORSAL_ROOT]], 8),
  // forked tail → forked tail: each streamer widens into one lobe of the caudal fin.
  streamer_right: part("streamer_right", "tail", "tail", A.streamer_right, B.lobe_up, S0, P_A, [[tipOf(A.streamer_right), LOBE_UP_TIP]], 6),
  streamer_left: part("streamer_left", "tail", "tail", A.streamer_left, B.lobe_lo, S0, P_A, [[tipOf(A.streamer_left), LOBE_LO_TIP]], 6),
  // core → core: the slim body fills out; beak → snout, rump → tail root.
  body: part("body", "body", "body", A.body, B.body, S0, P_A, [[BEAK, SNOUT], [RUMP, PEDUNCLE]], 10),
  // spread → spread: the left wing (down after the turn) folds back into the pectoral fin.
  wing_left: part("wing_left", "wing_left", "pectoral", A.wing_left, B.pectoral, foldPose(SHOULDER_L, TIP_L, PECT_ROOT, PECT_TIP), SHOULDER_L,
    [[TIP_L, PECT_TIP], [SHOULDER_L, PECT_ROOT]], 6),
};

/** The swallow's eye (A space) — where the koi's eye is born from. */
export const SWALLOW_EYE: Vec2 = [BEAK[0], BEAK[1] + 26];
export const LANDMARKS = { BEAK, RUMP, SNOUT, PEDUNCLE, DORSAL_ROOT, DORSAL_TIP, PECT_ROOT, PECT_TIP, LOBE_UP_TIP, LOBE_LO_TIP, NOTCH, ROOT };
