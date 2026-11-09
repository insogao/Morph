import type { Shape } from "../../packages/morph-engine/src/vector/shape";
import { lerp } from "./common";

/*
 * A tiny 2.5D renderer for flat art: shapes in the x–y plane (y down) extruded along z, seen by a real perspective
 * camera (orbit: target, yaw, pitch, distance, focal length). Side walls are shaded by their normal (tops light),
 * back-facing walls are culled, walls are depth-sorted within a solid and solids are sorted by distance. With the
 * camera far away and a long lens (dist = f), the view is a plain side-on 2D picture: the same world serves the flat
 * level and the 2.5D one, and a camera move between them is the reveal.
 */
export type V3 = [number, number, number];
export interface Cam3 { t: V3; yaw: number; pitch: number; dist: number; f: number }

export function lerpCam(a: Cam3, b: Cam3, u: number): Cam3 {
  // distance and lens in log space, so a long-lens flat view eases into a close perspective one
  const ld = Math.exp(lerp(Math.log(a.dist), Math.log(b.dist), u)), lf = Math.exp(lerp(Math.log(a.f), Math.log(b.f), u));
  return { t: [lerp(a.t[0], b.t[0], u), lerp(a.t[1], b.t[1], u), lerp(a.t[2], b.t[2], u)], yaw: lerp(a.yaw, b.yaw, u), pitch: lerp(a.pitch, b.pitch, u), dist: ld, f: lf };
}

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

type Ring = ReadonlyArray<readonly [number, number]>;
const signed = (r: Ring) => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return s; };
/** Rings of a shape oriented so that the wall normal is (dy, −dx): outers positive area, holes negative. */
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

export interface Solid { shape: Shape; z: number; depth: number; color: [number, number, number]; key?: number; colorAt?: (x: number) => [number, number, number] }
const rgb = (c: [number, number, number], k: number) => `rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})`;
export const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function solidDepth(v: View, s: Solid) {
  const p = s.shape.pieces[0].outer; let x = 0, y = 0;
  for (const q of p) { x += q[0]; y += q[1]; }
  return project(v, x / p.length, y / p.length, s.z + s.depth / 2)[2];
}

/** Draw solids (far first). `side` scales the wall colour (walls darker than the face). */
export function drawSolids(ctx: CanvasRenderingContext2D, v: View, solids: Solid[], side = 0.62) {
  const order = solids.map(s => ({ s, d: s.key ?? solidDepth(v, s) })).sort((a, b) => b.d - a.d);
  for (const { s } of order) drawSolid(ctx, v, s, side);
}

export function drawSolid(ctx: CanvasRenderingContext2D, v: View, s: Solid, side = 0.62) {
  const rings = ringsOf(s.shape), z0 = s.z, z1 = s.z + s.depth;
  if (s.depth > 0.5) {
    const walls: Array<{ x: number; d: number; pts: number[]; shade: number }> = [];
    for (const r of rings) {
      const F = r.map(([x, y]) => project(v, x, y, z0)), B = r.map(([x, y]) => project(v, x, y, z1));
      for (let i = 0; i < r.length; i++) {
        const j = (i + 1) % r.length, dx = r[j][0] - r[i][0], dy = r[j][1] - r[i][1], l = Math.hypot(dx, dy);
        if (l < 1e-6) continue;
        const nx = dy / l, ny = -dx / l, mx = (r[i][0] + r[j][0]) / 2, my = (r[i][1] + r[j][1]) / 2;
        // facing the camera?
        if (nx * (v.pos[0] - mx) + ny * (v.pos[1] - my) <= 0) continue;
        const shade = side * (0.78 - 0.5 * ny + 0.08 * nx);
        walls.push({ x: mx, d: (F[i][2] + F[j][2] + B[i][2] + B[j][2]) / 4, pts: [F[i][0], F[i][1], F[j][0], F[j][1], B[j][0], B[j][1], B[i][0], B[i][1]], shade: Math.round(Math.min(1, shade) * 24) / 24 });
      }
    }
    walls.sort((a, b) => b.d - a.d);
    for (const w of walls) {
      const p = w.pts; ctx.fillStyle = rgb(s.colorAt ? s.colorAt(w.x) : s.color, w.shade);
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[2], p[3]); ctx.lineTo(p[4], p[5]); ctx.lineTo(p[6], p[7]); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 0.8; ctx.stroke();      // close hairline seams between walls
    }
  }
  const path = new Path2D();
  for (const r of rings) { r.forEach(([x, y], i) => { const [px, py] = project(v, x, y, z0); if (i) path.lineTo(px, py); else path.moveTo(px, py); }); path.closePath(); }
  ctx.fillStyle = rgb(s.color, 1); ctx.fill(path, "evenodd");
}
