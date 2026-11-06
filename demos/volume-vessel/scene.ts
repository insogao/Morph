import {
  BufferAttribute, BufferGeometry, Color, CylinderGeometry, DirectionalLight, DynamicDrawUsage,
  HemisphereLight, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, PerspectiveCamera, Scene,
  Vector3,
} from "three";
import { clamp01, mix, ramp } from "../../packages/morph-engine/src/core/scene";
import { ThreeLayer } from "../../packages/morph-engine/src/renderers/three";
import { seededRandom } from "../../packages/morph-engine/src/effects/particles";

type Section = readonly [radius: number, height: number];
type Knot = readonly [position: number, radius: number, height: number];

const duration = 7.4;
const bounds = { x: 283, y: 43, width: 956, height: 630 };
const azimuths = 112;
const outsideRings = 80;
const lipRings = 9;
const insideRings = 62;
const ringCount = outsideRings + lipRings + insideRings + 1;
const sphereRadius = 1.19;
const base = -1.31;
const degrees = Math.PI / 180;
const tau = Math.PI * 2;
const profile: readonly Knot[] = [
  [0, 0, base], [.045, .42, base], [.083, .59, -1.29], [.135, .62, -1.18],
  [.198, .76, -.99], [.288, 1.008, -.74], [.391, 1.166, -.42], [.5, 1.17, -.03],
  [.59, 1.02, .34], [.675, .82, .65], [.748, .636, .89], [.815, .552, 1.15],
  [.884, .568, 1.40], [.932, .692, 1.56], [.971, .804, 1.71], [1, .806, 1.77],
];

interface Form {
  lift: number;
  mouth: number;
  depth: number;
  squash: number;
  glaze: number;
  turn: number;
}

function formAt(time: number): Form {
  return {
    lift: ramp(time, .87, 4.36),
    mouth: ramp(time, 2.12, 4.5),
    depth: ramp(time, 2.56, 4.83),
    squash: Math.sin(Math.PI * ramp(time, .35, 1.51)),
    glaze: ramp(time, 3.42, 5.67),
    turn: -.22 + time * .27,
  };
}

function slope(k: number, column: 1 | 2) {
  const p = profile[k];
  if (k === 0) return (profile[1][column] - p[column]) / (profile[1][0] - p[0]);
  if (k === profile.length - 1) {
    const previous = profile[k - 1];
    return (p[column] - previous[column]) / (p[0] - previous[0]);
  }
  const a = profile[k - 1];
  const b = profile[k + 1];
  const left = (p[column] - a[column]) / (p[0] - a[0]);
  const right = (b[column] - p[column]) / (b[0] - p[0]);
  if (left * right <= 0) return 0;
  return (2 * left * right) / (left + right);
}

function glazedMeridian(t: number): Section {
  const upper = profile.findIndex(([at]) => at > t);
  const segment = upper < 0 ? profile.length - 2 : Math.max(0, upper - 1);
  const a = profile[segment];
  const b = profile[segment + 1];
  const step = b[0] - a[0];
  const u = (t - a[0]) / step;
  const aa = (1 + 2 * u) * (1 - u) ** 2;
  const bb = u * (1 - u) ** 2;
  const cc = u ** 2 * (3 - 2 * u);
  const dd = u ** 2 * (u - 1);
  const value = (column: 1 | 2) => aa * a[column] + bb * slope(segment, column) * step +
    cc * b[column] + dd * slope(segment + 1, column) * step;
  return [value(1), value(2)];
}

const outsideProfile = Array.from({ length: outsideRings + 1 }, (_, ring) => glazedMeridian(ring / outsideRings));

function outerAt(t: number, state: Form, target = glazedMeridian(t)): Section {
  const radius = sphereRadius * Math.sin(Math.PI * t) * (1 + .165 * state.squash);
  const height = base + sphereRadius * (1 - Math.cos(Math.PI * t)) * (1 - .147 * state.squash);
  const pinch = 1 - (1 - state.mouth) * ramp(t, .78, 1);
  return [mix(radius, target[0] * pinch, state.lift), mix(height, target[1], state.lift)];
}

function meridian(state: Form): Section[] {
  const outer = outsideProfile.map((target, ring) => outerAt(ring / outsideRings, state, target));
  const [crownRadius, crownHeight] = outer[outsideRings];
  const wall = .105 * state.mouth * state.lift;
  const lip = Array.from({ length: lipRings }, (_, ring): Section => {
    const t = (ring + 1) / lipRings;
    return [Math.max(0, crownRadius - wall * t), crownHeight + wall * .47 * Math.sin(Math.PI * t)];
  });
  const inside = Array.from({ length: insideRings }, (_, ring): Section => {
    const t = (ring + 1) / insideRings;
    const excavation = state.depth * .918 * t;
    const [radius, y] = outerAt(1 - excavation, state);
    const bottomCurve = 1 - ramp(t, .89, 1);
    return [Math.max(0, radius - wall) * bottomCurve, y - wall * .46 * (1 - bottomCurve)];
  });
  return [...outer, ...lip, ...inside];
}

const amber = new Color("#b96e37");
const hotAmber = new Color("#efab63");
const coal = new Color("#513b32");
const jade = new Color("#6bb49b");
const moss = new Color("#477066");
const glazeEdge = new Color("#d3bd83");
const jadeInside = new Color("#426d68");
const gilding = new Color("#d0a470");

function geometry() {
  const indices: number[] = [];
  for (let ring = 0; ring < ringCount - 1; ring++) {
    for (let sector = 0; sector < azimuths; sector++) {
      const a = ring * azimuths + sector;
      const b = a + azimuths;
      const c = ring * azimuths + (sector + 1) % azimuths;
      indices.push(a, b, c, b, c + azimuths, c);
    }
  }
  const mesh = new BufferGeometry();
  mesh.setIndex(indices);
  for (const name of ["position", "color"]) {
    mesh.setAttribute(name, new BufferAttribute(new Float32Array(ringCount * azimuths * 3), 3).setUsage(DynamicDrawUsage));
  }
  return mesh;
}

const liveColor = new Color();
const bakedColor = new Color();
const sectors = Array.from({ length: azimuths }, (_, i) => {
  const phi = i * tau / azimuths;
  return { phi, cos: Math.cos(phi), sin: Math.sin(phi) };
});

function updateMesh(mesh: BufferGeometry, section: readonly Section[], state: Form, time: number) {
  const position = mesh.getAttribute("position");
  const color = mesh.getAttribute("color");
  for (let ring = 0; ring < section.length; ring++) {
    const [radius, y] = section[ring];
    const u = ring / outsideRings;
    const cavity = clamp01((ring - outsideRings - lipRings) / insideRings);
    const inside = ring > outsideRings + lipRings;
    const lip = ring > outsideRings && !inside;
    const foot = 1 - ramp(u, .057, .16);
    const thrown = Math.sin(y * 52.3 + .35 * Math.sin(y * 9.7));
    for (let sector = 0; sector < azimuths; sector++) {
      const { phi, cos, sin } = sectors[sector];
      const warp = Math.sin(phi * 4 + y * 2.9 + Math.sin(time * 1.2) * .18);
      const waviness = Math.sin(phi * 3 - u * 18) * .012 + Math.sin(phi * 7 + u * 41) * .003;
      const irregular = 1 + .024 * warp * state.lift + thrown * .005 * state.lift + waviness * (1 - state.lift);
      const p = ring * azimuths + sector;
      const rimTilt = .035 * Math.cos(phi * 2 + .36) * state.mouth * ramp(y, 1.16, 1.78);
      position.setXYZ(p, radius * cos * irregular, y + rimTilt * Math.min(1, radius * 5), radius * sin * irregular);

      const warmPattern = .34 + .22 * Math.sin(u * 9 + phi * 3) + .055 * Math.sin(u * 69 - phi * 4);
      liveColor.lerpColors(amber, hotAmber, warmPattern).lerp(coal, .53 * foot);
      const glazeReach = state.glaze * 1.26 - .08;
      const drip = Math.cos(phi * 5 + .64) * .041 + Math.cos(phi * 11) * .018;
      const dye = ramp(glazeReach, u + drip - .075, u + drip + .035);
      const stripes = Math.pow(Math.max(0, Math.cos(y * 44 + phi * 2.3)), 5) * .16 +
        .10 * Math.sin(y * 14 + phi * 5);
      bakedColor.lerpColors(jade, moss, clamp01(.39 + stripes + .14 * warp));
      bakedColor.lerp(glazeEdge, .67 * ramp(u, .86, 1) * Math.max(0, warp));
      bakedColor.lerp(coal, foot * .81);
      liveColor.lerp(bakedColor, dye);
      if (inside) liveColor.lerp(jadeInside, state.glaze).multiplyScalar(1 - .66 * cavity ** 1.2);
      if (lip) liveColor.lerp(gilding, state.glaze * .74);
      color.setXYZ(p, liveColor.r, liveColor.g, liveColor.b);
    }
  }
  position.needsUpdate = true;
  color.needsUpdate = true;
  mesh.computeVertexNormals();
}

interface Studio {
  layer: ThreeLayer;
  camera: PerspectiveCamera;
  scene: Scene;
  object: Mesh<BufferGeometry, MeshPhysicalMaterial>;
  dispose(): void;
}

function createStudio(): Studio {
  const layer = new ThreeLayer();
  const scene = new Scene();
  const camera = new PerspectiveCamera(32, bounds.width / bounds.height, .1, 40);
  const mesh = geometry();
  const clay = new MeshPhysicalMaterial({
    vertexColors: true, roughness: .43, metalness: .06, clearcoat: .28, clearcoatRoughness: .24,
  });
  const object = new Mesh(mesh, clay);
  object.frustumCulled = false;
  scene.add(object);

  const disk = new CylinderGeometry(1.51, 1.63, .13, 100);
  const obsidian = new MeshStandardMaterial({ color: "#37282b", roughness: .49, metalness: .25 });
  const stand = new Mesh(disk, obsidian);
  stand.position.y = base - .065;
  scene.add(stand);
  const diskRim = new CylinderGeometry(1.63, 1.57, .034, 100);
  const darkCopper = new MeshStandardMaterial({ color: "#7c5444", roughness: .41, metalness: .38 });
  const foot = new Mesh(diskRim, darkCopper);
  foot.position.y = base - .145;
  scene.add(foot);

  const hemisphere = new HemisphereLight("#fff2d5", "#4a1c23", 1.7);
  scene.add(hemisphere);
  const lamp = (color: string, intensity: number, x: number, y: number, z: number) => {
    const light = new DirectionalLight(color, intensity);
    light.position.set(x, y, z);
    scene.add(light);
  };
  lamp("#ffe2b8", 3.2, -3, 6, 4);
  lamp("#b1dbd6", 2.35, 3, 3, -4);
  lamp("#eb9369", 1.04, 4, -1, 5);

  return {
    layer, camera, scene, object,
    dispose() {
      mesh.dispose();
      clay.dispose();
      disk.dispose();
      diskRim.dispose();
      obsidian.dispose();
      darkCopper.dispose();
      layer.dispose();
    },
  };
}

let studio: Studio | undefined;
function ensureStudio() {
  if (studio) return studio;
  studio = createStudio();
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) {
      studio?.dispose();
      studio = undefined;
    }
  });
  return studio;
}

const grainRandom = seededRandom(4226);
const grain = Array.from({ length: 1450 }, () =>
  [grainRandom() * 1280, grainRandom() * 720, .28 + grainRandom() * 1.2] as const);

function gallery(ctx: CanvasRenderingContext2D) {
  const backdrop = ctx.createRadialGradient(805, 309, 31, 765, 329, 765);
  backdrop.addColorStop(0, "#563836");
  backdrop.addColorStop(.46, "#2a2025");
  backdrop.addColorStop(1, "#18151d");
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, 1280, 720);
  ctx.fillStyle = "#f6dfb215";
  for (const [x, y, radius] of grain) ctx.fillRect(x, y, radius, radius);
  ctx.strokeStyle = "#dcba8b4a";
  ctx.lineWidth = 1;
  ctx.strokeRect(42.5, 38.5, 1195, 643);
  ctx.strokeStyle = "#d4ac7a2d";
  ctx.beginPath();
  ctx.moveTo(323.5, 66);
  ctx.lineTo(323.5, 654);
  ctx.stroke();

  ctx.save();
  ctx.translate(756, 519);
  ctx.scale(2.3, .37);
  const shadow = ctx.createRadialGradient(0, 0, 27, 0, 0, 134);
  shadow.addColorStop(0, "#0c0a12ab");
  shadow.addColorStop(1, "#0c0a1200");
  ctx.fillStyle = shadow;
  ctx.fillRect(-134, -134, 268, 268);
  ctx.restore();

  ctx.font = "12px ui-monospace, monospace";
  ctx.fillStyle = "#d6ad86";
  ctx.fillText("ATELIER MORPH  /  04", 72, 91);
  ctx.fillStyle = "#ffe2bc";
  ctx.font = "42px Georgia, serif";
  ctx.fillText("From solid", 68, 159);
  ctx.fillText("to hollow.", 68, 208);
  ctx.font = "11px ui-monospace, monospace";
  ctx.fillStyle = "#bcaa99";
  ctx.fillText("THROWN FORM   ·   CELADON", 73, 252);
  ctx.textAlign = "right";
  ctx.fillText("VOLUME STUDY    /    04", 1207, 640);
  ctx.textAlign = "left";
}

function drawDiagram(ctx: CanvasRenderingContext2D, profilePoints: readonly Section[], state: Form, time: number) {
  const left = 72;
  const right = 288;
  const top = 326;
  const bottom = 559;
  ctx.strokeStyle = "#d4ac7a38";
  ctx.strokeRect(left + .5, top + .5, right - left, bottom - top);
  ctx.setLineDash([2, 5]);
  ctx.beginPath();
  ctx.moveTo(181, 341);
  ctx.lineTo(181, 543);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineCap = "round";
  for (const sign of [-1, 1]) {
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = "#f3b988ba";
    ctx.beginPath();
    for (let ring = 0; ring < profilePoints.length; ring++) {
      const [r, y] = profilePoints[ring];
      const x = 181 + sign * r * 56;
      if (!ring) ctx.moveTo(x, 474 - y * 57);
      else ctx.lineTo(x, 474 - y * 57);
    }
    ctx.stroke();
  }
  ctx.font = "10px ui-monospace, monospace";
  ctx.fillStyle = "#bcaa99";
  ctx.fillText("LIVE MERIDIAN SECTION", left, top - 11);
  ctx.fillStyle = "#d3a482";
  ctx.fillText("RIM Ø   " + (profilePoints[outsideRings][0] * 2).toFixed(2), left, 586);
  ctx.fillText("CAVITY  " + Math.round(state.depth * 100).toString().padStart(3, " ") + "%", left, 606);
  ctx.fillStyle = "#8c766b";
  ctx.fillRect(left, 634, right - left, 1);
  ctx.fillStyle = "#e8b78c";
  ctx.fillRect(left, 633, (right - left) * time / duration, 3);
}

const focus = new Vector3();

export const scene = {
  id: "volume-vessel",
  title: "From solid to hollow",
  duration,
  draw(context: CanvasRenderingContext2D, time: number) {
    const state = formAt(time);
    const section = meridian(state);
    const { layer, camera, scene, object } = ensureStudio();
    updateMesh(object.geometry, section, state, time);
    object.rotation.y = state.turn;
    object.material.roughness = mix(.46, .31, state.glaze);
    object.material.clearcoat = mix(.26, .55, state.glaze);
    const overview = ramp(time, 3.67, 6.92);
    const orbit = (14 + 41 * ramp(time, .65, duration)) * degrees;
    const distance = mix(8.05, 7.25, overview);
    camera.position.set(Math.sin(orbit) * distance, mix(1.92, 5.16, overview), Math.cos(orbit) * distance);
    camera.lookAt(focus.set(0, mix(-.16, .22, overview), 0));
    gallery(context);
    layer.composite(context, scene, camera, bounds);
    drawDiagram(context, section, state, time);
  },
};
