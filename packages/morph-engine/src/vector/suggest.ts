import { signedArea, type Vec2 } from "./geom";
import { poseOf } from "./remap";
import type { SvgDoc, SvgPart } from "./svg";

/**
 * Draft a part mapping for ANY two part drawings, from geometry and colour alone.
 * Every part of both drawings gets exactly one fate, so the draft always runs.
 * It does not know meaning (that a petal is "like" a wing): read `review`, then rewrite.
 */
export type Role = "core" | "appendage" | "detail" | "piece";
interface Feature { id: string; c: Vec2; area: number; share: number; elong: number; angle: number; lab: [number, number, number]; role: Role }

function lab(hex: string | null): [number, number, number] {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return [0.5, 0, 0];
  const lin = (c: number) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const [r, g, b] = [1, 3, 5].map(i => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122 * r + 0.5363 * g + 0.0514 * b), m = Math.cbrt(0.2119 * r + 0.6807 * g + 0.1074 * b), s = Math.cbrt(0.0883 * r + 0.2817 * g + 0.63 * b);
  return [0.2105 * l + 0.7936 * m - 0.0041 * s, 1.978 * l - 2.4286 * m + 0.4506 * s, 0.0259 * l + 0.7828 * m - 0.8087 * s];
}

function features(doc: SvgDoc): { parts: SvgPart[]; f: Feature[] } {
  const [vx, vy, vw, vh] = doc.viewBox, size = vh || 1;
  const total = doc.parts.reduce((s, p) => s + p.shape.pieces.reduce((t, q) => t + Math.abs(signedArea(q.outer)), 0), 0) || 1;
  const f = doc.parts.map(p => {
    const pose = poseOf(p.shape);
    const pts = p.shape.pieces.flatMap(q => q.outer);
    let xx = 0, yy = 0, xy = 0;
    for (const [x, y] of pts) { const dx = x - pose.c[0], dy = y - pose.c[1]; xx += dx * dx; yy += dy * dy; xy += dx * dy; }
    const tr = xx + yy, det = xx * yy - xy * xy, l1 = tr / 2 + Math.sqrt(Math.max(0, tr * tr / 4 - det)), l2 = tr / 2 - Math.sqrt(Math.max(0, tr * tr / 4 - det));
    const area = p.shape.pieces.reduce((s, q) => s + Math.abs(signedArea(q.outer)), 0);
    return { id: p.id, c: [(pose.c[0] - vx - vw / 2) / size, (pose.c[1] - vy - vh / 2) / size] as Vec2, area, share: area / total,
      elong: Math.sqrt(l1 / Math.max(1e-9, l2)), angle: pose.angle, lab: lab(p.fill), role: "piece" as Role };
  });
  const maxShare = Math.max(...f.map(x => x.share));
  for (const x of f) x.role = x.share === maxShare && x.share > 0.18 ? "core" : x.share < 0.025 ? "detail" : x.elong > 2.2 ? "appendage" : "piece";
  return { parts: doc.parts, f };
}

export function suggestMapping(docA: SvgDoc, docB: SvgDoc, id = "my-morph") {
  const A = features(docA), B = features(docB);
  const cost = (a: Feature, b: Feature) => {
    const pos = Math.hypot(a.c[0] - b.c[0], a.c[1] - b.c[1]);
    const size = Math.abs(Math.log((a.share + 1e-4) / (b.share + 1e-4)));
    const shape = Math.abs(Math.log(a.elong / b.elong));
    const color = Math.hypot(a.lab[0] - b.lab[0], a.lab[1] - b.lab[1], a.lab[2] - b.lab[2]);
    const role = a.role === b.role ? 0 : (a.role === "core" || b.role === "core") ? 0.6 : 0.25;
    return 1.6 * pos + 0.7 * size + 0.35 * shape + 0.5 * color + role;
  };

  // 1. One-to-one pairs, cheapest first, skipping pairs that are clearly unrelated.
  const options = A.f.flatMap((a, i) => B.f.map((b, j) => ({ i, j, v: cost(a, b) }))).sort((x, y) => x.v - y.v);
  const pair = new Map<number, number>(), taken = new Set<number>();
  for (const o of options) if (!pair.has(o.i) && !taken.has(o.j) && o.v < 2.2) { pair.set(o.i, o.j); taken.add(o.j); }

  // 2. Leftover sources merge into their best target; leftover targets are born (details) or split off a source.
  const merges = new Map<number, number[]>();
  for (let i = 0; i < A.f.length; i++) if (!pair.has(i)) {
    const j = B.f.map((b, k) => ({ k, v: cost(A.f[i], b) })).sort((x, y) => x.v - y.v)[0]?.k;
    if (j === undefined) continue;
    // A free best target becomes a plain pair; merges only go into targets that already have a partner.
    if (!taken.has(j)) { pair.set(i, j); taken.add(j); continue; }
    merges.set(j, [...(merges.get(j) ?? []), i]);
  }
  const splits = new Map<number, number[]>(), born: number[] = [];
  const mergedTargets = new Set(merges.keys());
  for (let j = 0; j < B.f.length; j++) if (!taken.has(j)) {
    if (B.f[j].role === "detail") { born.push(j); continue; }
    // Split from the best source whose mapping can still grow (a 1 → 1 pair, not a merge).
    const best = [...pair.entries()].filter(([, pj]) => !mergedTargets.has(pj)).map(([i]) => ({ i, v: cost(A.f[i], B.f[j]) })).sort((x, y) => x.v - y.v)[0];
    if (best && best.v < 2.6) splits.set(best.i, [...(splits.get(best.i) ?? []), j]);
    else born.push(j);
  }

  // 3. Assemble mappings with styles and windows.
  const review: string[] = [];
  const conf = (v: number) => Math.max(0, Math.min(1, 1 - v / 2.4));
  const mappings: Record<string, unknown>[] = [];
  const roleOrder: Record<Role, number> = { core: 0, piece: 1, appendage: 2, detail: 3 };
  const windowFor = (role: Role, k: number) => role === "core" ? [0.1, 0.75] : role === "detail" ? [0.6, 0.95] : [Math.min(0.3, 0.04 * k), Math.min(0.9, 0.62 + 0.04 * k)];
  let k = 0;
  for (const [i, j] of [...pair.entries()].sort((x, y) => roleOrder[A.f[x[0]].role] - roleOrder[A.f[y[0]].role])) {
    const a = A.f[i], b = B.f[j];
    const extra = splits.get(i), sources = merges.get(j);
    const travel = Math.hypot(a.c[0] - b.c[0], a.c[1] - b.c[1]);
    const turn = Math.abs(((b.angle - a.angle + Math.PI * 1.5) % Math.PI) - Math.PI / 2);
    const pose = travel > 0.12 || turn > 0.5;
    const m: Record<string, unknown> = { from: sources ? [a.id, ...sources.map(s => A.f[s].id)] : a.id, to: extra ? [b.id, ...extra.map(e => B.f[e].id)] : b.id, window: windowFor(a.role, k++) };
    if (pose && !sources && !extra) { m.style = "pose"; m.arc = Math.round(40 * Math.sign(b.c[0] - a.c[0] || 1) * -Math.sign(a.c[1] - b.c[1] || 1)); }
    if (sources || extra) { m.stagger = 0.1; m.ease = "inOut"; }
    mappings.push(m);
    const c = conf(cost(a, b));
    review.push(`${a.id} → ${b.id}${extra ? " + " + extra.map(e => B.f[e].id).join(" + ") + " (split)" : ""}${sources ? " ← also " + sources.map(s => A.f[s].id).join(", ") + " (merge)" : ""}: ` +
      `roles ${a.role}/${b.role}, moved ${travel.toFixed(2)}, size ×${(b.share / a.share).toFixed(2)}${pose ? ", travels → pose" : ""}, confidence ${c.toFixed(2)}${c < 0.45 ? "  ⚠ LOW — decide by meaning" : ""}`);
  }
  // A merge whose target had no 1 → 1 partner.
  for (const [j, list] of merges) if (![...pair.values()].includes(j)) {
    mappings.push({ from: list.map(i => A.f[i].id), to: B.f[j].id, window: [0.1, 0.8], stagger: 0.1, ease: "inOut" });
    review.push(`${list.map(i => A.f[i].id).join(" + ")} → ${B.f[j].id} (merge, no clear partner)  ⚠ LOW — decide by meaning`);
  }
  if (born.length) {
    mappings.push({ from: [], to: born.map(j => B.f[j].id), window: [0.7, 0.98], stagger: 0.12, ease: "out" });
    review.push(`born late: ${born.map(j => B.f[j].id).join(", ")} — give them a source if something should visibly become them (bornFrom)`);
  }
  review.push("This draft uses geometry only. Before using it: name each part's ROLE in both drawings, pair roles by meaning, give leftovers a story (split, merge, born from, vanish into), then add a cause and a payoff.");

  const spec = { id, title: id, place: { at: [640, 360], height: 540 }, timing: { cause: 1.0, morph: 4.0, payoff: 2.4 }, mappings, cause: [], payoff: [] };
  const roles = { source: A.f.map(f => ({ id: f.id, role: f.role, share: +f.share.toFixed(3), elong: +f.elong.toFixed(2) })), target: B.f.map(f => ({ id: f.id, role: f.role, share: +f.share.toFixed(3), elong: +f.elong.toFixed(2) })) };
  return { spec, roles, review };
}
