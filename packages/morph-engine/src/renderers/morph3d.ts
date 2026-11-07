import {
  BufferAttribute, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, NormalBlending,
  Points, ShaderMaterial, Vector3, type Material,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { meshArea, noise3, pairPools, rng, sampleSurface, vertexTimes, type PartMesh, type Sample, type V3 } from "../vector/cloud";

/**
 * 3D morph between two glTF models with named parts (the 3D analogue of SVG part ids).
 * Parts are remapped with the same contract as 2D (`vector/remap.ts`): every part has exactly one fate
 * — 1→1, split 1→N, merge N→1, born, vanish — each with its own time window.
 * Solid meshes hand off to GPU points LOCALLY through per-vertex times (see `vector/cloud.ts`).
 */

export async function loadGlbParts(url: string): Promise<PartMesh[]> {
  const buffer = await (await fetch(url)).arrayBuffer();
  const gltf = await new GLTFLoader().parseAsync(buffer, "");
  gltf.scene.updateMatrixWorld(true);
  const parts: PartMesh[] = [];
  gltf.scene.traverse(obj => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    const g = (mesh.geometry as BufferGeometry).clone().applyMatrix4(mesh.matrixWorld);
    const idx = g.index ? new Uint32Array(g.index.array) : Uint32Array.from({ length: g.attributes.position.count }, (_, i) => i);
    const c = ((mesh.material as MeshStandardMaterial).color ?? new Color(1, 1, 1));
    parts.push({ name: mesh.name || obj.parent?.name || "part" + parts.length, positions: new Float32Array(g.attributes.position.array), index: idx, color: [c.r, c.g, c.b] });
  });
  return parts;
}

export interface Mapping3D {
  from: string | string[];
  to: string | string[];
  window?: [number, number];
  /** Born parts start as a burst at this part's centre (default: the nearest mapped target). */
  bornFrom?: string;
  vanishTo?: string;
  /** Push this mapping's flight outward from the model centre (exploded-view look), in model units. */
  explode?: number;
  /** Fraction of the window over which departures (and arrivals) are spread. Small = the part moves as one cloud. Default 0.42. */
  spread?: number;
  /** Sideways swirl of individual points (fraction of travel). Default from the options. */
  swirl?: number;
  /**
   * "swirl" (default): parts dissolve in place and the points travel.
   * "exploded": the A part flies OUT as a solid (first 30% of its window), turns into points that reshape
   * out there, and the B part condenses and flies back IN as a solid (last 30%) — an exploded-view assembly.
   */
  style?: "swirl" | "exploded";
  /** This mapping's own release / land fields (default: the morph's). E.g. a plume that spreads radially while the rest grows by height. */
  release?: (p: V3) => number;
  land?: (p: V3) => number;
  /**
   * Born parts only: each point leaves its source this fraction of the morph before it lands, instead of all
   * bursting out at the window start. With one window + spread 1 + a height field, B GROWS as one front.
   */
  flight?: number;
}

export interface Morph3DOptions {
  mappings: Mapping3D[];
  /** 0..1 over A's surface: when each place leaves (inside its mapping window). */
  release?: (p: V3) => number;
  /** 0..1 over B's surface: when each place lands. */
  land?: (p: V3) => number;
  points?: number;
  swirl?: number;
  size?: number;
  seed?: number;
}

const list = (v: string | string[]) => Array.isArray(v) ? v : [v];
const centre = (m: PartMesh): V3 => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.positions.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], m.positions[i + k]); hi[k] = Math.max(hi[k], m.positions[i + k]); }
  return [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
};

/** Patch a standard material so fragments show only before (A) or after (B) their interpolated time. */
function dissolving(color: V3, side: "a" | "b", uniforms: { uT: { value: number } }, glow: number): Material {
  // Double-sided: where the shell has dissolved you see its lit inside, not dark back faces (which read as dirt).
  const m = new MeshStandardMaterial({ color: new Color(...color), roughness: 0.55, metalness: 0, side: DoubleSide });
  m.onBeforeCompile = shader => {
    shader.uniforms.uT = uniforms.uT;
    shader.vertexShader = "attribute float aTime;\nvarying float vTime;\n" + shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvTime = aTime;");
    // A glowing edge at the front (like embers), so freshly opened holes read as dissolving, not as dirt.
    // The glow must be narrower than the front itself, or a whole part flashes in one frame.
    const w = Math.max(1e-4, glow).toFixed(5);
    const edge = glow <= 0 ? "float edge = 0.0;" : side === "a" ? `float edge = 1.0 - clamp((vTime - uT) / ${w}, 0.0, 1.0);` : `float edge = 1.0 - clamp((uT - vTime) / ${w}, 0.0, 1.0);`;
    shader.fragmentShader = "uniform float uT;\nvarying float vTime;\n" + shader.fragmentShader
      .replace("void main() {", side === "a" ? "void main() {\n if (vTime <= uT) discard;" : "void main() {\n if (vTime > uT) discard;")
      .replace("#include <dithering_fragment>", "#include <dithering_fragment>\n " + edge + "\n if (uT > 0.0 && uT < 1.0) gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 0.86, 0.62), edge * edge * 0.85);");
  };
  m.customProgramCacheKey = () => "dissolve-" + side + "-" + glow.toFixed(5);
  return m;
}

const POINT_VERT = /* glsl */ `
attribute vec3 aTo; attribute vec3 aCtrl; attribute vec3 aColA; attribute vec3 aColB; attribute vec2 aTime;
uniform float uT; uniform float uSize; uniform float uScale;
varying vec3 vColor; varying float vGlow;
void main() {
  float raw = clamp((uT - aTime.x) / max(1e-4, aTime.y - aTime.x), 0.0, 1.0);
  float e = raw < 0.5 ? 2.0 * raw * raw : 1.0 - pow(-2.0 * raw + 2.0, 2.0) / 2.0;
  float q = 1.0 - e;
  vec3 p = q * q * position + 2.0 * q * e * aCtrl + e * e * aTo;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float live = step(0.0001, raw) * step(raw, 0.9999);
  vGlow = sin(3.14159 * raw);
  gl_PointSize = live * uSize * (1.0 + 0.7 * vGlow) * uScale / -mv.z;
  // A size-0 point can still rasterize as one pixel; move resting points outside the clip volume.
  if (live < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  vColor = mix(aColA, aColB, e);
}`;
const POINT_FRAG = /* glsl */ `
varying vec3 vColor; varying float vGlow;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c);
  if (r > 0.5) discard;
  float shade = 0.82 + 0.18 * (1.0 - r * 2.0);
  gl_FragColor = vec4(mix(vColor * shade, vec3(1.0), 0.18 * vGlow), smoothstep(0.5, 0.36, r));
  #include <colorspace_fragment>
}`;

export class Morph3D {
  readonly group = new Group();
  /** Solid parts that move rigidly in "exploded" mappings: offset(t) along `out`. */
  private movers: Array<{ mesh: Mesh; out: Vector3; w0: number; w1: number; side: "a" | "b" }> = [];
  private uniforms = { uT: { value: 0 }, uSize: { value: 0.03 }, uScale: { value: 600 } };
  readonly pointCount: number;
  private parts = new Map<string, Mesh>();

  /**
   * The solid mesh of one part, for per-part animation (a flame flicker, a moon orbit) while that part
   * is solid: A parts before they release, B parts after they land. Its points do not follow the mesh's
   * transform, so reset it to identity before the part dissolves / while it forms. Exploded parts are
   * positioned by the morph itself; don't animate those.
   */
  part(side: "a" | "b", name: string): Mesh {
    const mesh = this.parts.get(side + ":" + name);
    if (!mesh) throw new Error("No " + (side === "a" ? "source" : "target") + " part " + name + ". Parts: " + [...this.parts.keys()].join(", "));
    return mesh;
  }

  constructor(a: PartMesh[], b: PartMesh[], opts: Morph3DOptions) {
    const A = new Map(a.map(p => [p.name, p])), B = new Map(b.map(p => [p.name, p]));
    const seenA = new Set<string>(), seenB = new Set<string>();
    for (const m of opts.mappings) {
      for (const id of list(m.from)) { if (!A.has(id)) throw new Error("3D mapping: no source part '" + id + "'."); if (seenA.has(id)) throw new Error("Part mapped twice: " + id); seenA.add(id); }
      for (const id of list(m.to)) { if (!B.has(id)) throw new Error("3D mapping: no target part '" + id + "'."); if (seenB.has(id)) throw new Error("Part mapped twice: " + id); seenB.add(id); }
    }
    const missing = [...a.filter(p => !seenA.has(p.name)).map(p => "source " + p.name), ...b.filter(p => !seenB.has(p.name)).map(p => "target " + p.name)];
    if (missing.length) throw new Error("Every 3D part needs a fate. Unmapped: " + missing.join(", "));
    this.uniforms.uSize.value = opts.size ?? 0.03;

    const release = opts.release ?? ((p: V3) => noise3(p[0], p[1], p[2], 0.4, 1));
    const land = opts.land ?? ((p: V3) => noise3(p[0], p[1], p[2], 0.4, 2));
    const objCentre = centre({ name: "", index: new Uint32Array(), color: [0, 0, 0], positions: new Float32Array([...a, ...b].flatMap(p => Array.from(p.positions))) });
    const total = opts.points ?? 30000, swirl = opts.swirl ?? 0.6;
    const weight = (m: Mapping3D) => Math.max(list(m.from).reduce((s, id) => s + meshArea(A.get(id)!), 0), list(m.to).reduce((s, id) => s + meshArea(B.get(id)!), 0));
    const sumW = opts.mappings.reduce((s, m) => s + weight(m), 0);
    const from: number[] = [], to: number[] = [], ctrl: number[] = [], colA: number[] = [], colB: number[] = [], time: number[] = [];
    const r = rng(opts.seed ?? 3);

    opts.mappings.forEach((m, mi) => {
      const [w0, w1] = m.window ?? [0, 1], span = w1 - w0;
      const exploded = m.style === "exploded";
      const sp = m.spread ?? (exploded ? 0.12 : 0.42);
      // Exploded: dissolve after flying out (at 30%), condense before flying in (at 70%).
      const rel = m.release ?? release, lnd = m.land ?? land;
      const relT = (p: V3) => w0 + span * ((exploded ? 0.3 : 0) + sp * Math.max(0, Math.min(1, rel(p))));
      const landT = (p: V3) => w0 + span * ((exploded ? 0.7 - sp : 1 - sp) + sp * Math.max(0, Math.min(1, lnd(p))));
      // Outward direction of this mapping (horizontal from the model centre, slightly up), in model units.
      const ids = [...list(m.from).map(id => A.get(id)!), ...list(m.to).map(id => B.get(id)!)];
      const mc = ids.map(centre).reduce((s, c) => [s[0] + c[0] / ids.length, s[1] + c[1] / ids.length, s[2] + c[2] / ids.length] as V3, [0, 0, 0] as V3);
      const out = new Vector3(mc[0] - objCentre[0], 0, mc[2] - objCentre[2]);
      if (out.lengthSq() < 1e-4) out.set(Math.cos(mi * 2.4), 0, Math.sin(mi * 2.4));
      out.normalize().add(new Vector3(0, 0.25 * Math.sign(mc[1] - objCentre[1] || 1), 0)).normalize().multiplyScalar(m.explode ?? 0);
      // Meshes that dissolve (A) or condense (B) with the same per-vertex times their points use.
      const pool = (ids: string[], parts: Map<string, PartMesh>, side: "a" | "b", n: number): Sample[] => {
        const area = ids.reduce((s, id) => s + meshArea(parts.get(id)!), 0);
        return ids.flatMap((id, k) => {
          const part = parts.get(id)!, times = vertexTimes(part, side === "a" ? relT : landT);
          const geo = new BufferGeometry();
          geo.setAttribute("position", new BufferAttribute(part.positions, 3));
          geo.setIndex(new BufferAttribute(part.index, 1));
          geo.setAttribute("aTime", new BufferAttribute(times, 1));
          geo.computeVertexNormals();
          // Ember edge for slow dissolves only: a quarter of the front's own width; none for exploded parts.
          const mesh = new Mesh(geo, dissolving(part.color, side, this.uniforms, exploded ? 0 : Math.min(0.035, 0.25 * sp * span)));
          mesh.name = side + ":" + id;
          this.parts.set(mesh.name, mesh);
          this.group.add(mesh);
          if (exploded) this.movers.push({ mesh, out: out.clone(), w0, w1, side });
          return sampleSurface(part, times, Math.max(8, Math.round(n * meshArea(part) / Math.max(1e-9, area))), (opts.seed ?? 3) * 131 + mi * 17 + k + (side === "b" ? 7 : 0));
        });
      };
      const n = Math.max(32, Math.round(total * weight(m) / sumW));
      const fromIds = list(m.from), toIds = list(m.to);
      let pa: Sample[], pb: Sample[];
      if (toIds.length) pb = pool(toIds, B, "b", n); else pb = [];
      if (fromIds.length) pa = pool(fromIds, A, "a", n); else pa = [];
      // Born: a burst from a meaningful point. Vanish: everything gathers into one.
      const born = !pa.length;
      if (!pa.length) {
        const c = m.bornFrom ? centre((B.get(m.bornFrom) ?? A.get(m.bornFrom))!) : centre(B.get(toIds[0])!);
        pa = pb.map(() => ({ p: [c[0] + (r() - 0.5) * 0.06, c[1] + (r() - 0.5) * 0.06, c[2] + (r() - 0.5) * 0.06] as V3, time: w0 + span * 0.2 * r(), color: B.get(toIds[0])!.color }));
      }
      if (!pb.length) {
        const c = m.vanishTo ? centre((B.get(m.vanishTo) ?? A.get(m.vanishTo))!) : centre(A.get(fromIds[0])!);
        pb = pa.map(() => ({ p: [c[0], c[1], c[2]] as V3, time: w1 - span * 0.1 * r(), color: A.get(fromIds[0])!.color }));
      }
      for (const [i, j] of pairPools(pa, pb)) {
        const t0 = pb[j], s0 = born && m.flight ? { ...pa[i], time: Math.max(w0, t0.time - m.flight * (0.85 + 0.3 * r())) } : pa[i];
        // Exploded: points travel between the parts' OUT positions.
        const s = exploded ? { ...s0, p: [s0.p[0] + out.x, s0.p[1] + out.y, s0.p[2] + out.z] as V3 } : s0;
        const t = exploded ? { ...t0, p: [t0.p[0] + out.x, t0.p[1] + out.y, t0.p[2] + out.z] as V3 } : t0;
        const mid = new Vector3((s.p[0] + t.p[0]) / 2, (s.p[1] + t.p[1]) / 2, (s.p[2] + t.p[2]) / 2);
        const travel = new Vector3(t.p[0] - s.p[0], t.p[1] - s.p[1], t.p[2] - s.p[2]);
        const len = travel.length() || 1;
        const side = new Vector3().crossVectors(travel, new Vector3(0, 1, 0.3)).normalize().multiplyScalar((r() - 0.5) * 2 * (m.swirl ?? swirl) * len);
        const push = new Vector3(mid.x - objCentre[0], 0, mid.z - objCentre[2]);
        if (push.lengthSq() < 1e-6) push.set(r() - 0.5, 0, r() - 0.5);
        push.normalize().multiplyScalar(exploded ? 0 : m.explode ?? 0);
        const c = mid.add(side).add(push).add(new Vector3(0, (exploded ? 0.05 : 0.15) * len, 0));
        from.push(...s.p); to.push(...t.p); ctrl.push(c.x, c.y, c.z); colA.push(...s.color); colB.push(...t.color);
        time.push(s.time, Math.max(t.time, s.time + 0.08));
      }
    });
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(from, 3));
    geo.setAttribute("aTo", new Float32BufferAttribute(to, 3));
    geo.setAttribute("aCtrl", new Float32BufferAttribute(ctrl, 3));
    geo.setAttribute("aColA", new Float32BufferAttribute(colA, 3));
    geo.setAttribute("aColB", new Float32BufferAttribute(colB, 3));
    geo.setAttribute("aTime", new Float32BufferAttribute(time, 2));
    const points = new Points(geo, new ShaderMaterial({ uniforms: this.uniforms, vertexShader: POINT_VERT, fragmentShader: POINT_FRAG, transparent: true, depthWrite: false, blending: NormalBlending }));
    points.frustumCulled = false;
    this.group.add(points);
    this.pointCount = from.length / 3;
  }

  /** t: 0..1 over the whole morph; viewportHeight in device pixels; fov in degrees. */
  update(t: number, viewportHeight: number, fov: number) {
    this.uniforms.uT.value = t;
    const ease = (x: number) => { const v = Math.max(0, Math.min(1, x)); return v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2; };
    for (const { mesh, out, w0, w1, side } of this.movers) {
      const u = (t - w0) / (w1 - w0);
      const k = side === "a" ? ease(u / 0.3) : 1 - ease((u - 0.7) / 0.3);
      mesh.position.copy(out).multiplyScalar(k);
    }
    this.uniforms.uScale.value = viewportHeight / (2 * Math.tan((fov * Math.PI / 180) / 2));
  }
}
