/**
 * 3D point-cloud morph core (pure, testable; no WebGL).
 *
 * A part's surface is sampled into points (area-weighted, seeded). Every mesh VERTEX carries a
 * time: a release time on A, a land time on B. A sampled point takes the barycentric blend of its
 * triangle's vertex times — exactly what the fragment shader interpolates — so a pixel of A's mesh
 * disappears precisely when its point leaves, and a pixel of B's mesh appears precisely when its
 * point lands. Local hand-off, no mesh/point cross-fade.
 */

export type V3 = [number, number, number];

export interface PartMesh {
  name: string;
  /** World-space positions (xyz…), triangle indices, base colour (linear 0..1). */
  positions: Float32Array;
  index: Uint32Array;
  color: V3;
}

export interface Sample { p: V3; time: number; color: V3 }

/** Seeded PRNG (mulberry32). */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Smooth 3D value noise, 0..1. */
export function noise3(x: number, y: number, z: number, size = 0.35, seed = 0): number {
  const gx = x / size, gy = y / size, gz = z / size, ix = Math.floor(gx), iy = Math.floor(gy), iz = Math.floor(gz);
  const fx = gx - ix, fy = gy - iy, fz = gz - iz, s = (t: number) => t * t * (3 - 2 * t);
  const h = (i: number, j: number, k: number) => {
    let n = (i * 73856093) ^ (j * 19349663) ^ (k * 83492791) ^ (seed * 2654435761);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const sx = s(fx), sy = s(fy), sz = s(fz);
  return lerp(
    lerp(lerp(h(ix, iy, iz), h(ix + 1, iy, iz), sx), lerp(h(ix, iy + 1, iz), h(ix + 1, iy + 1, iz), sx), sy),
    lerp(lerp(h(ix, iy, iz + 1), h(ix + 1, iy, iz + 1), sx), lerp(h(ix, iy + 1, iz + 1), h(ix + 1, iy + 1, iz + 1), sx), sy), sz);
}

/** Per-vertex times for a mesh from a field over positions. */
export function vertexTimes(mesh: PartMesh, field: (p: V3) => number): Float32Array {
  const n = mesh.positions.length / 3, out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = field([mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2]]);
  return out;
}

/** Area-weighted surface samples; each sample's time is the barycentric blend of its triangle's vertex times. */
export function sampleSurface(mesh: PartMesh, times: Float32Array, count: number, seed: number): Sample[] {
  const P = mesh.positions, I = mesh.index, tris = I.length / 3;
  const area = new Float64Array(tris);
  let total = 0;
  const v = (k: number): V3 => [P[k * 3], P[k * 3 + 1], P[k * 3 + 2]];
  for (let t = 0; t < tris; t++) {
    const a = v(I[t * 3]), b = v(I[t * 3 + 1]), c = v(I[t * 3 + 2]);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
    area[t] = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
    total += area[t];
  }
  const cdf = new Float64Array(tris);
  let acc = 0;
  for (let t = 0; t < tris; t++) { acc += area[t] / total; cdf[t] = acc; }
  const r = rng(seed), out: Sample[] = [];
  for (let k = 0; k < count; k++) {
    const x = r();
    let lo = 0, hi = tris - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] < x) lo = mid + 1; else hi = mid; }
    let u = r(), w = r();
    if (u + w > 1) { u = 1 - u; w = 1 - w; }
    const i0 = I[lo * 3], i1 = I[lo * 3 + 1], i2 = I[lo * 3 + 2], a = v(i0), b = v(i1), c = v(i2), s = 1 - u - w;
    out.push({ p: [a[0] * s + b[0] * u + c[0] * w, a[1] * s + b[1] * u + c[1] * w, a[2] * s + b[2] * u + c[2] * w], time: times[i0] * s + times[i1] * u + times[i2] * w, color: mesh.color });
  }
  return out;
}

export function meshArea(mesh: PartMesh): number {
  const P = mesh.positions, I = mesh.index;
  let s = 0;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], wx = P[c] - P[a], wy = P[c + 1] - P[a + 1], wz = P[c + 2] - P[a + 2];
    s += 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  }
  return s;
}

/** 3D Morton (Z-order) code of a point normalised to its pool's bounding box. */
function morton(x: number, y: number, z: number): number {
  const spread = (v: number) => { let n = Math.max(0, Math.min(1023, Math.round(v))); n = (n | (n << 16)) & 0x030000ff; n = (n | (n << 8)) & 0x0300f00f; n = (n | (n << 4)) & 0x030c30c3; n = (n | (n << 2)) & 0x09249249; return n; };
  return spread(x) | (spread(y) << 1) | (spread(z) << 2);
}

/** Pair two point pools so their layouts correspond (Morton order over each pool's own box). */
export function pairPools(a: readonly Sample[], b: readonly Sample[]): Array<[number, number]> {
  if (!a.length || !b.length) throw new Error("Both pools need points.");
  const order = (pts: readonly Sample[]) => {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const { p } of pts) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
    const n = (v: number, k: number) => (v - lo[k]) / Math.max(1e-9, hi[k] - lo[k]) * 1023;
    return pts.map((s, i) => ({ i, m: morton(n(s.p[0], 0), n(s.p[1], 1), n(s.p[2], 2)) })).sort((x, y) => x.m - y.m).map(x => x.i);
  };
  const oa = order(a), ob = order(b), n = Math.max(a.length, b.length);
  return Array.from({ length: n }, (_, k) => [oa[Math.floor(k * a.length / n)], ob[Math.floor(k * b.length / n)]]);
}
