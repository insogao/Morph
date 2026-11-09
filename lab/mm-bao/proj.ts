import type { Shape } from "../../packages/morph-engine/src/vector/shape";
import { lerp } from "./common";

/*
 * The 2.5D projector from MM78, generalised: a solid is a flat shape extruded along the third axis of a FRAME
 * (origin + three orthonormal axes), so a glyph can stand in any plane — the 口 of 入口 faces the first camera, the
 * 口 of 出口 faces a camera that has swung 90°. Walls are shaded by their world normal, back faces culled, the cap
 * that faces the camera drawn last. A far camera with a long lens is a flat 2D view: the same world serves the
 * side-scroller and the 3D shots, and a camera move between them is the reveal.
 */
export type V3 = [number, number, number];
export interface Cam3 { t: V3; yaw: number; pitch: number; dist: number; f: number }
export const FAR = 40000;

export function lerpCam(a: Cam3, b: Cam3, u: number): Cam3 {
  const ld = Math.exp(lerp(Math.log(a.dist), Math.log(b.dist), u)), lf = Math.exp(lerp(Math.log(a.f), Math.log(b.f), u));
  return { t: [lerp(a.t[0], b.t[0], u), lerp(a.t[1], b.t[1], u), lerp(a.t[2], b.t[2], u)], yaw: lerp(a.yaw, b.yaw, u), pitch: lerp(a.pitch, b.pitch, u), dist: ld, f: lf };
}
/** A flat (orthographic-looking) camera at zoom z, looking at (x, y) in the plane z = 0 from the front. */
export const flatFront = (x: number, y: number, z: number, planeZ = 0): Cam3 => ({ t: [x, y, planeZ], yaw: 0, pitch: 0, dist: FAR, f: FAR * z });
/** A flat camera looking at the plane x = planeX from +x: screen right = +z, down = +y. */
export const flatSide = (u: number, v: number, z: number, planeX: number): Cam3 => ({ t: [planeX, v, u], yaw: -Math.PI / 2, pitch: 0, dist: FAR, f: FAR * z });

export interface View { pos: V3; r: V3; d: V3; fw: V3; f: number }
export function view(c: Cam3): View {
  const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw), cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
  const fw: V3 = [sy * cp, sp, cy * cp], r: V3 = [cy, 0, -sy];
  const d: V3 = [fw[1] * r[2] - fw[2] * r[1], fw[2] * r[0] - fw[0] * r[2], fw[0] * r[1] - fw[1] * r[0]];
  return { pos: [c.t[0] - fw[0] * c.dist, c.t[1] - fw[1] * c.dist, c.t[2] - fw[2] * c.dist], r, d, fw, f: c.f };
}
export function project(v: View, x: number, y: number, z: number): [number, number, number] {
  const px = x - v.pos[0], py = y - v.pos[1], pz = z - v.pos[2];
  const cz = px * v.fw[0] + py * v.fw[1] + pz * v.fw[2];
  const k = v.f / Math.max(cz, 1);
  return [(px * v.r[0] + py * v.r[1] + pz * v.r[2]) * k, (px * v.d[0] + py * v.d[1] + pz * v.d[2]) * k, cz];
}

/** A plane: world = o + x·ex + y·ey + z·ez. */
export interface Frame { o: V3; ex: V3; ey: V3; ez: V3 }
export const FRONT: Frame = { o: [0, 0, 0], ex: [1, 0, 0], ey: [0, 1, 0], ez: [0, 0, 1] };
/** The plane x = planeX seen from +x: local x → world +z, local y → world y, extrusion toward the camera is −ez… */
export const sideFrame = (planeX: number): Frame => ({ o: [planeX, 0, 0], ex: [0, 0, 1], ey: [0, 1, 0], ez: [-1, 0, 0] });
export const toWorld = (f: Frame, x: number, y: number, z: number): V3 => [
  f.o[0] + f.ex[0] * x + f.ey[0] * y + f.ez[0] * z, f.o[1] + f.ex[1] * x + f.ey[1] * y + f.ez[1] * z, f.o[2] + f.ex[2] * x + f.ey[2] * y + f.ez[2] * z,
];
const projL = (v: View, f: Frame, x: number, y: number, z: number) => { const w = toWorld(f, x, y, z); return project(v, w[0], w[1], w[2]); };

type Ring = ReadonlyArray<readonly [number, number]>;
const signed = (r: Ring) => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return s; };
const oriented = new WeakMap<Shape, Ring[]>();
function ringsOf(s: Shape): Ring[] {
  let out = oriented.get(s);
  if (!out) {
    out = [];
    for (const p of s.pieces) {
      out.push(signed(p.outer) >= 0 ? p.outer : [...p.outer].reverse());
      for (const h of p.holes) out.push(signed(h) <= 0 ? h : [...h].reverse());
    }
    oriented.set(s, out);
  }
  return out;
}

export interface Solid {
  shape: Shape; z: number; depth: number; color: [number, number, number]; frame?: Frame; key?: number;
  /** cap colour (defaults to `color`) */ cap?: [number, number, number]; caps?: boolean; alpha?: number; /** 0 shaded … 1 flat */ flat?: number; /** draw the walls of holes (insides); colour */ inner?: [number, number, number] | false; /** fill the holes' far end (a dark way in) */ plug?: [number, number, number];
}
const rgb = (c: [number, number, number], k: number) => `rgb(${Math.round(Math.min(255, c[0] * k))},${Math.round(Math.min(255, c[1] * k))},${Math.round(Math.min(255, c[2] * k))})`;
export const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function solidDepth(v: View, s: Solid) {
  const p = s.shape.pieces[0].outer; let x = 0, y = 0;
  for (const q of p) { x += q[0]; y += q[1]; }
  return projL(v, s.frame ?? FRONT, x / p.length, y / p.length, s.z + s.depth / 2)[2];
}

export function drawSolids(ctx: CanvasRenderingContext2D, v: View, solids: Solid[], side = 0.72) {
  const order = solids.map(s => ({ s, d: s.key ?? solidDepth(v, s) })).sort((a, b) => b.d - a.d);
  for (const { s } of order) drawSolid(ctx, v, s, side);
}

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export function drawSolid(ctx: CanvasRenderingContext2D, v: View, s: Solid, side = 0.72) {
  const f = s.frame ?? FRONT, rings = ringsOf(s.shape), z0 = s.z, z1 = s.z + s.depth;
  if (s.alpha !== undefined) ctx.globalAlpha = s.alpha;
  if (s.plug) {
    const path = new Path2D();
    for (const r of rings) { if (signed(r) >= 0) continue; r.forEach(([x, y], i) => { const [px, py] = projL(v, f, x, y, z1); if (i) path.lineTo(px, py); else path.moveTo(px, py); }); path.closePath(); }
    ctx.fillStyle = rgb(s.plug, 1); ctx.fill(path);
  }
  if (s.depth > 0.5) {
    const walls: Array<{ c: [number, number, number]; d: number; pts: number[]; shade: number }> = [];
    for (const r of rings) {
      const isHole = signed(r) < 0;
      if (isHole && s.inner === false) continue;
      const wc = isHole && s.inner ? s.inner : s.color;
      const F = r.map(([x, y]) => projL(v, f, x, y, z0)), B = r.map(([x, y]) => projL(v, f, x, y, z1));
      for (let i = 0; i < r.length; i++) {
        const j = (i + 1) % r.length, dx = r[j][0] - r[i][0], dy = r[j][1] - r[i][1], l = Math.hypot(dx, dy);
        if (l < 1e-6) continue;
        const nx = dy / l, ny = -dx / l, mx = (r[i][0] + r[j][0]) / 2, my = (r[i][1] + r[j][1]) / 2;
        const n: V3 = [f.ex[0] * nx + f.ey[0] * ny, f.ex[1] * nx + f.ey[1] * ny, f.ex[2] * nx + f.ey[2] * ny];
        const m = toWorld(f, mx, my, (z0 + z1) / 2);
        if (dot(n, [v.pos[0] - m[0], v.pos[1] - m[1], v.pos[2] - m[2]]) <= 0) continue;
        // light from above and a little from +x/−z (world)
        const shade = lerp(side * (0.78 - 0.5 * n[1] + 0.08 * n[0] - 0.05 * n[2]), 1, s.flat ?? 0);
        walls.push({ c: wc, d: (F[i][2] + F[j][2] + B[i][2] + B[j][2]) / 4, pts: [F[i][0], F[i][1], F[j][0], F[j][1], B[j][0], B[j][1], B[i][0], B[i][1]], shade: Math.round(Math.min(1.2, shade) * 24) / 24 });
      }
    }
    walls.sort((a, b) => b.d - a.d);
    for (const w of walls) {
      const p = w.pts; ctx.fillStyle = rgb(w.c, w.shade);
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[2], p[3]); ctx.lineTo(p[4], p[5]); ctx.lineTo(p[6], p[7]); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 0.8; ctx.stroke();
    }
  }
  if (s.caps !== false) {
    // the cap that faces the camera: z0 (normal −ez) or z1 (normal +ez)
    const o0 = toWorld(f, 0, 0, z0), front = dot([-f.ez[0], -f.ez[1], -f.ez[2]], [v.pos[0] - o0[0], v.pos[1] - o0[1], v.pos[2] - o0[2]]) > 0;
    const zc = front || s.depth <= 0.5 ? z0 : z1;
    const path = new Path2D();
    for (const r of rings) { r.forEach(([x, y], i) => { const [px, py] = projL(v, f, x, y, zc); if (i) path.lineTo(px, py); else path.moveTo(px, py); }); path.closePath(); }
    ctx.fillStyle = rgb(s.cap ?? s.color, 1); ctx.fill(path, "evenodd");
  }
  if (s.alpha !== undefined) ctx.globalAlpha = 1;
}

/** Flat rings (local plane coordinates) drawn in a frame at local depth z. */
export function flatPath(v: View, f: Frame, rings: ReadonlyArray<ReadonlyArray<readonly [number, number]>>, z = 0) {
  const path = new Path2D();
  for (const r of rings) { r.forEach(([x, y], i) => { const [px, py] = projL(v, f, x, y, z); if (i) path.lineTo(px, py); else path.moveTo(px, py); }); path.closePath(); }
  return path;
}
export const projectLocal = projL;
