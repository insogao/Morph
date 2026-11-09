import { ease, type Easing } from "./timeline";

/**
 * Multi-stage stories on one clock (A → B → C …), the lightweight "morph graph": stages are placed on a global
 * timeline so each one STARTS BEFORE THE PREVIOUS ENDS (coupled, never chained), and every stage reads its own
 * eased progress. What hands one stage to the next (a carrier present in both, or a hide moment) is the scene's
 * job; this only keeps the timing honest. Learned from blind test round 2 (B6, acorn → oak → leaf → bird).
 */

export interface Stage {
  id: string;
  /** Seconds the stage takes on its own. */
  duration: number;
  /** Seconds this stage starts before the previous one ends (default 30 % of the shorter of the two). */
  overlap?: number;
  ease?: Easing;
}

export interface Chain {
  duration: number;
  /** Global [start, end] of every stage. */
  windows: Record<string, [number, number]>;
  /** The overlap of stage i with stage i + 1, where the hand-off must happen: render these densely. */
  handoffs: Array<{ from: string; to: string; window: [number, number] }>;
  /** Eased 0..1 progress of a stage at global time t. */
  progress(id: string, t: number): number;
  /** Stages under way at t (0 < progress < 1). */
  active(t: number): string[];
}

export function chain(stages: readonly Stage[], opts: { lead?: number; tail?: number } = {}): Chain {
  if (!stages.length) throw new Error("chain: at least one stage.");
  const ids = new Set<string>();
  const windows: Record<string, [number, number]> = {}, handoffs: Chain["handoffs"] = [];
  let t = opts.lead ?? 0.6;
  stages.forEach((s, i) => {
    if (ids.has(s.id)) throw new Error("chain: duplicate stage id " + s.id);
    if (!(s.duration > 0)) throw new Error("chain: stage " + s.id + " needs a positive duration.");
    ids.add(s.id);
    if (i > 0) {
      const prev = stages[i - 1], ov = s.overlap ?? 0.3 * Math.min(prev.duration, s.duration);
      if (ov < 0 || ov >= Math.min(prev.duration, s.duration)) throw new Error("chain: overlap of " + s.id + " must be ≥ 0 and shorter than both stages.");
      t -= ov;
      handoffs.push({ from: prev.id, to: s.id, window: [t, windows[prev.id][1]] });
    }
    windows[s.id] = [t, t + s.duration];
    t += s.duration;
  });
  const byId = new Map(stages.map(s => [s.id, s]));
  const progress = (id: string, time: number) => {
    const w = windows[id];
    if (!w) throw new Error("chain: no stage " + id);
    return ease(byId.get(id)!.ease ?? "inOut", Math.max(0, Math.min(1, (time - w[0]) / (w[1] - w[0]))));
  };
  return {
    duration: t + (opts.tail ?? 1.2), windows, handoffs, progress,
    active: time => stages.filter(s => time > windows[s.id][0] && time < windows[s.id][1]).map(s => s.id),
  };
}
