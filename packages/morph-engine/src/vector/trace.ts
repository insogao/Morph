import type { Vec2 } from "./geom";

/**
 * Trace opaque regions of an RGBA image into closed outlines (marching squares on the alpha channel, then RDP).
 * Pure: works on raw pixel data, in the browser or in node. `keep` limits tracing to a region (a disc around a
 * rhyme, say): pixels outside it count as transparent, so the outline follows the region's edge where it cuts.
 */
export function traceAlpha(data: ArrayLike<number>, width: number, height: number, opts: {
  box?: [number, number, number, number]; keep?: (x: number, y: number) => boolean; step?: number; tolerance?: number; minArea?: number;
} = {}): Vec2[][] {
  const step = opts.step ?? 1, [bx0, by0, bx1, by1] = (opts.box ?? [0, 0, width, height]).map(Math.round);
  const W = Math.max(1, Math.floor((bx1 - bx0) / step)), H = Math.max(1, Math.floor((by1 - by0) / step));
  const a = new Float32Array((W + 2) * (H + 2));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0;
    for (let dy = 0; dy < step; dy++) for (let dx = 0; dx < step; dx++) {
      const px = bx0 + x * step + dx, py = by0 + y * step + dy;
      if (px < 0 || py < 0 || px >= width || py >= height || (opts.keep && !opts.keep(px, py))) continue;
      s += data[(py * width + px) * 4 + 3];
    }
    a[(y + 1) * (W + 2) + x + 1] = s / (step * step * 255);
  }
  const v = (x: number, y: number) => a[y * (W + 2) + x];
  const edge = (x0: number, y0: number, x1: number, y1: number): Vec2 => {
    const va = v(x0, y0), vb = v(x1, y1), t = Math.abs(vb - va) < 1e-9 ? 0.5 : (0.5 - va) / (vb - va);
    return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
  };
  const next = new Map<string, Vec2[]>();
  const key = (p: Vec2) => p[0].toFixed(4) + "," + p[1].toFixed(4);
  const seg = (p: Vec2, q: Vec2) => { const k = key(p); (next.get(k) ?? next.set(k, []).get(k)!).push(q); };
  for (let y = 0; y < H + 1; y++) for (let x = 0; x < W + 1; x++) {
    const c = (v(x, y) > 0.5 ? 8 : 0) | (v(x + 1, y) > 0.5 ? 4 : 0) | (v(x + 1, y + 1) > 0.5 ? 2 : 0) | (v(x, y + 1) > 0.5 ? 1 : 0);
    if (c === 0 || c === 15) continue;
    const T = () => edge(x, y, x + 1, y), R = () => edge(x + 1, y, x + 1, y + 1), B = () => edge(x, y + 1, x + 1, y + 1), L = () => edge(x, y, x, y + 1);
    const centre = (v(x, y) + v(x + 1, y) + v(x + 1, y + 1) + v(x, y + 1)) / 4 > 0.5;
    switch (c) {
      case 1: seg(L(), B()); break; case 2: seg(B(), R()); break; case 3: seg(L(), R()); break;
      case 4: seg(R(), T()); break; case 6: seg(B(), T()); break; case 7: seg(L(), T()); break;
      case 8: seg(T(), L()); break; case 9: seg(T(), B()); break; case 11: seg(T(), R()); break;
      case 12: seg(R(), L()); break; case 13: seg(R(), B()); break; case 14: seg(B(), L()); break;
      case 5: if (centre) { seg(L(), T()); seg(R(), B()); } else { seg(L(), B()); seg(R(), T()); } break;
      case 10: if (centre) { seg(B(), L()); seg(T(), R()); } else { seg(T(), L()); seg(B(), R()); } break;
    }
  }
  const loops: Vec2[][] = [];
  for (const [start, list] of next) {
    while (list.length) {
      const loop: Vec2[] = [start.split(",").map(Number) as unknown as Vec2];
      let p = list.pop()!;
      for (let guard = 0; guard < 1e6; guard++) {
        loop.push(p);
        if (key(p) === start) break;
        const outs = next.get(key(p));
        if (!outs?.length) break;
        p = outs.pop()!;
      }
      if (loop.length > 3) loops.push(loop.slice(0, -1));
    }
  }
  const area = (r: Vec2[]) => Math.abs(r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
  const tol = opts.tolerance ?? 0.6, minArea = opts.minArea ?? 4;
  return loops
    .map(l => simplifyLoop(l, tol / step).map(([x, y]) => [bx0 + (x - 1 + 0.5) * step, by0 + (y - 1 + 0.5) * step] as Vec2))
    .filter(r => r.length >= 3 && area(r) >= minArea);
}

/** Ramer–Douglas–Peucker on a closed loop. */
export function simplifyLoop(loop: readonly Vec2[], eps: number): Vec2[] {
  const rdp = (pts: readonly Vec2[]): Vec2[] => {
    if (pts.length < 3) return [...pts];
    const a = pts[0], b = pts[pts.length - 1], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    let worst = 0, at = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = Math.abs((pts[i][0] - a[0]) * dy - (pts[i][1] - a[1]) * dx) / len;
      if (d > worst) { worst = d; at = i; }
    }
    return worst > eps ? [...rdp(pts.slice(0, at + 1)).slice(0, -1), ...rdp(pts.slice(at))] : [a, b];
  };
  let far = 0;
  for (let i = 1; i < loop.length; i++) if (Math.hypot(loop[i][0] - loop[0][0], loop[i][1] - loop[0][1]) > Math.hypot(loop[far][0] - loop[0][0], loop[far][1] - loop[0][1])) far = i;
  return [...rdp(loop.slice(0, far + 1)).slice(0, -1), ...rdp([...loop.slice(far), loop[0]]).slice(0, -1)];
}
