import { centroid, type Vec2 } from "./geom";
import { parsePath, shapeFromRings, type Shape } from "./shape";

/**
 * SVG documents → named parts. No DOM needed, so it runs in tests and tools too.
 *
 * A part is everything under the nearest element that has an `id` (the element itself or an
 * ancestor <g>). Artwork without ids becomes anonymous parts, one per element, and `inspect`
 * warns about it: semantic morphs need named parts.
 */

export interface SvgPart {
  id: string;
  shape: Shape;
  fill: string | null;
  stroke: string | null;
  /** Paint order of the part's first element. */
  z: number;
  /** ids of enclosing groups, outermost first. */
  groups: string[];
}

export interface SvgIssues {
  openPaths: string[];
  strokeOnly: string[];
  gradients: string[];
  texts: number;
  images: number;
  anonymous: number;
}

export interface SvgDoc {
  viewBox: [number, number, number, number];
  parts: SvgPart[];
  issues: SvgIssues;
}

type M = [number, number, number, number, number, number];
const I: M = [1, 0, 0, 1, 0, 0];
const mul = (a: M, b: M): M => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
];
const apply = (m: M, [x, y]: Vec2): Vec2 => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

export function parseTransform(text: string | undefined): M {
  let m: M = I;
  if (!text) return m;
  for (const [, name, args] of text.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)) {
    const v = (args.match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? []).map(Number);
    let t: M;
    switch (name) {
      case "matrix": t = [v[0], v[1], v[2], v[3], v[4], v[5]]; break;
      case "translate": t = [1, 0, 0, 1, v[0], v[1] ?? 0]; break;
      case "scale": t = [v[0], 0, 0, v[1] ?? v[0], 0, 0]; break;
      case "rotate": {
        const a = v[0] * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), cx = v[1] ?? 0, cy = v[2] ?? 0;
        t = mul(mul([1, 0, 0, 1, cx, cy], [c, s, -s, c, 0, 0]), [1, 0, 0, 1, -cx, -cy]);
        break;
      }
      case "skewX": t = [1, 0, Math.tan(v[0] * Math.PI / 180), 1, 0, 0]; break;
      default: t = [1, Math.tan(v[0] * Math.PI / 180), 0, 1, 0, 0];
    }
    m = mul(m, t);
  }
  return m;
}

function attrs(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [, k, , v1, v2] of text.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) out[k] = v1 ?? v2 ?? "";
  // Inline style wins over presentation attributes.
  for (const decl of (out.style ?? "").split(";")) {
    const [k, v] = decl.split(":").map(s => s?.trim());
    if (k && v) out[k] = v;
  }
  return out;
}

const n = (v: string | undefined, d = 0) => v === undefined || v === "" ? d : parseFloat(v);

/** Element geometry as path data, so everything goes through one parser. */
function geometry(tag: string, a: Record<string, string>): string | null {
  switch (tag) {
    case "path": return a.d ?? null;
    case "rect": {
      const x = n(a.x), y = n(a.y), w = n(a.width), h = n(a.height);
      let rx = n(a.rx, NaN), ry = n(a.ry, NaN);
      if (Number.isNaN(rx)) rx = Number.isNaN(ry) ? 0 : ry;
      if (Number.isNaN(ry)) ry = rx;
      rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
      if (!(w > 0 && h > 0)) return null;
      if (!rx || !ry) return `M${x},${y}H${x + w}V${y + h}H${x}Z`;
      return `M${x + rx},${y}H${x + w - rx}A${rx},${ry} 0 0 1 ${x + w},${y + ry}V${y + h - ry}A${rx},${ry} 0 0 1 ${x + w - rx},${y + h}` +
        `H${x + rx}A${rx},${ry} 0 0 1 ${x},${y + h - ry}V${y + ry}A${rx},${ry} 0 0 1 ${x + rx},${y}Z`;
    }
    case "circle": case "ellipse": {
      const cx = n(a.cx), cy = n(a.cy), rx = tag === "circle" ? n(a.r) : n(a.rx), ry = tag === "circle" ? n(a.r) : n(a.ry);
      if (!(rx > 0 && ry > 0)) return null;
      return `M${cx - rx},${cy}A${rx},${ry} 0 1 0 ${cx + rx},${cy}A${rx},${ry} 0 1 0 ${cx - rx},${cy}Z`;
    }
    case "polygon": case "polyline": {
      const v = (a.points ?? "").match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g)?.map(Number) ?? [];
      if (v.length < 6) return null;
      let d = "M" + v[0] + "," + v[1];
      for (let i = 2; i + 1 < v.length; i += 2) d += "L" + v[i] + "," + v[i + 1];
      return tag === "polygon" ? d + "Z" : d;
    }
    default: return null;
  }
}

const SKIP = new Set(["defs", "clipPath", "mask", "symbol", "pattern", "linearGradient", "radialGradient", "marker", "style", "title", "desc", "metadata"]);
const SHAPES = new Set(["path", "rect", "circle", "ellipse", "polygon", "polyline"]);

export function parseSvg(text: string): SvgDoc {
  const clean = text.replace(/<!--[\s\S]*?-->/g, "").replace(/<\?[\s\S]*?\?>/g, "").replace(/<!DOCTYPE[\s\S]*?>/gi, "");
  interface Frame { tag: string; m: M; fill: string | null; stroke: string | null; rule: string; ids: string[]; skip: boolean }
  const stack: Frame[] = [{ tag: "#root", m: I, fill: "#000000", stroke: null, rule: "nonzero", ids: [], skip: false }];
  let viewBox: [number, number, number, number] = [0, 0, 0, 0];
  const raw = new Map<string, { pieces: Shape["pieces"]; fill: string | null; stroke: string | null; z: number; groups: string[] }>();
  const issues: SvgIssues = { openPaths: [], strokeOnly: [], gradients: [], texts: 0, images: 0, anonymous: 0 };
  let z = 0, anon = 0;
  for (const [, close, tag, body, selfClose] of clean.matchAll(/<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g)) {
    if (close) { if (stack.length > 1 && stack[stack.length - 1].tag === tag) stack.pop(); continue; }
    const a = attrs(body), top = stack[stack.length - 1];
    if (tag === "svg" && stack.length === 1) {
      const vb = a.viewBox?.split(/[\s,]+/).map(Number);
      viewBox = vb?.length === 4 ? [vb[0], vb[1], vb[2], vb[3]] : [0, 0, n(a.width, 0), n(a.height, 0)];
    }
    const fill = a.fill !== undefined ? (a.fill === "none" ? null : a.fill) : top.fill;
    const stroke = a.stroke !== undefined ? (a.stroke === "none" ? null : a.stroke) : top.stroke;
    const frame: Frame = { tag, m: mul(top.m, parseTransform(a.transform)), fill, stroke, rule: a["fill-rule"] ?? top.rule, ids: a.id ? [...top.ids, a.id] : top.ids, skip: top.skip || SKIP.has(tag) };
    if (!frame.skip) {
      if (tag === "text") issues.texts++;
      if (tag === "image") issues.images++;
      const d = SHAPES.has(tag) ? geometry(tag, a) : null;
      if (d) {
        let id = frame.ids[frame.ids.length - 1];
        if (!id) { id = "anon-" + anon++; issues.anonymous++; }
        if ((fill ?? "").startsWith("url(")) issues.gradients.push(id);
        if (!fill && stroke) issues.strokeOnly.push(id);
        const open = tag === "polyline" || d.split(/(?=[Mm])/).some(chunk => chunk.trim() && !/[Zz]\s*$/.test(chunk.trim()));
        if (open) issues.openPaths.push(id);
        // Each element is its own shape: separate elements never cut holes in each other.
        const rule = (a["fill-rule"] ?? top.rule) === "evenodd" ? "evenodd" : "nonzero";
        const own = shapeFromRings(parsePath(d).map(r => r.map(p => apply(frame.m, p))), rule).pieces;
        const entry = raw.get(id);
        if (entry) entry.pieces.push(...own);
        else raw.set(id, { pieces: own, fill: fill && !fill.startsWith("url(") ? fill : null, stroke, z: z++, groups: frame.ids.slice(0, -1) });
      }
    }
    if (!selfClose && !SHAPES.has(tag)) stack.push(frame);
    else if (!selfClose && SHAPES.has(tag)) stack.push(frame); // e.g. <path ...></path>
  }
  const parts: SvgPart[] = [...raw.entries()].map(([id, r]) => ({ id, shape: { pieces: r.pieces }, fill: r.fill, stroke: r.stroke, z: r.z, groups: r.groups }))
    .filter(p => p.shape.pieces.length);
  issues.openPaths = [...new Set(issues.openPaths)];
  issues.strokeOnly = [...new Set(issues.strokeOnly)];
  issues.gradients = [...new Set(issues.gradients)];
  return { viewBox, parts: parts.sort((x, y) => x.z - y.z), issues };
}

/** Map a whole document into design space: centre its viewBox on `at`, scaled to `height`. */
export function placeSvg(doc: SvgDoc, at: Vec2, height: number): SvgDoc {
  const [x, y, w, h] = doc.viewBox;
  const k = height / (h || 1), cx = x + w / 2, cy = y + h / 2;
  const f = ([px, py]: Vec2): Vec2 => [at[0] + (px - cx) * k, at[1] + (py - cy) * k];
  return {
    ...doc,
    parts: doc.parts.map(p => ({ ...p, shape: { pieces: p.shape.pieces.map(q => ({ outer: q.outer.map(f), holes: q.holes.map(r => r.map(f)) })) } })),
  };
}

export const partCenter = (p: SvgPart): Vec2 => centroid(p.shape.pieces[0].outer);
