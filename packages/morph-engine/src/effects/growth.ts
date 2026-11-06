import type { Vec2 } from "../renderers/sdf-gl";
import { inside } from "./fracture";
import { rng } from "./skeleton";

export interface GrowthNode {
  p: Vec2;
  parent: number;
  /** Iteration at which the node was created. Map it to time for a staged reveal. */
  born: number;
  /** Pipe-model radius (thicker toward the root). */
  radius: number;
  children: number;
}

export interface GrowthOptions {
  attractors?: number;
  influence?: number;
  kill?: number;
  step?: number;
  maxIterations?: number;
  seed?: number;
  tipRadius?: number;
}

/**
 * Space colonization (Runions et al. 2007). Attractors are sampled inside the target outline,
 * so the branching structure fills that silhouette. Fully deterministic for a given seed.
 */
export function colonize(outline: readonly Vec2[], root: Vec2, options: GrowthOptions = {}): { nodes: GrowthNode[]; iterations: number } {
  const { attractors = 520, influence = 90, kill = 13, step = 7, maxIterations = 400, seed = 1, tipRadius = 1.1 } = options;
  const r = rng(seed);
  const xs = outline.map(p => p[0]), ys = outline.map(p => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  let pts: Vec2[] = [];
  let guard = 0;
  while (pts.length < attractors && guard++ < attractors * 50) {
    const p: Vec2 = [x0 + r() * (x1 - x0), y0 + r() * (y1 - y0)];
    if (inside(outline, p[0], p[1])) pts.push(p);
  }
  const nodes: GrowthNode[] = [{ p: root, parent: -1, born: 0, radius: tipRadius, children: 0 }];
  // Uniform grid over nodes (cell = influence) keeps nearest-node queries local.
  const grid = new Map<string, number[]>();
  const key = (x: number, y: number) => Math.floor(x / influence) + "," + Math.floor(y / influence);
  const add = (i: number) => {
    const k = key(nodes[i].p[0], nodes[i].p[1]);
    const list = grid.get(k);
    if (list) list.push(i); else grid.set(k, [i]);
  };
  add(0);
  const nearest = (a: Vec2) => {
    const cx = Math.floor(a[0] / influence), cy = Math.floor(a[1] / influence);
    let best = -1, bd = influence;
    for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) {
      for (const i of grid.get(gx + "," + gy) ?? []) {
        const d = Math.hypot(nodes[i].p[0] - a[0], nodes[i].p[1] - a[1]);
        if (d < bd) { bd = d; best = i; }
      }
    }
    return [best, bd] as const;
  };
  let it = 0;
  for (; it < maxIterations && pts.length; it++) {
    const pull = new Map<number, [number, number, number]>();
    for (const a of pts) {
      const [best, bd] = nearest(a);
      if (best < 0) continue;
      const v = pull.get(best) ?? [0, 0, 0];
      v[0] += (a[0] - nodes[best].p[0]) / bd; v[1] += (a[1] - nodes[best].p[1]) / bd; v[2]++;
      pull.set(best, v);
    }
    const first = nodes.length;
    if (!pull.size) {
      // Nothing in reach yet: the trunk climbs toward the outline's centroid.
      const tip = nodes.length - 1;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const d = Math.hypot(cx - nodes[tip].p[0], cy - nodes[tip].p[1]) || 1;
      nodes.push({ p: [nodes[tip].p[0] + (cx - nodes[tip].p[0]) / d * step + Math.sin(it) * .8, nodes[tip].p[1] + (cy - nodes[tip].p[1]) / d * step], parent: tip, born: it + 1, radius: tipRadius, children: 0 });
      nodes[tip].children++;
      add(nodes.length - 1);
      continue;
    }
    for (const [i, [dx, dy]] of pull) {
      const l = Math.hypot(dx, dy);
      if (l < 1e-6) continue;
      const p: Vec2 = [nodes[i].p[0] + dx / l * step, nodes[i].p[1] + dy / l * step];
      nodes.push({ p, parent: i, born: it + 1, radius: tipRadius, children: 0 });
      nodes[i].children++;
      add(nodes.length - 1);
    }
    if (nodes.length === first) break;
    const fresh = nodes.slice(first);
    pts = pts.filter(a => !fresh.some(n => Math.hypot(n.p[0] - a[0], n.p[1] - a[1]) < kill) &&
      !(nodes[nearest(a)[0]] && nearest(a)[1] < kill));
  }
  // Pipe model: accumulate from the tips toward the root.
  for (let i = nodes.length - 1; i > 0; i--) {
    const parent = nodes[nodes[i].parent];
    parent.radius = Math.pow(Math.pow(parent.radius, 2.4) + Math.pow(nodes[i].radius, 2.4), 1 / 2.4);
  }
  return { nodes, iterations: it };
}
