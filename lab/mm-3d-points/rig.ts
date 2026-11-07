import { Color, DirectionalLight, HemisphereLight, PerspectiveCamera, Scene } from "three";
import type { MorphScene } from "../../packages/morph-engine/src/core/scene";
import { ThreeLayer } from "../../packages/morph-engine/src/renderers/three";
import { loadGlbParts, Morph3D, type Mapping3D } from "../../packages/morph-engine/src/renderers/morph3d";
import { noise3, type PartMesh, type V3 } from "../../packages/morph-engine/src/vector/cloud";
import rocketGlb from "../../fixtures/s3/rocket.glb?inline";
import lighthouseGlb from "../../fixtures/s3/lighthouse.glb?inline";

/** Shared by MM16 and MM17: the rocket → lighthouse pair, loaded through the real glTF path. */
export const MODELS: { a: PartMesh[]; b: PartMesh[] } | null = typeof window === "undefined" ? null : { a: await loadGlbParts(rocketGlb), b: await loadGlbParts(lighthouseGlb) };

const yRange = (parts: PartMesh[]) => {
  let lo = Infinity, hi = -Infinity;
  for (const p of parts) for (let i = 1; i < p.positions.length; i += 3) { lo = Math.min(lo, p.positions[i]); hi = Math.max(hi, p.positions[i]); }
  return [lo, hi] as const;
};

export function rig(id: string, title: string, mappings: Mapping3D[], opts: { models?: { a: PartMesh[]; b: PartMesh[] } | null; swirl?: number; label: string; cause?: [number, number]; morph: [number, number]; end: number }): MorphScene {
  let built: { scene: Scene; camera: PerspectiveCamera; morph: Morph3D; layer: ThreeLayer } | null = null;
  const build = () => {
    // Any pair of loaded models (default: rocket → lighthouse). Pass your own with opts.models.
    const M = opts.models ?? MODELS;
    if (!M) throw new Error("3D scenes need a browser.");
    const [a0, a1] = yRange(M.a), [b0, b1] = yRange(M.b);
    // The rocket leaves from the nose down; the lighthouse is built from the base up. Noise bends both fronts.
    const release = (p: V3) => 0.7 * (1 - (p[1] - a0) / (a1 - a0)) + 0.3 * noise3(p[0], p[1], p[2], 0.35, 1);
    const land = (p: V3) => 0.7 * ((p[1] - b0) / (b1 - b0)) + 0.3 * noise3(p[0], p[1], p[2], 0.35, 2);
    const morph = new Morph3D(M.a, M.b, { mappings, release, land, points: 36000, swirl: opts.swirl ?? 0.6, size: 0.032 });
    const scene = new Scene();
    scene.add(new HemisphereLight(new Color("#fff1dc"), new Color("#3a3f5c"), 1.25));
    const key = new DirectionalLight(new Color("#ffffff"), 2.3);
    key.position.set(3, 5, 4);
    scene.add(key, morph.group);
    const camera = new PerspectiveCamera(30, 16 / 9, 0.1, 50);
    camera.position.set(0, 0.45, 7.4);
    camera.lookAt(0, 0.2, 0);
    return { scene, camera, morph, layer: new ThreeLayer() };
  };
  return {
    id, title, duration: opts.end,
    draw(ctx, t) {
      const g = ctx.createLinearGradient(0, 0, 0, 720);
      g.addColorStop(0, "#1b2136"); g.addColorStop(0.65, "#3b3552"); g.addColorStop(1, "#6b4f5e");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 1280, 720);
      built ??= build();
      const { scene, camera, morph, layer } = built;
      const u = Math.max(0, Math.min(1, (t - opts.morph[0]) / (opts.morph[1] - opts.morph[0])));
      // A slow turntable so the volume reads; the cause is a short rumble of the rocket before lift-off.
      morph.group.rotation.y = -0.5 + 0.9 * Math.min(1, t / opts.end);
      const rumble = opts.cause && t > opts.cause[0] && t < opts.cause[1] ? Math.sin(Math.PI * (t - opts.cause[0]) / (opts.cause[1] - opts.cause[0])) : 0;
      morph.group.position.set(0.012 * rumble * Math.sin(t * 90), -0.15 + 0.01 * rumble * Math.cos(t * 70), 0);
      const ratio = Math.min(2, Math.hypot(ctx.getTransform().a, ctx.getTransform().b));
      morph.update(u, 720 * ratio, camera.fov);
      layer.composite(ctx, scene, camera, { x: 0, y: 0, width: 1280, height: 720 });
      ctx.font = "600 13px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillStyle = "rgba(235,230,245,.6)";
      ctx.fillText("MORPH MASTER · 3D · " + opts.label + " (" + morph.pointCount + " points, glTF parts)", 48, 52);
      ctx.textAlign = "right";
      ctx.fillText(t.toFixed(2).padStart(5, "0") + " s", 1232, 52);
      ctx.textAlign = "left";
    },
  };
}

/** rocket → lighthouse, by meaning: the nose becomes the cap, the flame becomes the light. */
export const MAPPINGS: Mapping3D[] = [
  { from: "nose", to: "cap" },
  { from: "body", to: "tower" },
  { from: "flame", to: "lamp" },
  { from: "window", to: "gallery" },
  { from: ["fin_a", "fin_b", "fin_c"], to: "base" },
  { from: [], to: ["stripe_1", "stripe_2", "door"], bornFrom: "tower" },
];
