import type { MorphScene } from "../../packages/morph-engine/src/core/scene";
import type { Vec2 } from "../../packages/morph-engine/src/vector/geom";
import { place, type Placement } from "../../packages/morph-engine/src/vector/bitmap";
import { drawArt, drawMeshTexture, loadArt, subjectBox, type Art } from "../../packages/morph-engine/src/vector/bitmap-render";
import { boundaryAt, buildMesh, flips, meshAt, type Mesh } from "../../packages/morph-engine/src/vector/mesh";
import { shapeFromRings } from "../../packages/morph-engine/src/vector/shape";
import { ease } from "../../packages/morph-engine/src/vector/timeline";
import v1 from "./v1.json";
import v2 from "./v2.json";
import full1 from "./v1/full.png?inline";
import full2 from "./v2/full.png?inline";
import body1 from "./v1/body.png?inline";
import tail1 from "./v1/tail.png?inline";
import dorsal1 from "./v1/dorsal.png?inline";
import pectoral1 from "./v1/pectoral.png?inline";
import eye1 from "./v1/eye.png?inline";
import body2 from "./v2/body.png?inline";
import tail2 from "./v2/tail.png?inline";
import dorsal2 from "./v2/dorsal.png?inline";
import pectoral2 from "./v2/pectoral.png?inline";
import eye2 from "./v2/eye.png?inline";

/*
 * MM15 — texture mesh warp (M4b). Two different koi paintings (the user's v1 and v2 candidates),
 * the same parts, different shapes, poses and patterns.
 *   top     cross-fade only: the two pictures overlap → double exposure (two tails, two fin sets)
 *   bottom  mesh warp + blend, per part: each part's texture rides a triangle mesh whose boundary
 *           follows the matched outlines; A is warped forward and B backward onto the SAME in-between
 *           shape, and only then blended — features line up, so there is one fish at every frame.
 * The counter shows triangles whose orientation flipped (where the warp folds).
 */

const PARTS = ["tail", "dorsal", "body", "pectoral", "eye"] as const;
const SRC = { 1: { body: body1, tail: tail1, dorsal: dorsal1, pectoral: pectoral1, eye: eye1 }, 2: { body: body2, tail: tail2, dorsal: dorsal2, pectoral: pectoral2, eye: eye2 } } as const;

interface Loaded { full: [Art, Art]; layers: Record<string, [Art, Art]> }
const loaded: Loaded | null = typeof Image === "undefined" ? null : await (async () => {
  const full = await Promise.all([full1, full2].map(loadArt)) as [Art, Art];
  const layers: Record<string, [Art, Art]> = {};
  for (const id of PARTS) layers[id] = await Promise.all([SRC[1][id], SRC[2][id]].map(loadArt)) as [Art, Art];
  return { full, layers };
})();

// One placement for both paintings (same canvas), fitted to the union of their subjects.
const box = (() => {
  if (!loaded) return [0, 0, 1920, 1080];
  const a = subjectBox(loaded.full[0]), b = subjectBox(loaded.full[1]);
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
})();
const placement = (y: number): Placement => {
  const scale = Math.min(1040 / (box[2] - box[0]), 290 / (box[3] - box[1]));
  return { at: [640, y], scale, center: [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2] };
};
const TOP = placement(196), BOTTOM = placement(526);

// Traced rings are in 2/3 design units of the 1920 × 1080 art; bring them into the bottom panel.
const ringOf = (json: typeof v1, id: string, p: Placement): Vec2[] => {
  const k = 1 / (json.scale as number);
  const rings = (json.layers as unknown as Record<string, { rings: Array<Array<[number, number]>> }>)[id].rings;
  return shapeFromRings(rings.map(r => r.map(([x, y]) => place(p, [x * k, y * k])))).pieces[0].outer;
};
const MESHES: Record<string, Mesh> = Object.fromEntries(PARTS.map(id => [id, buildMesh(ringOf(v1, id, BOTTOM), ringOf(v2, id, BOTTOM), { boundary: id === "eye" ? 32 : 96, spacing: id === "body" ? 12 : 10 })]));
const TOTAL = PARTS.reduce((s, id) => s + MESHES[id].tris.length, 0);

/** A → B, hold, B → A. */
function progress(t: number): number {
  if (t < 0.8) return 0;
  if (t < 4.0) return ease("inOut", (t - 0.8) / 3.2);
  if (t < 5.0) return 1;
  if (t < 8.2) return 1 - ease("inOut", (t - 5.0) / 3.2);
  return 0;
}
const blendOf = (u: number) => { const x = Math.max(0, Math.min(1, (u - 0.3) / 0.4)); return x * x * (3 - 2 * x); };

export const scene: MorphScene = {
  id: "mm-mesh-warp",
  title: "MM15 · 纹理网格形变：交叉淡化 vs 网格形变 + 融合（M4b）",
  duration: 9.0,
  draw(ctx, t) {
    ctx.fillStyle = "#efe7da";
    ctx.fillRect(0, 0, 1280, 720);
    ctx.fillStyle = "rgba(40,30,20,.06)";
    ctx.fillRect(0, 360, 1280, 1);
    const u = progress(t), beta = blendOf(u);
    let folded = 0;
    if (loaded) {
      // Top: cross-fade only.
      ctx.globalAlpha = 1 - beta; drawArt(ctx, loaded.full[0], TOP);
      ctx.globalAlpha = beta; drawArt(ctx, loaded.full[1], TOP);
      ctx.globalAlpha = 1;
      // Bottom: per-part mesh warp, A forward and B backward onto the same in-between shape.
      for (const id of PARTS) {
        const mesh = MESHES[id], [a, b] = loaded.layers[id];
        if (u <= 0) { drawArt(ctx, a, BOTTOM); continue; }
        if (u >= 1) { drawArt(ctx, b, BOTTOM); continue; }
        const pos = meshAt(mesh, boundaryAt(mesh, u));
        folded += flips(mesh, pos);
        drawMeshTexture(ctx, a, BOTTOM, mesh.rest, pos, mesh.tris, 1);
        drawMeshTexture(ctx, b, BOTTOM, mesh.onB, pos, mesh.tris, beta);
      }
    }
    ctx.font = "600 13px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = "rgba(40,30,20,.6)";
    ctx.fillText("CROSS-FADE ONLY · 仅交叉淡化", 48, 52);
    ctx.fillText("MESH WARP + BLEND · 网格形变 + 融合     flipped triangles " + folded + " / " + TOTAL, 48, 382);
    ctx.textAlign = "right";
    ctx.fillText(t.toFixed(2).padStart(5, "0") + " s   blend " + Math.round(beta * 100) + "%", 1232, 52);
    ctx.textAlign = "left";
  },
};
