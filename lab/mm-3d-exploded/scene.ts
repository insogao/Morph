import { MAPPINGS, rig } from "../mm-3d-points/rig";

/*
 * MM17 — exploded reassembly (M5): the same rocket → lighthouse mappings, but every part flies OUT as a
 * solid (like an exploded-view drawing), turns into points that reshape into its new part out there, and
 * that part flies back IN as a solid.
 * Order: fins → base first (the foundation), then body → tower, flame → lamp, window → gallery,
 * nose → cap, and the stripes and door last.
 */
const W: Record<string, [[number, number], number]> = {
  base: [[0.0, 0.55], 1.1], tower: [[0.1, 0.65], 0.7], lamp: [[0.25, 0.8], 0.9], gallery: [[0.3, 0.85], 1.3], cap: [[0.35, 0.95], 0.9], stripes: [[0.55, 1.0], 0.6],
};
const key = (to: string | string[]) => Array.isArray(to) ? (to.length > 1 ? "stripes" : to[0]) : to;
export const scene = rig("mm-3d-exploded", "MM17 · 3D 爆炸重组：火箭 → 灯塔（同一份映射，M5）",
  // Each part flies out as a solid, reshapes out there as a cloud, and flies back in as its new part.
  MAPPINGS.map(m => ({ ...m, window: W[key(m.to)][0], explode: W[key(m.to)][1] * 1.4, style: "exploded" as const, swirl: 0.08 })),
  { label: "EXPLODED REASSEMBLY", swirl: 0.2, cause: [0.3, 1.1], morph: [1.1, 6.1], end: 7.4 });
