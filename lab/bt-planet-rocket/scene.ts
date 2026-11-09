import { Color, DirectionalLight, HemisphereLight, Mesh, PerspectiveCamera, Scene, Vector3 } from "three";
import { ramp, type MorphScene } from "../../packages/morph-engine/src/core/scene";
import { ThreeLayer } from "../../packages/morph-engine/src/renderers/three";
import { loadGlbParts, Morph3D, type Mapping3D } from "../../packages/morph-engine/src/renderers/morph3d";
import { noise3, type PartMesh, type V3 } from "../../packages/morph-engine/src/vector/cloud";
import planetGlb from "../../fixtures/s3/planet.glb?inline";
import rocketGlb from "../../fixtures/s3/rocket.glb?inline";

/*
 * MM92 — planet (globe, ring, moon) → rocket (nose, body, window, 3 fins, flame), as a point-cloud swirl.
 *
 * Cause: the planet spins up — the moon whips round its orbit — until it flings itself apart.
 * Change (layered):
 *   ring   → fin_a + fin_b + fin_c  [0.00, 0.58]  spread → spread: the flat band around the core breaks into three arcs that fall to the base.
 *   globe  → body + nose            [0.08, 0.84]  core → core: the planet's mass pours upward into the hull and is capped by the nose.
 *   moon   → window                 [0.42, 0.88]  the small round satellite flies in as one cloud and becomes the round porthole.
 *   born   → flame                  [0.80, 1.00]  ignition: a burst at the nozzle, only once the hull is closed.
 * Payoff: something only a rocket can do — the flame flickers and it lifts off, the stars streak past.
 */
export const MAPPINGS: Mapping3D[] = [
  { from: "ring", to: ["fin_a", "fin_b", "fin_c"], window: [0.0, 0.58], spread: 0.45 },
  { from: "globe", to: ["body", "nose"], window: [0.08, 0.84], spread: 0.42 },
  { from: "moon", to: "window", window: [0.42, 0.88], spread: 0.2, swirl: 0.25 },
  { from: [], to: "flame", bornFrom: "flame", window: [0.8, 1.0], spread: 0.5, swirl: 0.15 },
];

const MODELS: { a: PartMesh[]; b: PartMesh[] } | null = typeof window === "undefined" ? null : { a: await loadGlbParts(planetGlb), b: await loadGlbParts(rocketGlb) };

const yRange = (parts: PartMesh[]) => {
  let lo = Infinity, hi = -Infinity;
  for (const p of parts) for (let i = 1; i < p.positions.length; i += 3) { lo = Math.min(lo, p.positions[i]); hi = Math.max(hi, p.positions[i]); }
  return [lo, hi] as const;
};

const T = { cause: [0.2, 1.5] as const, morph: [1.5, 5.9] as const, lift: [6.1, 8.6] as const, end: 8.6 };
const smooth = (x: number) => { const v = Math.max(0, Math.min(1, x)); return v * v * (3 - 2 * v); };

// Deterministic star field (design space 1280 × 720).
const STARS = (() => {
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: 170 }, () => ({ x: r() * 1280, y: r() * 720, z: 0.3 + 0.7 * r(), tw: r() * 6.28 }));
})();

function build() {
  if (!MODELS) throw new Error("3D scenes need a browser.");
  const [a0, a1] = yRange(MODELS.a), [b0, b1] = yRange(MODELS.b);
  // The planet leaves from the bottom up and unwinds around its axis; the rocket is built from the base up.
  const release = (p: V3) => 0.55 * ((p[1] - a0) / (a1 - a0)) + 0.15 * ((Math.atan2(p[2], p[0]) + Math.PI) / (2 * Math.PI)) + 0.3 * noise3(p[0], p[1], p[2], 0.35, 1);
  const land = (p: V3) => 0.7 * ((p[1] - b0) / (b1 - b0)) + 0.3 * noise3(p[0], p[1], p[2], 0.35, 2);
  const morph = new Morph3D(MODELS.a, MODELS.b, { mappings: MAPPINGS, release, land, points: 36000, swirl: 0.55, size: 0.032 });
  const scene = new Scene();
  scene.add(new HemisphereLight(new Color("#eaf2ff"), new Color("#3a4170"), 1.35));
  const key = new DirectionalLight(new Color("#fff4e0"), 2.4);
  key.position.set(3, 5, 4);
  // A soft fill from the camera side and below, so the thin, flattened ring never goes black when it faces away from the key.
  const fill = new DirectionalLight(new Color("#b8c8ff"), 1.1);
  fill.position.set(-2, -1.5, 6);
  scene.add(key, fill, morph.group);
  const camera = new PerspectiveCamera(30, 16 / 9, 0.1, 60);
  camera.position.set(0, 0.5, 9.2);
  camera.lookAt(0, 0.2, 0);
  // The flame is the only mesh of the last (born) mapping; it is added after the window mesh and moon.
  const flame = morph.group.children.filter(c => c instanceof Mesh)[9] as Mesh;
  return { scene, camera, morph, flame, layer: new ThreeLayer() };
}

let built: ReturnType<typeof build> | null = null;

export const scene: MorphScene = {
  id: "bt-planet-rocket",
  title: "MM92 · 3D point cloud: planet → rocket (glTF parts)",
  duration: T.end,
  draw(ctx, t) {
    built ??= build();
    const { scene, camera, morph, flame, layer } = built;
    const lift = ramp(t, T.lift[0], T.lift[1]);
    const liftIn = Math.max(0, Math.min(1, (t - T.lift[0]) / (T.lift[1] - T.lift[0])));
    const climb = liftIn * liftIn; // accelerating
    const speed = 2 * liftIn; // d(climb)/du, for the star streaks

    // Space backdrop with stars that streak downward as the rocket climbs.
    const g = ctx.createLinearGradient(0, 0, 0, 720);
    g.addColorStop(0, "#0b1024"); g.addColorStop(0.6, "#1c1d3d"); g.addColorStop(1, "#3a2b4c");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1280, 720);
    const drift = 260 * climb * (T.lift[1] - T.lift[0]);
    ctx.lineCap = "round";
    for (const s of STARS) {
      const y = (((s.y + drift * s.z) % 720) + 720) % 720;
      const a = 0.25 + 0.45 * s.z * (0.75 + 0.25 * Math.sin(t * 2 + s.tw));
      ctx.strokeStyle = `rgba(220,230,255,${a.toFixed(3)})`;
      ctx.lineWidth = 1.2 * s.z + 0.4;
      ctx.beginPath();
      ctx.moveTo(s.x, y);
      ctx.lineTo(s.x, y - 0.1 - 16 * speed * s.z * s.z * lift); // short streaks: speed, not rain
      ctx.stroke();
    }

    const u = Math.max(0, Math.min(1, (t - T.morph[0]) / (T.morph[1] - T.morph[0])));
    // Cause: one extra spin whose speed peaks as the planet starts to come apart, then settles,
    // ending face-on (window towards the camera).
    // Starts where the ring is seen open (not edge-on, where only its dark rim shows); one extra turn, ends face-on.
    const spin = 3 * Math.PI * smooth((t - T.cause[0]) / (2 * (T.morph[0] - T.cause[0])));
    morph.group.rotation.y = Math.PI + 0.6 - 0.6 * Math.min(1, t / T.lift[0]) + spin;
    morph.group.rotation.z = 0.06 * (1 - smooth((t - T.morph[0]) / 2.5)); // the planet's tilt straightens into a vertical rocket
    // Payoff: rumble then climb.
    const rumble = Math.min(1, Math.max(0, (t - T.morph[1]) / 0.4)) * (1 - 0.6 * lift);
    morph.group.position.set(0.012 * rumble * Math.sin(t * 83), -0.15 + 0.008 * rumble * Math.cos(t * 67) + 0.75 * climb, 0);
    camera.position.y = 0.5 + 0.25 * climb;
    camera.lookAt(0, 0.2 + 0.3 * climb, 0);

    // Flame flicker after the morph, scaled about the flame's base (y = -0.9), easing in from rest.
    const fl = Math.min(1, Math.max(0, (t - T.morph[1]) / 0.5));
    const sy = 1 + fl * (0.18 * Math.sin(t * 31) + 0.1 * Math.sin(t * 53 + 1) + 0.35 * lift);
    flame.scale.set(1 + fl * 0.05 * Math.sin(t * 41), sy, 1 + fl * 0.05 * Math.sin(t * 41));
    flame.position.y = -0.9 * (1 - sy);

    const ratio = Math.min(2, Math.hypot(ctx.getTransform().a, ctx.getTransform().b));
    morph.update(u, 720 * ratio, camera.fov);
    layer.composite(ctx, scene, camera, { x: 0, y: 0, width: 1280, height: 720 });

    // Exhaust glow at the nozzle, only once the flame exists.
    if (fl > 0) {
      morph.group.updateMatrixWorld();
      camera.updateMatrixWorld();
      const tip = new Vector3(0, -1.5 - 0.6 * (sy - 1), 0).applyMatrix4(morph.group.matrixWorld).project(camera);
      const x = (tip.x + 1) / 2 * 1280, y = (1 - tip.y) / 2 * 720;
      const r = (50 + 70 * lift) * (0.9 + 0.1 * Math.sin(t * 37));
      const glow = ctx.createRadialGradient(x, y, 0, x, y, r);
      glow.addColorStop(0, `rgba(255,214,120,${(0.55 * fl).toFixed(3)})`);
      glow.addColorStop(0.35, `rgba(255,150,50,${(0.3 * fl).toFixed(3)})`);
      glow.addColorStop(1, "rgba(255,120,40,0)");
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = glow;
      ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
      ctx.restore();
    }

    ctx.font = "600 13px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = "rgba(225,232,250,.6)";
    ctx.fillText("MORPH MASTER · 3D · PLANET → ROCKET (" + morph.pointCount + " points, glTF parts)", 48, 52);
    ctx.textAlign = "right";
    ctx.fillText(t.toFixed(2).padStart(5, "0") + " s", 1232, 52);
    ctx.textAlign = "left";
  },
};
