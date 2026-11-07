import type { Vec2 } from "./geom";
import { cellsFromRGBA, flightAt, hash01, matchCells, schedule, type Cell, type Flight, type Placement } from "./bitmap";
import { fracture } from "../effects/fracture";

/** A decoded image plus its pixels, ready for cell effects. */
export interface Art { img: CanvasImageSource; width: number; height: number; data: Uint8ClampedArray }

export async function loadArt(src: string): Promise<Art> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  return { img, width: c.width, height: c.height, data: g.getImageData(0, 0, c.width, c.height).data };
}

/** Composite art onto an opaque background: turns a cut-out into a "photo-like" rectangle. */
export function flatten(art: Art, background: string, crop?: [number, number, number, number]): Art {
  const [x, y, w, h] = crop ?? [0, 0, art.width, art.height];
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.fillStyle = background;
  g.fillRect(0, 0, w, h);
  g.drawImage(art.img, x, y, w, h, 0, 0, w, h);
  return { img: c, width: w, height: h, data: g.getImageData(0, 0, w, h).data };
}

/**
 * Restyle a cut-out into a shared flat palette (title-design silhouette): the subject becomes `ink`, its very light
 * details (eye whites, glints) become `light`, everything else `background`. Two pictures toned with the SAME palette
 * rhyme in colour by construction — the condition a match cut needs and differently coloured artwork lacks.
 */
export function tone(art: Art, palette: { background: string; ink: string; light?: string; lightAbove?: number }): Art {
  const hex = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const bg = hex(palette.background), ink = hex(palette.ink), lt = hex(palette.light ?? palette.ink), th = palette.lightAbove ?? 0.88;
  const c = document.createElement("canvas");
  c.width = art.width; c.height = art.height;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  const img = g.createImageData(art.width, art.height), d = art.data, o = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255, lum = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    const fg = lum > th && palette.light ? lt : ink;
    for (let k = 0; k < 3; k++) o[i + k] = Math.round(bg[k] + (fg[k] - bg[k]) * a);
    o[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return { img: c, width: art.width, height: art.height, data: img.data };
}

export function drawArt(ctx: CanvasRenderingContext2D, art: Art, p: Placement) {
  ctx.drawImage(art.img, p.at[0] - p.center[0] * p.scale, p.at[1] - p.center[1] * p.scale, art.width * p.scale, art.height * p.scale);
}

/** Subject bounding box in art pixels (alpha > 8). */
export function subjectBox(art: Art): [number, number, number, number] {
  let x0 = art.width, y0 = art.height, x1 = 0, y1 = 0;
  for (let y = 0; y < art.height; y += 2) for (let x = 0; x < art.width; x += 2) if (art.data[(y * art.width + x) * 4 + 3] > 8) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return [x0, y0, x1, y1];
}

/** Placement that centres the subject on `at` with the given subject height in design pixels. */
export function fitArt(art: Art, at: Vec2, height: number): Placement {
  const [x0, y0, x1, y1] = subjectBox(art);
  return { at, scale: height / Math.max(1, y1 - y0), center: [(x0 + x1) / 2, (y0 + y1) / 2] };
}

/**
 * Pixel-particle morph: A's cells fly to B's cells. Unreleased cells of A and landed cells of B
 * are drawn from the real images (clipped), so the start and end frames ARE the images.
 */
export class PixelMorph {
  readonly a: Cell[]; readonly b: Cell[]; readonly flights: Flight[];
  private releaseOf: Float64Array; private landOf: Float64Array;
  private sizeA: number; private sizeB: number;
  constructor(private artA: Art, private pa: Placement, private artB: Art, private pb: Placement,
    opts: { step?: number; origin?: Vec2; landOrigin?: Vec2; spread?: number; flight?: number; swirl?: number; lift?: number } = {}) {
    const stepA = Math.max(2, Math.round((opts.step ?? 5) / pa.scale)), stepB = Math.max(2, Math.round((opts.step ?? 5) / pb.scale));
    this.a = cellsFromRGBA(artA.data, artA.width, artA.height, stepA, pa);
    this.b = cellsFromRGBA(artB.data, artB.width, artB.height, stepB, pb);
    this.sizeA = stepA * pa.scale; this.sizeB = stepB * pb.scale;
    const origin = opts.origin ?? pa.at;
    this.flights = schedule(this.a, this.b, matchCells(this.a, this.b), origin, opts);
    this.releaseOf = new Float64Array(this.a.length).fill(Infinity);
    this.landOf = new Float64Array(this.b.length).fill(Infinity);
    for (const f of this.flights) { this.releaseOf[f.from] = Math.min(this.releaseOf[f.from], f.release); this.landOf[f.to] = Math.min(this.landOf[f.to], f.land); }
  }
  get first() { return Math.min(...this.releaseOf); }
  get last() { return Math.max(...this.flights.map(f => f.land)); }

  draw(ctx: CanvasRenderingContext2D, t: number, style: { glow?: number } = {}) {
    if (t <= this.first) { drawArt(ctx, this.artA, this.pa); return; }
    if (t >= this.last) { drawArt(ctx, this.artB, this.pb); return; }
    const clipCells = (cells: Cell[], keep: (i: number) => boolean, size: number) => {
      const path = new Path2D();
      cells.forEach((c, i) => { if (keep(i)) path.rect(c.x - size / 2 - 0.3, c.y - size / 2 - 0.3, size + 0.6, size + 0.6); });
      return path;
    };
    ctx.save(); ctx.clip(clipCells(this.a, i => this.releaseOf[i] > t, this.sizeA)); drawArt(ctx, this.artA, this.pa); ctx.restore();
    ctx.save(); ctx.clip(clipCells(this.b, j => this.landOf[j] <= t, this.sizeB)); drawArt(ctx, this.artB, this.pb); ctx.restore();
    const glow = style.glow ?? 0.35;
    for (const f of this.flights) {
      if (t <= f.release || t >= f.land) continue;
      const ca = this.a[f.from], cb = this.b[f.to], pos = flightAt(ca, cb, f, t);
      const k = pos.p, s = (this.sizeA + (this.sizeB - this.sizeA) * k) * (1 + glow * Math.sin(Math.PI * k));
      const r = ca.r + (cb.r - ca.r) * k, g = ca.g + (cb.g - ca.g) * k, b = ca.b + (cb.b - ca.b) * k;
      ctx.globalAlpha = ca.a + (cb.a - ca.a) * k;
      ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
      ctx.fillRect(pos.x - s / 2, pos.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }
}

interface Shard { poly: Vec2[]; c: Vec2; delay: number; spin: number; dir: Vec2 }

/**
 * Two-faced shatter: Voronoi shards over both images; each shard lifts away from the impact,
 * turns over (front face A, back face B) and settles back. Shards at rest are drawn as one
 * clipped image, so there are no seams before or after.
 */
export class ShatterMorph {
  private shards: Shard[];
  /** Unique shard edges, nearest end first, with their distances from the impact. */
  private edges: Array<{ a: Vec2; b: Vec2; da: number; db: number }> = [];
  private impact: Vec2;
  private layer: CanvasRenderingContext2D | null = null;
  constructor(private artA: Art, private pa: Placement, private artB: Art, private pb: Placement,
    opts: { count?: number; seed?: number; impact?: Vec2; spread?: number; region?: [number, number, number, number] } = {}) {
    const box = opts.region ?? (() => {
      const bb = (art: Art, p: Placement) => { const [x0, y0, x1, y1] = subjectBox(art); return [p.at[0] + (x0 - p.center[0]) * p.scale, p.at[1] + (y0 - p.center[1]) * p.scale, p.at[0] + (x1 - p.center[0]) * p.scale, p.at[1] + (y1 - p.center[1]) * p.scale]; };
      const A = bb(artA, pa), B = bb(artB, pb);
      return [Math.min(A[0], B[0]) - 6, Math.min(A[1], B[1]) - 6, Math.max(A[2], B[2]) + 6, Math.max(A[3], B[3]) + 6] as [number, number, number, number];
    })();
    const [x0, y0, x1, y1] = box;
    const outline: Vec2[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    const impact = opts.impact ?? [(x0 + x1) / 2, (y0 + y1) / 2];
    this.impact = impact;
    const far = Math.hypot(x1 - x0, y1 - y0) / 2;
    const cellsA = cellsFromRGBA(artA.data, artA.width, artA.height, Math.max(2, Math.round(6 / pa.scale)), pa, 0.3);
    const cellsB = cellsFromRGBA(artB.data, artB.width, artB.height, Math.max(2, Math.round(6 / pb.scale)), pb, 0.3);
    const inPoly = (poly: Vec2[], x: number, y: number) => { let r = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) r = !r; } return r; };
    this.shards = fracture(outline, opts.count ?? 80, opts.seed ?? 7).map((poly, k) => {
      const c = poly.reduce((s, p) => [s[0] + p[0] / poly.length, s[1] + p[1] / poly.length] as Vec2, [0, 0] as Vec2);
      const d = Math.hypot(c[0] - impact[0], c[1] - impact[1]);
      const len = d || 1;
      return { poly, c, delay: (opts.spread ?? 0.4) * (d / far) + 0.05 * hash01(k), spin: (hash01(k + 99) - 0.5) * 1.4, dir: [(c[0] - impact[0]) / len, (c[1] - impact[1]) / len] as Vec2 };
    }).filter(s => [...cellsA, ...cellsB].some(cell => inPoly(s.poly, cell.x, cell.y)));
    // Crack lines are the real fracture lines: shard edges, deduplicated, excluding the outer frame.
    const key = (p: Vec2) => Math.round(p[0] * 2) + "," + Math.round(p[1] * 2);
    const seen = new Set<string>();
    for (const s of this.shards) for (let i = 0; i < s.poly.length; i++) {
      const p = s.poly[i], q = s.poly[(i + 1) % s.poly.length];
      const onFrame = (v: Vec2) => Math.abs(v[0] - x0) < 1 || Math.abs(v[0] - x1) < 1 || Math.abs(v[1] - y0) < 1 || Math.abs(v[1] - y1) < 1;
      if (onFrame(p) && onFrame(q)) continue;
      const k = [key(p), key(q)].sort().join("|");
      if (seen.has(k)) continue;
      seen.add(k);
      const dp = Math.hypot(p[0] - impact[0], p[1] - impact[1]), dq = Math.hypot(q[0] - impact[0], q[1] - impact[1]);
      this.edges.push(dp <= dq ? { a: p, b: q, da: dp, db: dq } : { a: q, b: p, da: dq, db: dp });
    }
  }

  /**
   * Cracks before the break (progress 0..1): fracture lines run out from the impact along the real
   * shard edges, engraved (dark line + light lip) and masked by A's own alpha so they never cross
   * the background. They stay on every shard that is still at rest (shatter progress `t`), and
   * leave with each piece as it lifts — a moving piece's edges are real gaps by then.
   */
  drawCracks(ctx: CanvasRenderingContext2D, progress: number, t = 0) {
    if (progress <= 0) return;
    const reach = Math.max(...this.edges.map(e => e.db)) * Math.min(1, progress) * 1.02;
    if (!this.layer) this.layer = document.createElement("canvas").getContext("2d")!;
    const L = this.layer;
    if (L.canvas.width !== ctx.canvas.width || L.canvas.height !== ctx.canvas.height) { L.canvas.width = ctx.canvas.width; L.canvas.height = ctx.canvas.height; }
    L.setTransform(1, 0, 0, 1, 0, 0);
    L.clearRect(0, 0, L.canvas.width, L.canvas.height);
    L.setTransform(ctx.getTransform());
    L.lineCap = "round";
    L.lineJoin = "round";
    for (const [color, width, dx, dy] of [["rgba(255,255,255,0.45)", 1.1, 0.9, 0.9], ["rgba(20,8,8,0.78)", 1.3, 0, 0]] as const) {
      L.strokeStyle = color;
      L.lineWidth = width;
      L.beginPath();
      for (const e of this.edges) {
        if (e.da >= reach) continue;
        const f = e.db <= reach ? 1 : (reach - e.da) / Math.max(1e-6, e.db - e.da);
        L.moveTo(e.a[0] + dx, e.a[1] + dy);
        L.lineTo(e.a[0] + (e.b[0] - e.a[0]) * f + dx, e.a[1] + (e.b[1] - e.a[1]) * f + dy);
      }
      L.stroke();
    }
    // Keep the cracks only where A is opaque.
    L.globalCompositeOperation = "destination-in";
    drawArt(L, this.artA, this.pa);
    L.globalCompositeOperation = "source-over";
    const life = 1 - Math.max(...this.shards.map(s => s.delay));
    const atRest = new Path2D();
    let any = false;
    for (const s of this.shards) if ((t - s.delay) / life <= 0) { any = true; s.poly.forEach((p, i) => i ? atRest.lineTo(p[0], p[1]) : atRest.moveTo(p[0], p[1])); atRest.closePath(); }
    if (!any) return;
    ctx.save();
    ctx.clip(atRest);
    ctx.save();
    ctx.resetTransform();
    ctx.drawImage(L.canvas, 0, 0);
    ctx.restore();
    ctx.restore();
  }

  draw(ctx: CanvasRenderingContext2D, t: number) {
    const life = 1 - Math.max(...this.shards.map(s => s.delay));
    const local = (s: Shard) => Math.max(0, Math.min(1, (t - s.delay) / life));
    const rest = (keep: (p: number) => boolean) => {
      const path = new Path2D();
      for (const s of this.shards) if (keep(local(s))) { s.poly.forEach((p, i) => i ? path.lineTo(p[0], p[1]) : path.moveTo(p[0], p[1])); path.closePath(); }
      return path;
    };
    ctx.save(); ctx.clip(rest(p => p <= 0)); drawArt(ctx, this.artA, this.pa); ctx.restore();
    ctx.save(); ctx.clip(rest(p => p >= 1)); drawArt(ctx, this.artB, this.pb); ctx.restore();
    // Moving shards, farthest-lifted on top.
    const moving = this.shards.filter(s => { const p = local(s); return p > 0 && p < 1; }).sort((x, y) => Math.sin(Math.PI * local(x)) - Math.sin(Math.PI * local(y)));
    for (const s of moving) {
      const p = local(s), e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2, up = Math.sin(Math.PI * e);
      const flip = Math.cos(Math.PI * e), front = flip >= 0;
      ctx.save();
      ctx.translate(s.c[0] + s.dir[0] * 46 * up, s.c[1] + s.dir[1] * 46 * up - 34 * up);
      ctx.rotate(s.spin * up);
      ctx.scale(Math.max(0.02, Math.abs(flip)) * (1 + 0.14 * up), 1 + 0.14 * up);
      ctx.translate(-s.c[0], -s.c[1]);
      ctx.beginPath();
      s.poly.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]));
      ctx.closePath();
      ctx.clip();
      // Turning edge-on darkens the face a little, like a card catching less light. A filter (not a
      // fill) so transparent parts of a face stay invisible instead of showing a grey polygon.
      ctx.filter = `brightness(${(1 - 0.3 * (1 - Math.abs(flip))).toFixed(3)}) drop-shadow(0 ${(8 * up).toFixed(1)}px ${(6 * up).toFixed(1)}px rgba(0,0,0,0.22))`;
      drawArt(ctx, front ? this.artA : this.artB, front ? this.pa : this.pb);
      ctx.filter = "none";
      ctx.restore();
    }
  }
}

/**
 * Opaque images: tiles turn over in a wave from `origin` (front A, back B).
 *   mode "grid"   (default) — a wall of square-ish cards, each turning about its vertical axis
 *   mode "blinds" — full-width slats turning about their horizontal axis, like venetian blinds
 */
export function tileFlip(ctx: CanvasRenderingContext2D, a: Art, pa: Placement, b: Art, pb: Placement, rect: [number, number, number, number], t: number,
  opts: { cols?: number; rows?: number; origin?: Vec2; spread?: number; mode?: "grid" | "blinds" } = {}) {
  const blinds = opts.mode === "blinds";
  const [x0, y0, x1, y1] = rect, cols = blinds ? 1 : opts.cols ?? 14, rows = opts.rows ?? (blinds ? 12 : 8), spread = opts.spread ?? (blinds ? 0.45 : 0.55);
  // Grid: the wave runs diagonally from a corner and every tile gets its own timing jitter, so the
  // tiles of one column never turn together (that reads as vertical blinds). Blinds stay orderly.
  const w = (x1 - x0) / cols, h = (y1 - y0) / rows, origin = opts.origin ?? (blinds ? [(x0 + x1) / 2, y0] : [x0, y0]);
  const jitter = blinds ? 0 : 0.3;
  const far = Math.max(...[[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => Math.hypot(x - origin[0], y - origin[1])));
  const tiles: Array<{ cx: number; cy: number; p: number }> = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const cx = x0 + (i + 0.5) * w, cy = y0 + (j + 0.5) * h;
    const delay = spread * ((1 - jitter) * Math.hypot(cx - origin[0], cy - origin[1]) / far + jitter * hash01(i * 7919 + j * 104729 + 13));
    tiles.push({ cx, cy, p: Math.max(0, Math.min(1, (t - delay) / (1 - spread))) });
  }
  // Tiles at rest are drawn as one clipped image per face, so no hairline seams show between them.
  for (const [face, keep] of [[0, (p: number) => p <= 0], [1, (p: number) => p >= 1]] as const) {
    const path = new Path2D();
    let any = false;
    for (const tl of tiles) if (keep(tl.p)) { any = true; path.rect(tl.cx - w / 2, tl.cy - h / 2, w, h); }
    if (!any) continue;
    ctx.save(); ctx.clip(path);
    if (face === 0) drawArt(ctx, a, pa); else drawArt(ctx, b, pb);
    ctx.restore();
  }
  for (const { cx, cy, p } of tiles) {
    if (p <= 0 || p >= 1) continue;
    const e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2, flip = Math.cos(Math.PI * e), up = Math.sin(Math.PI * e);
    ctx.save();
    ctx.translate(cx, cy - (blinds ? 0 : 10 * up));
    if (blinds) ctx.scale(1, Math.max(0.02, Math.abs(flip)));
    else ctx.scale(Math.max(0.02, Math.abs(flip)) * (1 + 0.06 * up), 1 + 0.06 * up);
    ctx.translate(-cx, -cy);
    ctx.beginPath();
    ctx.rect(cx - w / 2 - 0.4, cy - h / 2 - 0.4, w + 0.8, h + 0.8);
    ctx.clip();
    ctx.filter = `brightness(${(1 - 0.3 * (1 - Math.abs(flip))).toFixed(3)})`;
    if (flip >= 0) drawArt(ctx, a, pa); else drawArt(ctx, b, pb);
    ctx.filter = "none";
    ctx.restore();
  }
}

/** Opaque images: B spreads over A like ink soaking into paper, from `origin`, with a ragged soft edge. */
export function inkReveal(ctx: CanvasRenderingContext2D, a: Art, pa: Placement, b: Art, pb: Placement, t: number, origin: Vec2, reach: number) {
  drawArt(ctx, a, pa);
  if (t <= 0) return;
  const R = reach * (t < 1 ? 1 - (1 - t) ** 2.2 : 1) * 1.08;
  // Feathered edge: a few nested ragged blobs at rising opacity.
  for (const [shrink, alpha] of [[0, 0.25], [0.035, 0.45], [0.07, 1]] as const) {
    const path = new Path2D();
    for (let k = 0; k <= 180; k++) {
      const ang = (k / 180) * Math.PI * 2;
      const rag = 1 + 0.07 * Math.sin(ang * 5 + 1.3) + 0.045 * Math.sin(ang * 13 + t * 3) + 0.03 * Math.sin(ang * 29);
      const r = Math.max(0, R * (rag - shrink));
      const x = origin[0] + Math.cos(ang) * r, y = origin[1] + Math.sin(ang) * r * 0.82;
      if (k) path.lineTo(x, y); else path.moveTo(x, y);
    }
    ctx.save();
    ctx.clip(path);
    ctx.globalAlpha = alpha;
    drawArt(ctx, b, pb);
    ctx.restore();
  }
}

/**
 * Draw a texture through a triangle mesh: every triangle maps its texture coordinates (design-space
 * points on the art as placed by `p`) to its current position with its own affine transform.
 * Destination triangles are grown by a fraction of a pixel so neighbours overlap and no seams show.
 */
export function drawMeshTexture(ctx: CanvasRenderingContext2D, art: Art, p: Placement, tex: readonly Vec2[], pos: readonly Vec2[], tris: ReadonlyArray<readonly [number, number, number]>, alpha = 1) {
  if (alpha <= 0) return;
  const toArt = (q: Vec2): Vec2 => [p.center[0] + (q[0] - p.at[0]) / p.scale, p.center[1] + (q[1] - p.at[1]) / p.scale];
  const uv = tex.map(toArt);
  ctx.save();
  ctx.globalAlpha = alpha;
  for (const [i, j, k] of tris) {
    const [s0, s1, s2] = [uv[i], uv[j], uv[k]], [d0, d1, d2] = [pos[i], pos[j], pos[k]];
    const sx1 = s1[0] - s0[0], sy1 = s1[1] - s0[1], sx2 = s2[0] - s0[0], sy2 = s2[1] - s0[1];
    const det = sx1 * sy2 - sx2 * sy1;
    if (Math.abs(det) < 1e-9) continue;
    const dx1 = d1[0] - d0[0], dy1 = d1[1] - d0[1], dx2 = d2[0] - d0[0], dy2 = d2[1] - d0[1];
    // Affine A with A·(s − s0) + d0, written as canvas transform(a, b, c, d, e, f).
    const a = (dx1 * sy2 - dx2 * sy1) / det, c = (dx2 * sx1 - dx1 * sx2) / det;
    const b = (dy1 * sy2 - dy2 * sy1) / det, d = (dy2 * sx1 - dy1 * sx2) / det;
    const e = d0[0] - a * s0[0] - c * s0[1], f = d0[1] - b * s0[0] - d * s0[1];
    const cx = (d0[0] + d1[0] + d2[0]) / 3, cy = (d0[1] + d1[1] + d2[1]) / 3;
    const grow = (q: Vec2): Vec2 => { const vx = q[0] - cx, vy = q[1] - cy, l = Math.hypot(vx, vy) || 1; return [q[0] + vx / l * 0.7, q[1] + vy / l * 0.7]; };
    const [g0, g1, g2] = [grow(d0), grow(d1), grow(d2)];
    ctx.save();
    ctx.beginPath(); ctx.moveTo(g0[0], g0[1]); ctx.lineTo(g1[0], g1[1]); ctx.lineTo(g2[0], g2[1]); ctx.closePath();
    ctx.clip();
    ctx.transform(a, b, c, d, e, f);
    const x0 = Math.max(0, Math.floor(Math.min(s0[0], s1[0], s2[0]) - 3)), y0 = Math.max(0, Math.floor(Math.min(s0[1], s1[1], s2[1]) - 3));
    const x1 = Math.min(art.width, Math.ceil(Math.max(s0[0], s1[0], s2[0]) + 3)), y1 = Math.min(art.height, Math.ceil(Math.max(s0[1], s1[1], s2[1]) + 3));
    if (x1 > x0 && y1 > y0) ctx.drawImage(art.img, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
    ctx.restore();
  }
  ctx.restore();
}
