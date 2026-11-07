import { centroid, clean, contains, dist, signedArea, type Ring, type Vec2 } from "./geom";

/**
 * A filled vector shape: separate pieces, each an outer contour with optional holes.
 * Outer contours have positive signed area, holes negative (screen coordinates, y down).
 */
export interface Piece { outer: Ring; holes: Ring[] }
export interface Shape { pieces: Piece[] }

const FLAT_STEP = 2.5;

function cubic(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, out: Vec2[]) {
  const chord = dist(p0, p1) + dist(p1, p2) + dist(p2, p3);
  const n = Math.max(2, Math.min(96, Math.ceil(chord / FLAT_STEP)));
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
}

function arc(p0: Vec2, rx: number, ry: number, phiDeg: number, large: boolean, sweep: boolean, p1: Vec2, out: Vec2[]) {
  if (rx === 0 || ry === 0) { out.push(p1); return; }
  const phi = phiDeg * Math.PI / 180, cp = Math.cos(phi), sp = Math.sin(phi);
  const dx = (p0[0] - p1[0]) / 2, dy = (p0[1] - p1[1]) / 2;
  const x1 = cp * dx + sp * dy, y1 = -sp * dx + cp * dy;
  rx = Math.abs(rx); ry = Math.abs(ry);
  const lambda = x1 * x1 / (rx * rx) + y1 * y1 / (ry * ry);
  if (lambda > 1) { rx *= Math.sqrt(lambda); ry *= Math.sqrt(lambda); }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / (rx * rx * y1 * y1 + ry * ry * x1 * x1)));
  const cx1 = k * rx * y1 / ry, cy1 = -k * ry * x1 / rx;
  const cx = cp * cx1 - sp * cy1 + (p0[0] + p1[0]) / 2, cy = sp * cx1 + cp * cy1 + (p0[1] + p1[1]) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t0 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(2, Math.min(128, Math.ceil(Math.abs(dt) * Math.max(rx, ry) / FLAT_STEP)));
  for (let i = 1; i <= n; i++) {
    const t = t0 + dt * i / n, x = rx * Math.cos(t), y = ry * Math.sin(t);
    out.push([cp * x - sp * y + cx, sp * x + cp * y + cy]);
  }
}

/** Parse SVG path data into flattened closed rings. Open subpaths are closed implicitly. */
export function parsePath(d: string): Ring[] {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
  const rings: Ring[] = [];
  let i = 0, cmd = "", cur: Vec2 = [0, 0], start: Vec2 = [0, 0], ring: Vec2[] = [];
  let lastCtrl: Vec2 | null = null, lastQuad: Vec2 | null = null;
  const num = () => {
    const v = Number(tokens[i++]);
    if (!Number.isFinite(v)) throw new Error("Malformed path data near token " + (i - 1) + ".");
    return v;
  };
  const flag = () => {
    // Arc flags may be written without separators ("a1 1 0 011 1"); split them off.
    const t = tokens[i];
    if (t === "0" || t === "1") { i++; return t === "1"; }
    if (t && /^[01]/.test(t)) { tokens[i] = t.slice(1); return t[0] === "1"; }
    throw new Error("Malformed arc flag.");
  };
  const flush = () => {
    const r = clean(ring);
    if (r.length >= 3) rings.push(r);
    ring = [];
  };
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    const at = (x: number, y: number): Vec2 => rel ? [cur[0] + x, cur[1] + y] : [x, y];
    switch (cmd.toUpperCase()) {
      case "M": {
        flush();
        cur = at(num(), num()); start = cur; ring = [cur];
        cmd = rel ? "l" : "L";
        lastCtrl = lastQuad = null;
        break;
      }
      case "L": cur = at(num(), num()); ring.push(cur); lastCtrl = lastQuad = null; break;
      case "H": cur = [rel ? cur[0] + num() : num(), cur[1]]; ring.push(cur); lastCtrl = lastQuad = null; break;
      case "V": cur = [cur[0], rel ? cur[1] + num() : num()]; ring.push(cur); lastCtrl = lastQuad = null; break;
      case "C": {
        const c1 = at(num(), num()), c2 = at(num(), num()), p = at(num(), num());
        cubic(cur, c1, c2, p, ring); cur = p; lastCtrl = c2; lastQuad = null; break;
      }
      case "S": {
        const c1: Vec2 = lastCtrl ? [2 * cur[0] - lastCtrl[0], 2 * cur[1] - lastCtrl[1]] : cur;
        const c2 = at(num(), num()), p = at(num(), num());
        cubic(cur, c1, c2, p, ring); cur = p; lastCtrl = c2; lastQuad = null; break;
      }
      case "Q": {
        const q = at(num(), num()), p = at(num(), num());
        cubic(cur, [cur[0] + 2 / 3 * (q[0] - cur[0]), cur[1] + 2 / 3 * (q[1] - cur[1])],
          [p[0] + 2 / 3 * (q[0] - p[0]), p[1] + 2 / 3 * (q[1] - p[1])], p, ring);
        cur = p; lastQuad = q; lastCtrl = null; break;
      }
      case "T": {
        const q: Vec2 = lastQuad ? [2 * cur[0] - lastQuad[0], 2 * cur[1] - lastQuad[1]] : cur;
        const p = at(num(), num());
        cubic(cur, [cur[0] + 2 / 3 * (q[0] - cur[0]), cur[1] + 2 / 3 * (q[1] - cur[1])],
          [p[0] + 2 / 3 * (q[0] - p[0]), p[1] + 2 / 3 * (q[1] - p[1])], p, ring);
        cur = p; lastQuad = q; lastCtrl = null; break;
      }
      case "A": {
        const rx = num(), ry = num(), phi = num(), large = flag(), sweep = flag(), p = at(num(), num());
        arc(cur, rx, ry, phi, large, sweep, p, ring); cur = p; lastCtrl = lastQuad = null; break;
      }
      case "Z": flush(); cur = start; ring = [cur]; lastCtrl = lastQuad = null; break;
      default: throw new Error("Unsupported path command " + cmd + ".");
    }
  }
  flush();
  return rings;
}

const orient = (ring: Ring, positive: boolean): Ring => (signedArea(ring) > 0) === positive ? ring : [...ring].reverse();

/** True when every sampled point of `inner` lies inside `outer` (overlap is not containment). */
function inside(inner: Ring, outer: Ring): boolean {
  const step = Math.max(1, Math.floor(inner.length / 24));
  for (let i = 0; i < inner.length; i += step) if (!contains(outer, inner[i])) return false;
  return true;
}

/**
 * Group rings into pieces. A ring nested inside another becomes a hole when the fill rule
 * says it is one: under "evenodd" by nesting depth; under "nonzero" (the SVG default) only
 * when it winds opposite to the ring that contains it. Overlapping rings stay separate pieces.
 */
export function shapeFromRings(rings: readonly Ring[], rule: "evenodd" | "nonzero" = "evenodd"): Shape {
  const sorted = [...rings].filter(r => r.length >= 3 && Math.abs(signedArea(r)) > 1e-6)
    .sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
  const hole: boolean[] = [], parent: number[] = [];
  sorted.forEach((ring, i) => {
    let p = -1;
    for (let j = i - 1; j >= 0; j--) if (inside(ring, sorted[j])) { p = j; break; }
    parent.push(p);
    if (p < 0) hole.push(false);
    else if (rule === "evenodd") hole.push(!hole[p]);
    else hole.push(!hole[p] && Math.sign(signedArea(ring)) !== Math.sign(signedArea(sorted[p])));
  });
  const pieces: Piece[] = [];
  const pieceOf = new Map<number, Piece>();
  sorted.forEach((ring, i) => {
    // A hole belongs to its container; a ring inside a hole (an island) is a new piece.
    if (!hole[i]) {
      const piece = { outer: orient(ring, true), holes: [] as Ring[] };
      pieces.push(piece);
      pieceOf.set(i, piece);
    } else {
      pieceOf.get(parent[i])!.holes.push(orient(ring, false));
    }
  });
  return { pieces };
}

export const fromPath = (d: string, rule: "evenodd" | "nonzero" = "evenodd"): Shape => shapeFromRings(parsePath(d), rule);
export const polygon = (points: readonly Vec2[]): Shape => shapeFromRings([clean([...points])]);
export const compound = (...shapes: Shape[]): Shape => ({ pieces: shapes.flatMap(s => s.pieces) });

export function circle(c: Vec2, r: number, n = 96): Ring {
  return Array.from({ length: n }, (_, i) => [c[0] + r * Math.cos(2 * Math.PI * i / n), c[1] + r * Math.sin(2 * Math.PI * i / n)] as Vec2);
}

export function star(c: Vec2, outer: number, inner: number, points: number, rotation = -Math.PI / 2): Ring {
  return Array.from({ length: points * 2 }, (_, i) => {
    const r = i % 2 ? inner : outer, a = rotation + Math.PI * i / points;
    return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)] as Vec2;
  });
}

export function mapShape(shape: Shape, f: (p: Vec2) => Vec2): Shape {
  const mapped = shape.pieces.map(({ outer, holes }) => ({ outer: outer.map(f), holes: holes.map(h => h.map(f)) }));
  // A mirroring map flips orientation; restore the outer/hole convention.
  return { pieces: mapped.map(({ outer, holes }) => ({ outer: orient(outer, true), holes: holes.map(h => orient(h, false)) })) };
}

/** Uniform scale and offset so the shape's bounding box is centred on `at` with the given height. */
export function fit(shape: Shape, at: Vec2, height: number): Shape {
  const all = shape.pieces.flatMap(p => [p.outer]);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const ring of all) for (const [x, y] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const k = height / (y1 - y0), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return mapShape(shape, ([x, y]) => [at[0] + (x - cx) * k, at[1] + (y - cy) * k]);
}

export const pieceCentroid = (piece: Piece) => centroid(piece.outer);
export const pieceArea = (piece: Piece) => signedArea(piece.outer) + piece.holes.reduce((s, h) => s + signedArea(h), 0);

/** SVG path data for one ring (used to feed baseline libraries such as flubber). */
export const ringPath = (ring: Ring) => "M" + ring.map(p => p[0].toFixed(2) + "," + p[1].toFixed(2)).join("L") + "Z";
