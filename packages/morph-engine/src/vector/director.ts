import type { MorphScene } from "../core/scene";
import { rotate, type Vec2 } from "./geom";
import type { Frame } from "./morph";
import { fillFrame } from "./render";
import { createSdfRenderer, type Prim, type SdfRenderer } from "../renderers/sdf-gl";
import { frameDecals, framePrims } from "./sdf-bridge";
import { contains, signedArea } from "./geom";
import { channel, remapParts, type Mapping } from "./remap";
import { parseSvg, placeSvg, type SvgDoc } from "./svg";
import { poseOf } from "./remap";

/**
 * Generic part-remap player. A morph between two part drawings is DATA, not code:
 *
 *   two SVGs (same canvas, semantic part ids) + one morph.json:
 *     mappings   every part's fate (see remap.ts)
 *     cause      what visibly starts the change, before it (sway, wind, pulse, shake)
 *     payoff     what only the target can do, after it (flap, hinge, wiggle, spin, bob, lift, pulse)
 *
 * An AI writes morph.json; `remapScene` turns it into a player scene. Coordinates in
 * motions (pivots, points) are in the SVG's own coordinates, or a part id (its centre),
 * or a part id with an anchor: "stem@bottom", "body@top", "wing_ul@left".
 */

export type Ref = Vec2 | string;

export type Cause =
  | { type: "sway"; pivot: Ref; amount?: number }          // radians, one sway out and back
  | { type: "wind"; direction?: "left" | "right"; streaks?: number }
  | { type: "pulse"; parts?: string[]; amount?: number }   // breathe in place
  | { type: "shake"; amount?: number };                    // px, nervous tremble that builds

export type Payoff =
  | { type: "flap"; parts: string[]; axis: Ref; amount?: number; rate?: number; lag?: string[] }   // fold toward a vertical axis (top view)
  | { type: "hinge"; parts: string[]; pivot: Ref; amount?: number; rate?: number; phase?: number } // rotate about a joint (side view)
  | { type: "wiggle"; parts: string[]; pivot: Ref; amount?: number; rate?: number; phase?: number }
  | { type: "spin"; parts: string[]; pivot: Ref; turns?: number }
  | { type: "bob"; amount?: number; rate?: number }
  | { type: "lift"; to: Vec2 }                                                                      // design-px offset at the end
  | { type: "pulse"; parts?: string[]; amount?: number; rate?: number };

export interface MorphSpec {
  id: string;
  title: string;
  /** Where both drawings go in the 1280 × 720 design space, and how tall. */
  place?: { at?: Vec2; height?: number };
  timing?: { cause?: number; morph?: number; payoff?: number };
  mappings: Mapping[];
  cause?: Cause[];
  payoff?: Payoff[];
  look?: { background?: string; ink?: string; accent?: string; ground?: boolean; legend?: boolean; label?: string };
  /**
   * Render through the SDF part field instead of flat fills (vector geometry, SDF material).
   * Each value is [before, mid-morph, after]: e.g. wobble [0, 6, 1] goes liquid in the middle.
   */
  render?: {
    track: "flat" | "sdf";
    /**
     * "flat" (default): 2D goo — solid colours with smooth liquid silhouettes, matching flat artwork.
     * "glossy": bevelled, lit, translucent 3D material.
     */
    style?: "flat" | "glossy";
    thickness?: Triple; gloss?: Triple; wobble?: Triple; blend?: Triple; sss?: Triple; mottle?: Triple;
    shadow?: number;
    /**
     * Groups of part ids (source or target) that may fuse with liquid bridges. Each group renders
     * as one SDF layer; parts outside a group never bridge to it. The sources of a merge always
     * share a group (they converge); split clones never do (they are pulling apart).
     */
    fuse?: string[][];
  };
}

type Triple = [number, number, number];


export function remapScene(spec: MorphSpec, sourceSvg: string, targetSvg: string): MorphScene {
  const at = spec.place?.at ?? [640, 360], height = spec.place?.height ?? 540;
  const rawA = parseSvg(sourceSvg), rawB = parseSvg(targetSvg);
  const a = placeSvg(rawA, at, height), b = placeSvg(rawB, at, height);
  const vb = rawA.viewBox;
  const toDesign = ([x, y]: Vec2): Vec2 => [at[0] + (x - (vb[0] + vb[2] / 2)) * height / (vb[3] || 1), at[1] + (y - (vb[1] + vb[3] / 2)) * height / (vb[3] || 1)];
  const resolve = (ref: Ref, doc: SvgDoc): Vec2 => {
    if (typeof ref !== "string") return toDesign(ref);
    const [id, anchor] = ref.split("@");
    const part = doc.parts.find(p => p.id === id) ?? a.parts.find(p => p.id === id) ?? b.parts.find(p => p.id === id);
    if (!part) throw new Error(spec.id + ": no part '" + id + "' for a motion reference.");
    if (!anchor) return poseOf(part.shape).c;
    const pts = part.shape.pieces.flatMap(p => p.outer);
    const pick = { top: (p: Vec2) => p[1], bottom: (p: Vec2) => -p[1], left: (p: Vec2) => p[0], right: (p: Vec2) => -p[0] }[anchor as "top"];
    if (!pick) throw new Error(spec.id + ": unknown anchor '" + anchor + "' (top, bottom, left, right).");
    return pts.reduce((best, p) => pick(p) < pick(best) ? p : best);
  };
  // Mapping references (bornFrom / vanishTo) may also be SVG coordinates or anchors.
  const mappings: Mapping[] = spec.mappings.map(m => ({
    ...m,
    bornFrom: m.bornFrom === undefined ? undefined : typeof m.bornFrom === "string" && !m.bornFrom.includes("@") ? m.bornFrom : resolve(m.bornFrom as Ref, a),
    vanishTo: m.vanishTo === undefined ? undefined : typeof m.vanishTo === "string" && !m.vanishTo.includes("@") ? m.vanishTo : resolve(m.vanishTo as Ref, b),
  }));
  const plan = remapParts(a, b, mappings);

  const T = { cause: spec.timing?.cause ?? 1.0, morph: spec.timing?.morph ?? 4.0, payoff: spec.timing?.payoff ?? 2.6 };
  const M0 = T.cause, M1 = T.cause + T.morph, END = M1 + T.payoff;
  const look = { background: "#f3ede2", ink: "#23232b", accent: "#ff6b4a", ground: false, legend: true, ...spec.look };
  const map = (frame: Frame, f: (p: Vec2) => Vec2): Frame => ({ pieces: frame.pieces.map(p => ({ outer: p.outer.map(f), holes: p.holes.map(h => h.map(f)) })) });
  const causes = spec.cause ?? [], payoffs = spec.payoff ?? [];
  const pre = causes.map(c => c.type === "sway" ? { ...c, at: resolve(c.pivot, a) } : c);
  const post = payoffs.map(p => "pivot" in p ? { ...p, at: resolve(p.pivot, b) } : "axis" in p ? { ...p, at: resolve(p.axis, b) } : p);
  const baseId = (id: string) => id.split("<")[0];
  const inList = (list: string[] | undefined, id: string) => !list || list.includes(baseId(id));

  function before(id: string, frame: Frame, time: number): Frame {
    if (time >= M0) return frame;
    let out = frame;
    const u = time / M0;
    for (const c of pre) {
      if (c.type === "sway") {
        const angle = (c.amount ?? 0.075) * Math.sin(Math.PI * u) * Math.sin(2 * Math.PI * u + 0.4);
        out = map(out, p => rotate(p, angle, (c as { at: Vec2 }).at));
      } else if (c.type === "pulse" && inList(c.parts, id)) {
        const k = 1 + (c.amount ?? 0.05) * Math.sin(Math.PI * u) * Math.sin(3 * Math.PI * u);
        const centre = poseOf(frame).c;
        out = map(out, ([x, y]) => [centre[0] + (x - centre[0]) * k, centre[1] + (y - centre[1]) * k]);
      } else if (c.type === "shake") {
        const amp = (c.amount ?? 4) * u * Math.sin(Math.PI * u);
        const dx = amp * Math.sin(time * 61), dy = amp * Math.cos(time * 47);
        out = map(out, ([x, y]) => [x + dx, y + dy]);
      }
    }
    return out;
  }

  function after(id: string, frame: Frame, time: number): Frame {
    const k = channel(time, [M1 - 0.2, M1 + 0.5], "inOut");
    if (k <= 0) return frame;
    const s = time - M1;
    let out = frame;
    for (const p of post) {
      const rate = "rate" in p && p.rate ? p.rate : 1.8;
      if (p.type === "flap" && p.parts.includes(baseId(id))) {
        const lag = p.lag?.includes(baseId(id)) ? 0.55 : 0;
        const fold = 1 - k * (p.amount ?? 0.62) * (0.5 - 0.5 * Math.cos(2 * Math.PI * rate * s - lag));
        const ax = (p as { at: Vec2 }).at[0];
        out = map(out, ([x, y]) => [ax + (x - ax) * fold, y]);
      } else if ((p.type === "hinge" || p.type === "wiggle") && p.parts.includes(baseId(id))) {
        const pivot = (p as { at: Vec2 }).at;
        const phase = p.phase ?? 0;
        const w = p.type === "hinge" ? 0.5 - 0.5 * Math.cos(2 * Math.PI * rate * s - phase) : Math.sin(2 * Math.PI * rate * s + phase);
        const angle = (p.amount ?? (p.type === "hinge" ? -1.6 : 0.1)) * w * k;
        const short = p.type === "hinge" ? 1 - 0.14 * Math.sin(Math.PI * w) : 1;
        out = map(out, q => { const r = rotate(q, angle, pivot); return [pivot[0] + (r[0] - pivot[0]) * short, pivot[1] + (r[1] - pivot[1]) * short]; });
      } else if (p.type === "spin" && p.parts.includes(baseId(id))) {
        const angle = 2 * Math.PI * (p.turns ?? 1) * channel(time, [M1 + 0.2, END], "inOut");
        out = map(out, q => rotate(q, angle, (p as { at: Vec2 }).at));
      } else if (p.type === "pulse" && inList(p.parts, id)) {
        const g = 1 + k * (p.amount ?? 0.05) * Math.sin(2 * Math.PI * rate * s);
        const centre = poseOf(frame).c;
        out = map(out, ([x, y]) => [centre[0] + (x - centre[0]) * g, centre[1] + (y - centre[1]) * g]);
      }
    }
    for (const p of post) {
      if (p.type === "bob") {
        const dy = k * (p.amount ?? 6) * Math.sin(2 * Math.PI * (p.rate ?? 1.8) * s);
        out = map(out, ([x, y]) => [x, y - dy]);
      } else if (p.type === "lift") {
        const f = channel(time, [M1 + 0.5, END], "in");
        out = map(out, ([x, y]) => [x + p.to[0] * f, y + p.to[1] * f]);
      }
    }
    return out;
  }

  function wind(ctx: CanvasRenderingContext2D, time: number) {
    const c = causes.find(x => x.type === "wind") as Extract<Cause, { type: "wind" }> | undefined;
    if (!c) return;
    const dir = c.direction === "left" ? -1 : 1, n = c.streaks ?? 9;
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = look.ink;
    ctx.lineWidth = 1.4;
    for (let i = 0; i < n; i++) {
      const start = M0 * 0.45 + i * 0.16, u = (time - start) / 1.5;
      if (u <= 0 || u >= 1) continue;
      const y = 150 + ((i * 97) % 400), len = 170 + (i % 3) * 60;
      const head = dir > 0 ? -200 + u * 1700 : 1480 - u * 1700;
      ctx.globalAlpha = 0.5 * Math.sin(Math.PI * u);
      ctx.beginPath();
      for (let j = 0; j <= 20; j++) {
        const px = head - dir * (len - (len * j) / 20), py = y + 10 * Math.sin(px / 70 + i);
        if (j) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  const legend = spec.mappings.map(m => {
    const f = [m.from].flat(), t = [m.to].flat();
    const side = (list: string[], none: string) => list.length ? list.join(" + ") : none;
    const kind = !f.length ? " (born)" : !t.length ? " (vanish)" : t.length > 1 ? " (split)" : f.length > 1 ? " (merge)" : "";
    return { text: side(f, "∅") + " → " + side(t, "∅") + kind, window: m.window ?? [0, 1] };
  });
  const R = spec.render;
  const trackOf = new Map(plan.tracks.map(tr => [tr.id, tr]));
  const fuseIndex = (id?: string) => id === undefined ? -1 : (R?.fuse ?? []).findIndex(g => g.includes(id));
  // Decals are decided ONCE, from the drawings: a part is a surface mark (eye, spot, stripe) if it is
  // small and lies inside another part of its own drawing. Deciding per frame made parts flicker
  // between geometry and decal while they moved past each other.
  const marks = (doc: SvgDoc) => new Set(doc.parts.filter(p => {
    const c = poseOf(p.shape).c, area = p.shape.pieces.reduce((s, q) => s + Math.abs(signedArea(q.outer)), 0);
    return doc.parts.some(h => h !== p && h.shape.pieces.some(q => contains(q.outer, c) && Math.abs(signedArea(q.outer)) > 4 * area));
  }).map(p => p.id));
  const markA = marks(a), markB = marks(b);
  const isMark = (frameId: string) => {
    const tr = trackOf.get(frameId);
    return Boolean(tr && (tr.to ? markB.has(tr.to.id) : tr.from && markA.has(tr.from.id)));
  };
  const groupOf = (frameId: string) => {
    const tr = trackOf.get(frameId);
    if (!tr) return "solo:" + frameId;
    const g = Math.max(fuseIndex(tr.from?.id), fuseIndex(tr.to?.id));
    if (g >= 0) return "fuse:" + g;
    if (tr.kind === "merge") return "merge:" + tr.to!.id;
    return "solo:" + frameId;
  };
  let sdf: SdfRenderer | null = null;
  /** before → mid over the first half of the morph, mid → after over the second half. */
  const sched = (v: Triple | undefined, fallback: Triple, time: number) => {
    const [x, y, z] = v ?? fallback;
    const u = Math.max(0, Math.min(1, (time - M0) / (M1 - M0)));
    const e = (q: number) => q * q * (3 - 2 * q);
    return u < 0.5 ? x + (y - x) * e(u * 2) : y + (z - y) * e(u * 2 - 1);
  };
  const rgb = (hex: string): [number, number, number] => /^#[0-9a-f]{6}$/i.test(hex) ? [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number] : [0.5, 0.5, 0.5];
  const groundY = Math.max(...a.parts.flatMap(p => p.shape.pieces.flatMap(q => q.outer.map(v => v[1]))));

  return {
    id: spec.id,
    title: spec.title,
    duration: END,
    draw(ctx, time) {
      ctx.fillStyle = look.background;
      ctx.fillRect(0, 0, 1280, 720);
      const t = channel(time, [M0, M1], "linear");
      if (look.ground) {
        ctx.fillStyle = "rgba(0,0,0,.07)";
        ctx.beginPath();
        ctx.ellipse(at[0], groundY + 4, height * 0.2, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(0,0,0,.14)";
        ctx.fillRect(80, groundY + 4, 1120, 1.5);
      }
      wind(ctx, time);
      if (R?.track === "sdf") {
        sdf ??= createSdfRenderer();
        const blend = sched(R.blend, [0, 14, 4], time);
        const material = {
          wobble: sched(R.wobble, [0, 5, 1], time), gloss: sched(R.gloss, [0.3, 0.7, 0.6], time),
          sss: sched(R.sss, [0, 0.4, 0.4], time), mottle: sched(R.mottle, [0, 0, 0], time), holeBlend: 2, anchor: at,
        };
        // One SDF layer per fuse group, in paint order of each group's first part.
        const layers = new Map<string, { prims: Prim[]; rings: Array<readonly (readonly [number, number])[]> }>();
        for (const part of plan.at(t)) {
          const frame = after(part.id, before(part.id, part.frame, time), time);
          if (!frame.pieces.length) continue;
          // Surface marks paint onto whichever layer they sit on (never become geometry).
          if (isMark(part.id)) {
            const c = poseOf(frame).c;
            const host = [...layers.values()].reverse().find(l => l.rings.some(ring => contains(ring as never, c))) ?? [...layers.values()].at(-1);
            host?.prims.push(...frameDecals(frame, rgb(part.fill), 1, 1.5));
            continue;
          }
          const key = groupOf(part.id);
          const layer = layers.get(key) ?? layers.set(key, { prims: [], rings: [] }).get(key)!;
          layer.rings.push(...frame.pieces.map(p => p.outer));
          // A bridge never exceeds the part's own size, so it grows with a part being born instead of popping in.
          const size = Math.sqrt(frame.pieces.reduce((s, q) => s + Math.abs(signedArea(q.outer)), 0) / Math.PI);
          layer.prims.push(...framePrims(frame, { ...material, color: rgb(part.fill), blend: layer.prims.length ? Math.min(blend, 0.6 * size) : 0 }));
        }
        const depth = sched(R.thickness, [6, 16, 14], time), shadow = R.shadow ?? ((R.style ?? "flat") === "flat" ? 0 : 0.22);
        const flat = (R.style ?? "flat") === "flat";
        for (const { prims } of layers.values()) if (prims.length) sdf.draw(ctx, prims, {
          flat, thickness: depth, time, seed: 3, light: [-0.4, -0.7, 0.6], shadowOffset: [depth * 0.6, depth * 0.9], shadowSoftness: depth * 0.6, shadowOpacity: shadow,
          keyColor: [1, 0.97, 0.92], ambientTop: [0.66, 0.66, 0.7], ambientBottom: [0.3, 0.3, 0.36], rimColor: [1, 1, 1], sssColor: [1, 0.85, 0.95], shadowColor: [0.05, 0.05, 0.1],
        });
      } else {
        for (const part of plan.at(t)) fillFrame(ctx, after(part.id, before(part.id, part.frame, time), time), part.fill);
      }

      ctx.font = "600 13px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillStyle = look.ink;
      ctx.globalAlpha = 0.55;
      ctx.fillText(look.label ?? "MORPH MASTER · " + spec.id.toUpperCase(), 48, 52);
      ctx.textAlign = "right";
      ctx.fillText(time.toFixed(2).padStart(5, "0") + " s", 1232, 52);
      ctx.globalAlpha = 1;
      if (look.legend) legend.forEach((row, i) => {
        const active = t > row.window[0] && t < row.window[1], done = t >= row.window[1];
        ctx.fillStyle = active ? look.accent : look.ink;
        ctx.globalAlpha = active ? 1 : done ? 0.85 : 0.4;
        ctx.fillText(row.text, 1232, 640 - (legend.length - 1 - i) * 20);
      });
      ctx.globalAlpha = 1;
      ctx.textAlign = "left";
      ctx.fillStyle = look.ink;
      ctx.globalAlpha = 0.12;
      ctx.fillRect(48, 684, 1184, 2);
      ctx.globalAlpha = 1;
      ctx.fillStyle = look.accent;
      ctx.fillRect(48, 684, 1184 * time / END, 2);
    },
  };
}

const CAUSES = ["sway", "wind", "pulse", "shake"], PAYOFFS = ["flap", "hinge", "wiggle", "spin", "bob", "lift", "pulse"];
const STYLES = ["morph", "pose"], EASES = ["linear", "in", "out", "inOut", "inOutQuint", "anticipate"];

/** Check an AI-written morph.json and return it typed, or throw every problem at once. */
export function validateSpec(input: unknown): MorphSpec {
  const errors: string[] = [];
  const s = input as Record<string, unknown>;
  const isPair = (v: unknown) => Array.isArray(v) && v.length === 2 && v.every(n => typeof n === "number" && Number.isFinite(n));
  const isRef = (v: unknown) => typeof v === "string" || isPair(v);
  if (!s || typeof s !== "object") throw new Error("morph.json must be an object.");
  if (typeof s.id !== "string" || !/^[a-z0-9-]+$/.test(s.id)) errors.push("id: lowercase letters, digits and dashes.");
  if (typeof s.title !== "string") errors.push("title: required string.");
  const place = s.place as Record<string, unknown> | undefined;
  if (place?.at !== undefined && !isPair(place.at)) errors.push("place.at: [x, y].");
  if (!Array.isArray(s.mappings) || !s.mappings.length) errors.push("mappings: non-empty array.");
  else (s.mappings as Record<string, unknown>[]).forEach((m, i) => {
    const ids = (v: unknown) => typeof v === "string" || (Array.isArray(v) && v.every(x => typeof x === "string"));
    if (!ids(m.from) || !ids(m.to)) errors.push(`mappings[${i}]: from / to are a part id or a list of ids ([] for born / vanish).`);
    if (m.window !== undefined && !(isPair(m.window) && (m.window as number[])[0] >= 0 && (m.window as number[])[1] <= 1 && (m.window as number[])[0] < (m.window as number[])[1]))
      errors.push(`mappings[${i}].window: [start, end] with 0 ≤ start < end ≤ 1.`);
    if (m.style !== undefined && !STYLES.includes(m.style as string)) errors.push(`mappings[${i}].style: ${STYLES.join(" | ")}.`);
    if (m.ease !== undefined && !EASES.includes(m.ease as string)) errors.push(`mappings[${i}].ease: ${EASES.join(" | ")}.`);
    for (const k of ["bornFrom", "vanishTo"]) if (m[k] !== undefined && !isRef(m[k])) errors.push(`mappings[${i}].${k}: a part id, "id@top|bottom|left|right", or [x, y] in SVG units.`);
  });
  const motions = (key: "cause" | "payoff", allowed: string[]) => {
    const list = s[key];
    if (list === undefined) return;
    if (!Array.isArray(list)) { errors.push(key + ": array."); return; }
    (list as Record<string, unknown>[]).forEach((c, i) => {
      if (!allowed.includes(c.type as string)) errors.push(`${key}[${i}].type: ${allowed.join(" | ")}.`);
      for (const k of ["pivot", "axis"]) if (c[k] !== undefined && !isRef(c[k])) errors.push(`${key}[${i}].${k}: a part id, "id@anchor", or [x, y].`);
      if (["flap", "hinge", "wiggle", "spin"].includes(c.type as string) && !(Array.isArray(c.parts) && c.parts.length)) errors.push(`${key}[${i}].parts: which parts move.`);
      if (["flap"].includes(c.type as string) && c.axis === undefined) errors.push(`${key}[${i}].axis: required.`);
      if (["hinge", "wiggle", "spin"].includes(c.type as string) && c.pivot === undefined) errors.push(`${key}[${i}].pivot: required.`);
      if (c.type === "sway" && c.pivot === undefined) errors.push(`${key}[${i}].pivot: required.`);
      if (c.type === "lift" && !isPair(c.to)) errors.push(`${key}[${i}].to: [dx, dy] in design pixels.`);
    });
  };
  motions("cause", CAUSES);
  motions("payoff", PAYOFFS);
  const render = s.render as Record<string, unknown> | undefined;
  if (render !== undefined) {
    if (!["flat", "sdf"].includes(render.track as string)) errors.push("render.track: flat | sdf.");
    if (render.style !== undefined && !["flat", "glossy"].includes(render.style as string)) errors.push("render.style: flat | glossy.");
    if (render.fuse !== undefined && !(Array.isArray(render.fuse) && render.fuse.every(g => Array.isArray(g) && g.every(x => typeof x === "string"))))
      errors.push("render.fuse: a list of part-id lists, e.g. [[\"wax\", \"drip_l\", \"pot\"]].");
    for (const k of ["thickness", "gloss", "wobble", "blend", "sss", "mottle"]) {
      const v = render[k];
      if (v !== undefined && !(Array.isArray(v) && v.length === 3 && v.every(n => typeof n === "number" && Number.isFinite(n) && n >= 0)))
        errors.push(`render.${k}: [before, mid, after], non-negative numbers.`);
    }
  }
  if (errors.length) throw new Error("morph.json problems:\n- " + errors.join("\n- "));
  return input as MorphSpec;
}
