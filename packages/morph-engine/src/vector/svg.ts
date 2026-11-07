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
  /** Elements under a clip-path or mask (clipping is NOT applied: content outside the clip will show). */
  clipped: string[];
  /** Elements with opacity below 1 (morphed as opaque). */
  translucent: string[];
  /** Colours that could not be understood (the part falls back to black). */
  badColors: string[];
  /** <use> references that point nowhere. */
  brokenUses: string[];
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

function attrs(text: string, inline = true): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [, k, , v1, v2] of text.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) out[k] = v1 ?? v2 ?? "";
  if (!inline) return out;
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

const NAMED: Record<string, string> = {
  black: "#000000", white: "#ffffff", red: "#ff0000", green: "#008000", blue: "#0000ff", yellow: "#ffff00", orange: "#ffa500",
  purple: "#800080", pink: "#ffc0cb", brown: "#a52a2a", gray: "#808080", grey: "#808080", silver: "#c0c0c0", gold: "#ffd700",
  navy: "#000080", teal: "#008080", olive: "#808000", maroon: "#800000", lime: "#00ff00", aqua: "#00ffff", cyan: "#00ffff",
  magenta: "#ff00ff", fuchsia: "#ff00ff", crimson: "#dc143c", coral: "#ff7f50", salmon: "#fa8072", tomato: "#ff6347",
  orchid: "#da70d6", violet: "#ee82ee", indigo: "#4b0082", khaki: "#f0e68c", beige: "#f5f5dc", ivory: "#fffff0", tan: "#d2b48c",
  chocolate: "#d2691e", sienna: "#a0522d", peru: "#cd853f", wheat: "#f5deb3", skyblue: "#87ceeb", steelblue: "#4682b4",
  royalblue: "#4169e1", forestgreen: "#228b22", seagreen: "#2e8b57", darkgreen: "#006400", darkred: "#8b0000", darkblue: "#00008b",
  lightgray: "#d3d3d3", lightgrey: "#d3d3d3", darkgray: "#a9a9a9", darkgrey: "#a9a9a9", turquoise: "#40e0d0", plum: "#dda0dd",
  lavender: "#e6e6fa", mintcream: "#f5fffa", firebrick: "#b22222", goldenrod: "#daa520", hotpink: "#ff69b4", deeppink: "#ff1493",
};

/** Any CSS colour the importer understands → "#rrggbb"; null for none/transparent; undefined if unknown. */
export function normalizeColor(v: string, current = "#000000"): string | null | undefined {
  const c = v.trim().toLowerCase();
  if (c === "none" || c === "transparent") return null;
  if (c === "currentcolor") return normalizeColor(current) ?? "#000000";
  if (c.startsWith("url(")) return v.trim();
  if (NAMED[c]) return NAMED[c];
  let m = c.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    const h = m[1];
    if (h.length === 3 || h.length === 4) return "#" + h.slice(0, 3).split("").map(x => x + x).join("");
    if (h.length === 6 || h.length === 8) return "#" + h.slice(0, 6);
    return undefined;
  }
  m = c.match(/^rgba?\(([^)]*)\)$/);
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean).slice(0, 3).map(x => x.endsWith("%") ? parseFloat(x) * 2.55 : parseFloat(x));
    if (parts.length === 3 && parts.every(Number.isFinite)) return "#" + parts.map(x => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("");
  }
  m = c.match(/^hsla?\(([^)]*)\)$/);
  if (m) {
    const [h, sat, l] = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
    if ([h, sat, l].every(Number.isFinite)) {
      const S = sat / 100, L = l / 100, k = (n: number) => (n + h / 30) % 12, a = S * Math.min(L, 1 - L);
      const f = (n: number) => L - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
      return "#" + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, "0")).join("");
    }
  }
  return undefined;
}

/** Simple stylesheet rules from <style> blocks: .class, #id and tag selectors (what design tools export). */
function styleRules(text: string): Array<{ sel: string; decls: Record<string, string> }> {
  const rules: Array<{ sel: string; decls: Record<string, string> }> = [];
  for (const [, body] of text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    const css = body.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const [, sels, block] of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const decls: Record<string, string> = {};
      for (const d of block.split(";")) { const i = d.indexOf(":"); if (i > 0) decls[d.slice(0, i).trim()] = d.slice(i + 1).trim(); }
      for (const sel of sels.split(",").map(x => x.trim()).filter(Boolean)) rules.push({ sel, decls });
    }
  }
  return rules;
}

/** Expand <use href="#id"> into a <g> with the referenced element inline (nested uses up to 4 deep). */
function expandUses(text: string, broken: string[]): string {
  const find = (id: string): string | null => {
    const open = new RegExp("<([a-zA-Z][\\w:-]*)\\b[^>]*\\bid\\s*=\\s*[\"']" + id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\"'][^>]*?(/?)>");
    const m = open.exec(text);
    if (!m) return null;
    if (m[2] === "/") return m[0];
    const tag = m[1], re = new RegExp("<(/?)" + tag + "\\b[^>]*?(/?)>", "g");
    re.lastIndex = m.index + m[0].length;
    let depth = 1, k: RegExpExecArray | null;
    while ((k = re.exec(text))) { if (k[2] === "/") continue; depth += k[1] ? -1 : 1; if (!depth) return text.slice(m.index, k.index + k[0].length); }
    return null;
  };
  let out = text;
  for (let pass = 0; pass < 4 && /<use\b/.test(out); pass++) {
    let count = 0;
    out = out.replace(/<use\b([^>]*?)\/?>(?:\s*<\/use>)?/g, (_, body: string) => {
      const a = attrs(body), ref = (a.href ?? a["xlink:href"] ?? "").replace(/^#/, "");
      const target = ref ? find(ref) : null;
      if (!target) { broken.push(ref || "(empty)"); return ""; }
      const x = n(a.x), y = n(a.y), t = (a.transform ?? "") + (x || y ? ` translate(${x},${y})` : "");
      const keep = Object.entries(a).filter(([k]) => !["href", "xlink:href", "x", "y", "width", "height", "transform"].includes(k)).map(([k, v]) => `${k}="${v}"`).join(" ");
      // The copy keeps its own geometry but not its id (ids must stay unique); the <use>'s id (if any) names it.
      const inner = target.replace(/\bid\s*=\s*["'][^"']*["']/, `data-from="${ref}"`).replace(/^<symbol\b/, "<g").replace(/<\/symbol>$/, "</g>");
      count++;
      return `<g ${keep} transform="${t.trim()}">${inner}</g>`;
    });
    if (!count) break;
  }
  return out;
}

export function parseSvg(text: string): SvgDoc {
  const brokenUses: string[] = [];
  const stripped = text.replace(/<!--[\s\S]*?-->/g, "").replace(/<\?[\s\S]*?\?>/g, "").replace(/<!DOCTYPE[\s\S]*?>/gi, "");
  const rules = styleRules(stripped);
  const clean = expandUses(stripped.replace(/<style[^>]*>[\s\S]*?<\/style>/g, ""), brokenUses);
  interface Frame { tag: string; m: M; fill: string | null; stroke: string | null; rule: string; ids: string[]; skip: boolean; color: string; clip: boolean; alpha: number }
  const stack: Frame[] = [{ tag: "#root", m: I, fill: "#000000", stroke: null, rule: "nonzero", ids: [], skip: false, color: "#000000", clip: false, alpha: 1 }];
  let viewBox: [number, number, number, number] = [0, 0, 0, 0];
  const raw = new Map<string, { pieces: Shape["pieces"]; fill: string | null; stroke: string | null; z: number; groups: string[] }>();
  const issues: SvgIssues = { openPaths: [], strokeOnly: [], gradients: [], texts: 0, images: 0, anonymous: 0, clipped: [], translucent: [], badColors: [], brokenUses };
  // CSS cascade, simplified: presentation attributes < stylesheet rules (tag < .class < #id) < inline style.
  const cascade = (tag: string, body: string): Record<string, string> => {
    const own = attrs(body, false), out: Record<string, string> = { ...own };
    const classes = (own.class ?? "").split(/\s+/).filter(Boolean);
    const rank = (sel: string) => sel.startsWith("#") ? (sel.slice(1) === own.id ? 3 : 0) : sel.startsWith(".") ? (sel.slice(1).split(".").every(c => classes.includes(c)) ? 2 : 0) : sel === tag ? 1 : 0;
    for (const r of rules.map(r => ({ ...r, k: rank(r.sel) })).filter(r => r.k).sort((x, y) => x.k - y.k)) Object.assign(out, r.decls);
    for (const decl of (own.style ?? "").split(";")) { const i = decl.indexOf(":"); if (i > 0) out[decl.slice(0, i).trim()] = decl.slice(i + 1).trim(); }
    return out;
  };
  const paint = (v: string | undefined, inherited: string | null, current: string, who: string): string | null => {
    if (v === undefined || v === "inherit") return inherited;
    const c = normalizeColor(v, current);
    if (c === undefined) { issues.badColors.push(who + ": " + v); return "#000000"; }
    return c;
  };
  let z = 0, anon = 0;
  for (const [, close, tag, body, selfClose] of clean.matchAll(/<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g)) {
    if (close) { if (stack.length > 1 && stack[stack.length - 1].tag === tag) stack.pop(); continue; }
    const a = cascade(tag, body), top = stack[stack.length - 1];
    if (tag === "svg" && stack.length === 1) {
      const vb = a.viewBox?.split(/[\s,]+/).map(Number);
      viewBox = vb?.length === 4 ? [vb[0], vb[1], vb[2], vb[3]] : [0, 0, n(a.width, 0), n(a.height, 0)];
    }
    const who = a.id ?? top.ids[top.ids.length - 1] ?? tag;
    const color = a.color !== undefined ? (normalizeColor(a.color, top.color) ?? top.color) : top.color;
    const fill = paint(a.fill, top.fill, color, who);
    const stroke = paint(a.stroke, top.stroke, color, who);
    const hidden = a.display === "none" || a.visibility === "hidden" || a.visibility === "collapse";
    const alpha = top.alpha * (a.opacity !== undefined ? n(a.opacity, 1) : 1) * (a["fill-opacity"] !== undefined ? n(a["fill-opacity"], 1) : 1);
    const frame: Frame = { tag, m: mul(top.m, parseTransform(a.transform)), fill, stroke, rule: a["fill-rule"] ?? top.rule, ids: a.id ? [...top.ids, a.id] : top.ids,
      skip: top.skip || SKIP.has(tag) || hidden, color, clip: top.clip || a["clip-path"] !== undefined || a.mask !== undefined, alpha };
    if (!frame.skip) {
      if (tag === "text") issues.texts++;
      if (tag === "image") issues.images++;
      const d = SHAPES.has(tag) ? geometry(tag, a) : null;
      if (d) {
        let id = frame.ids[frame.ids.length - 1];
        if (!id) { id = "anon-" + anon++; issues.anonymous++; }
        if ((fill ?? "").startsWith("url(")) issues.gradients.push(id);
        if (frame.clip) issues.clipped.push(id);
        if (frame.alpha < 0.999) issues.translucent.push(id);
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
  issues.clipped = [...new Set(issues.clipped)];
  issues.translucent = [...new Set(issues.translucent)];
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
