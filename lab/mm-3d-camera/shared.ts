import { Color, DirectionalLight, HemisphereLight, type Mesh, PerspectiveCamera, Scene, SphereGeometry, Vector3 } from "three";
import { ThreeLayer } from "../../packages/morph-engine/src/renderers/three";
import { loadGlbParts, Morph3D, type Mapping3D } from "../../packages/morph-engine/src/renderers/morph3d";
import type { PartMesh, V3 } from "../../packages/morph-engine/src/vector/cloud";
import planetGlb from "../../fixtures/s3/planet.glb?inline";
import rocketGlb from "../../fixtures/s3/rocket.glb?inline";

/*
 * Shared by MM93 / MM94: planet → rocket where the CAMERA does part of the morph.
 * A point cloud between very different silhouettes (sphere → tall cylinder) reads as a blob
 * (blind test B3). Seen along the rocket's axis, though, the rocket IS a circle — so choose the
 * view in which A and B already look alike, morph there, and let a camera move reveal the rest.
 */

export const MODELS: { a: PartMesh[]; b: PartMesh[] } | null = typeof window === "undefined" ? null : { a: await loadGlbParts(planetGlb), b: await loadGlbParts(rocketGlb) };

export const smooth = (x: number) => { const v = Math.max(0, Math.min(1, x)); return v * v * (3 - 2 * v); };
export const span = (t: number, a: number, b: number) => smooth((t - a) / (b - a));
export const mix = (a: number, b: number, k: number) => a + (b - a) * k;

export function yRange(parts: PartMesh[]) {
  let lo = Infinity, hi = -Infinity;
  for (const p of parts) for (let i = 1; i < p.positions.length; i += 3) { lo = Math.min(lo, p.positions[i]); hi = Math.max(hi, p.positions[i]); }
  return [lo, hi] as const;
}

/**
 * A procedural exhaust plume, a scene-side part the model doesn't have: a flat, puffy pancake
 * of hot gas around the nozzle. Two rings of flattened puffs plus a core, under the fins.
 * It gives a sphere a flat in-between: sphere → pancake (same circle seen from above) → column.
 */
export function plumeMesh(name = "plume", y = -1.42): PartMesh {
  const puffs: Array<[number, number, number, number]> = [[0, y + 0.02, 0, 0.5]];
  let s = 11;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (const [count, radius, size] of [[9, 0.66, 0.36], [13, 1.04, 0.27]] as const)
    for (let i = 0; i < count; i++) {
      const a = (i + 0.5 * r()) / count * Math.PI * 2, d = radius * (0.92 + 0.16 * r());
      puffs.push([Math.cos(a) * d, y + 0.06 * (r() - 0.5), Math.sin(a) * d, size * (0.85 + 0.3 * r())]);
    }
  const pos: number[] = [], idx: number[] = [];
  for (const [x, py, z, rad] of puffs) {
    const g = new SphereGeometry(rad, 18, 10), base = pos.length / 3, a = g.attributes.position.array;
    for (let i = 0; i < a.length; i += 3) pos.push(x + a[i], py + a[i + 1] * 0.42, z + a[i + 2]); // flattened
    for (const k of g.index!.array) idx.push(base + k);
  }
  const c = new Color("#efe2d0");
  return { name, positions: new Float32Array(pos), index: new Uint32Array(idx), color: [c.r, c.g, c.b] };
}

export interface Rig { scene: Scene; camera: PerspectiveCamera; morph: Morph3D; flame: Mesh; layer: ThreeLayer }

export function buildRig(mappings: Mapping3D[], release: (p: V3) => number, land: (p: V3) => number, swirl: number, extraB: PartMesh[] = []): Rig {
  if (!MODELS) throw new Error("3D scenes need a browser.");
  const morph = new Morph3D(MODELS.a, [...MODELS.b, ...extraB], { mappings, release, land, points: 36000, swirl, size: 0.032 });
  const scene = new Scene();
  scene.add(new HemisphereLight(new Color("#eaf2ff"), new Color("#3a4170"), 1.35));
  const key = new DirectionalLight(new Color("#fff4e0"), 2.4);
  key.position.set(3, 5, 4);
  // Fill from below as well: the camera visits the underside, which the key never reaches.
  const fill = new DirectionalLight(new Color("#b8c8ff"), 1.2);
  fill.position.set(-2, -5, 5);
  scene.add(key, fill, morph.group);
  const camera = new PerspectiveCamera(30, 16 / 9, 0.1, 60);
  return { scene, camera, morph, flame: morph.part("b", "flame"), layer: new ThreeLayer() };
}

/**
 * Orbit camera. elevation: radians, 0 = side view, −π/2 = straight up the axis from below.
 * Kept a few degrees off the pole so lookAt keeps a stable "up".
 */
export function orbit(camera: PerspectiveCamera, elevation: number, distance: number, target: [number, number, number]) {
  const e = Math.max(-1.48, Math.min(1.48, elevation));
  camera.position.set(target[0], target[1] + distance * Math.sin(e), target[2] + distance * Math.cos(e));
  camera.up.set(0, 1, 0);
  camera.lookAt(target[0], target[1], target[2]);
}

// Deterministic star field (design space 1280 × 720).
const STARS = (() => {
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: 170 }, () => ({ x: r() * 1280, y: r() * 720, z: 0.3 + 0.7 * r(), tw: r() * 6.28 }));
})();

/** Space backdrop. `drift` (px) scrolls the stars down; `streak` (0..1) stretches them into speed lines. */
export function backdrop(ctx: CanvasRenderingContext2D, t: number, drift: number, streak: number) {
  const g = ctx.createLinearGradient(0, 0, 0, 720);
  g.addColorStop(0, "#0b1024"); g.addColorStop(0.6, "#1c1d3d"); g.addColorStop(1, "#3a2b4c");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1280, 720);
  ctx.lineCap = "round";
  for (const s of STARS) {
    const y = (((s.y + drift * s.z) % 720) + 720) % 720;
    const a = 0.25 + 0.45 * s.z * (0.75 + 0.25 * Math.sin(t * 2 + s.tw));
    ctx.strokeStyle = `rgba(220,230,255,${a.toFixed(3)})`;
    ctx.lineWidth = 1.2 * s.z + 0.4;
    ctx.beginPath();
    ctx.moveTo(s.x, y);
    ctx.lineTo(s.x, y - 0.1 - 32 * streak * s.z * s.z);
    ctx.stroke();
  }
}

/** Flame flicker about its base (y = −0.9). `on` 0..1 eases it in; `boost` lengthens it at lift-off. Returns the y scale. */
export function flicker(flame: Mesh, t: number, on: number, boost: number): number {
  const sy = 1 + on * (0.18 * Math.sin(t * 31) + 0.1 * Math.sin(t * 53 + 1) + 0.35 * boost);
  const sx = 1 + on * 0.05 * Math.sin(t * 41);
  flame.scale.set(sx, sy, sx);
  flame.position.y = -0.9 * (1 - sy);
  return sy;
}

/** Additive exhaust glow at a model-space point, projected to the screen. */
export function glow(ctx: CanvasRenderingContext2D, rig: Rig, at: V3, radius: number, strength: number) {
  if (strength <= 0) return;
  rig.morph.group.updateMatrixWorld();
  rig.camera.updateMatrixWorld();
  const p = new Vector3(...at).applyMatrix4(rig.morph.group.matrixWorld).project(rig.camera);
  const x = (p.x + 1) / 2 * 1280, y = (1 - p.y) / 2 * 720;
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, `rgba(255,222,140,${(0.6 * strength).toFixed(3)})`);
  g.addColorStop(0.35, `rgba(255,150,50,${(0.32 * strength).toFixed(3)})`);
  g.addColorStop(1, "rgba(255,120,40,0)");
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = g;
  ctx.fillRect(x - radius, y - radius, 2 * radius, 2 * radius);
  ctx.restore();
}

export function render(ctx: CanvasRenderingContext2D, rig: Rig, u: number) {
  const ratio = Math.min(2, Math.hypot(ctx.getTransform().a, ctx.getTransform().b));
  rig.morph.update(u, 720 * ratio, rig.camera.fov);
  rig.layer.composite(ctx, rig.scene, rig.camera, { x: 0, y: 0, width: 1280, height: 720 });
}

export function hud(ctx: CanvasRenderingContext2D, t: number, label: string) {
  ctx.font = "600 13px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillStyle = "rgba(225,232,250,.6)";
  ctx.fillText(label, 48, 52);
  ctx.textAlign = "right";
  ctx.fillText(t.toFixed(2).padStart(5, "0") + " s", 1232, 52);
  ctx.textAlign = "left";
}
