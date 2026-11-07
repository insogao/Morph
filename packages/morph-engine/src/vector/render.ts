import type { Ring, Vec2 } from "./geom";
import type { Frame, ShapeMorph } from "./morph";

export function framePath(frame: Frame): Path2D {
  const path = new Path2D();
  const ring = (r: Ring) => {
    if (r.length < 2) return;
    path.moveTo(r[0][0], r[0][1]);
    for (let i = 1; i < r.length; i++) path.lineTo(r[i][0], r[i][1]);
    path.closePath();
  };
  for (const piece of frame.pieces) { ring(piece.outer); piece.holes.forEach(ring); }
  return path;
}

export function fillFrame(ctx: CanvasRenderingContext2D, frame: Frame, fill: string) {
  ctx.fillStyle = fill;
  ctx.fill(framePath(frame), "nonzero");
}

export function strokeFrame(ctx: CanvasRenderingContext2D, frame: Frame, stroke: string, width = 1.5) {
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.lineJoin = "miter";
  ctx.miterLimit = 8;
  ctx.stroke(framePath(frame));
}

// ---- Colour in OKLab, so mid-morph colours stay vivid instead of going muddy. ----

const toLinear = (c: number) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const toGamma = (c: number) => c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;

function hexToLab(hex: string): [number, number, number] {
  const v = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map(i => toLinear(parseInt(v.slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

function labToHex([L, A, B]: [number, number, number]): string {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3, m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3, s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return "#" + rgb.map(c => Math.round(Math.max(0, Math.min(1, toGamma(Math.max(0, c)))) * 255).toString(16).padStart(2, "0")).join("");
}

/** Perceptual colour distance (OKLab ΔE, ~0 same … ~0.3 clearly different … 1 black ↔ white). */
export function colorDistance(a: string, b: string): number {
  const x = hexToLab(a), y = hexToLab(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

/**
 * Colour in-between. A straight line in OKLab between two far-apart hues (blue → terracotta) passes close to grey:
 * the "muddy middle" users notice. Interpolate in OKLCH instead — lightness and chroma on a line, hue along the
 * shorter arc — so the in-between keeps its colourfulness. Near-grey ends have no meaningful hue: use OKLab then.
 */
export function mixColor(a: string, b: string, t: number): string {
  const x = hexToLab(a), y = hexToLab(b), u = Math.max(0, Math.min(1, t));
  const cx = Math.hypot(x[1], x[2]), cy = Math.hypot(y[1], y[2]);
  if (Math.min(cx, cy) < 0.03) return labToHex([x[0] + (y[0] - x[0]) * u, x[1] + (y[1] - x[1]) * u, x[2] + (y[2] - x[2]) * u]);
  const hx = Math.atan2(x[2], x[1]);
  let dh = Math.atan2(y[2], y[1]) - hx;
  dh = Math.atan2(Math.sin(dh), Math.cos(dh));
  const L = x[0] + (y[0] - x[0]) * u, C = cx + (cy - cx) * u, h = hx + dh * u;
  return labToHex([L, C * Math.cos(h), C * Math.sin(h)]);
}

// ---- Debug view: the equivalent of a "preview & map" panel. ----

export interface DebugStyle { every?: number; outline?: string; links?: string; knot?: string; pin?: string }

/**
 * Draw both source and target outlines, the point links ("show point connections"),
 * corner knots and pins. Pass the morph and which matched ring to draw.
 */
export function drawMatch(ctx: CanvasRenderingContext2D, morph: ShapeMorph, style: DebugStyle = {}) {
  const every = style.every ?? 6;
  ctx.save();
  ctx.lineWidth = 1;
  for (const rings of morph.matches) for (const m of rings) {
    const poly = (pts: Vec2[]) => { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.stroke(); };
    ctx.strokeStyle = style.outline ?? "rgba(255,255,255,.55)";
    poly(m.a); poly(m.b);
    ctx.strokeStyle = style.links ?? "rgba(255,255,255,.16)";
    ctx.beginPath();
    for (let i = 0; i < m.a.length; i += every) { ctx.moveTo(m.a[i][0], m.a[i][1]); ctx.lineTo(m.b[i][0], m.b[i][1]); }
    ctx.stroke();
    m.knots.forEach((k, j) => {
      const i = m.knotIndex[j], pa = m.a[i], pb = m.b[i];
      ctx.strokeStyle = ctx.fillStyle = k.kind === "pin" ? (style.pin ?? "#ff4d8d") : (style.knot ?? "#ffb020");
      ctx.setLineDash(k.kind === "pin" ? [] : [4, 4]);
      ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke();
      ctx.setLineDash([]);
      for (const p of [pa, pb]) { ctx.beginPath(); ctx.arc(p[0], p[1], k.kind === "pin" ? 4 : 2.5, 0, Math.PI * 2); ctx.fill(); }
    });
  }
  ctx.restore();
}
