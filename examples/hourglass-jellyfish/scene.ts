import { compose } from "../../packages/morph-engine/src/core/effects";
import { compileParts, multiply, type Affine, type Part, type Point } from "../../packages/morph-engine/src/core/parts";
import { mix, ramp, type MorphScene } from "../../packages/morph-engine/src/core/scene";
import { contourMorph } from "../../packages/morph-engine/src/effects/contour";
import { liquidPath, type LiquidMass } from "../../packages/morph-engine/src/effects/liquid";
import {
  makeParticleTracks, particleAt, samplePolygon, seededRandom,
  type ParticleEndpoint, type ParticleTrack,
} from "../../packages/morph-engine/src/effects/particles";

const duration = 6.6;
const width = 1280;
const height = 720;
const tau = Math.PI * 2;
const glassCenter: Point = [425, 337];
const jellyCenter: Point = [770, 307];

const timeline = compose(
  () => ({ open: 0, recede: 0, bell: 0, arms: 0, swim: 0 }),
  [
    { from: .58, to: 2.43, effect: { id: "open", apply: (state, f) => ({ ...state, open: ramp(f.progress, 0, 1) }) } },
    { from: 2.31, to: 6.56, effect: { id: "recede", apply: (state, f) => ({ ...state, recede: ramp(f.progress, 0, 1) }) } },
    { from: 2.42, to: 4.17, effect: { id: "bell", apply: (state, f) => ({ ...state, bell: ramp(f.progress, 0, 1) }) } },
    { from: 3.06, to: 4.30, effect: { id: "arms", apply: (state, f) => ({ ...state, arms: ramp(f.progress, 0, 1) }) } },
    { from: 4.04, to: duration, effect: { id: "swim", apply: (state, f) => ({ ...state, swim: f.progress }) } },
  ],
);

function pose(x: number, y: number, angle = 0, sx = 1, sy = sx): Affine {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [c * sx, s * sx, -s * sy, c * sy, x, y];
}

function apply([a, b, c, d, x, y]: Affine, [u, v]: Point): Point {
  return [a * u + c * v + x, b * u + d * v + y];
}

function hourglassTransform(time: number) {
  const { recede } = timeline(time);
  return pose(
    glassCenter[0] - 157 * recede,
    glassCenter[1] + Math.sin(time * 1.55) * 8 + recede * 39,
    -.13 + Math.sin(time * .76) * .09 - recede * .10,
    1.08 - .50 * recede,
  );
}

function chamberTransform(time: number, upper: boolean) {
  const { open, recede } = timeline(time);
  const direction = upper ? -1 : 1;
  return pose(direction * 28 * open - 36 * recede, direction * (42 * open + 36 * recede), direction * .31 * open, 1, -direction);
}

function jellyTransform(time: number) {
  const { swim } = timeline(time);
  const stroke = (1 - Math.cos(swim * tau * 1.68)) / 2;
  const advance = swim + .023 * Math.sin(swim * tau * 1.68);
  return pose(
    jellyCenter[0] + 245 * advance,
    jellyCenter[1] - 109 * advance + 4 * stroke,
    .02 + .42 * ramp(swim, 0, .55) + .07 * stroke,
    (1 + .08 * swim) * (1 - .19 * stroke),
    (1 + .08 * swim) * (1 + .11 * stroke),
  );
}

const crownContour = contourMorph([{
  from: "M-53 8 C-42 -7 -16 -12 2 -12 C25 -12 44 -7 54 7 C39 18 20 15 0 16 C-21 17 -42 18 -53 8 Z",
  to: "M-103 3 C-106 -30 -84 -63 -54 -77 C-25 -92 25 -92 54 -77 C84 -63 106 -30 103 3 C94 15 80 22 65 18 C50 14 33 24 16 20 C0 16 -11 24 -30 20 C-49 14 -66 23 -84 17 C-93 15 -100 9 -103 3 Z",
}], 3);

const crownPolygon: Point[] = [
  [-101, 3], [-97, -22], [-81, -50], [-54, -76], [-25, -85], [2, -89],
  [29, -84], [58, -75], [84, -48], [99, -20], [101, 5], [82, 15],
  [51, 17], [21, 19], [-5, 18], [-35, 18], [-68, 17], [-90, 12],
];
const roots = [-89, -70, -55, -36, -18, 6, 24, 43, 60, 77, 92];
const lengths = [103, 147, 170, 132, 198, 162, 181, 210, 153, 171, 107];

function tentaclePoint(index: number, u: number, time: number): Point {
  const { swim, bell } = timeline(time);
  const sway = Math.sin(u * 7.8 + index * .61 - time * 2.3) * (9 + index % 3 * 4) * u;
  const drag = (index % 3 - 1) * 13 * u - swim * (11 + (index % 4) * 4) * u;
  return [
    roots[index] * mix(.57, 1, bell) + sway + drag,
    10 + lengths[index] * u * mix(.55, 1, bell) - Math.sin(u * 7 + time * 1.6 + index) * 6 * u,
  ];
}

function oralPoint(side: number, u: number, time: number): Point {
  const { swim } = timeline(time);
  return [side * (15 + 13 * u) + Math.sin(u * 6 - time * 1.9 + side) * 12 * u - 18 * swim * u, 9 + u * 119];
}

function armsGeometry(time: number) {
  const { arms } = timeline(time);
  const masses: LiquidMass[] = [];
  for (const side of [-1, 1]) {
    for (let joint = 0; joint < 7; joint++) {
      const u = joint / 6;
      const [x, y] = oralPoint(side, u, time);
      const ready = ramp(arms, u * .43, .55 + u * .45);
      masses.push({
        x: x + side * (1 - ready) * (7 + 14 * u),
        y: y + (1 - ready) * 21 * u,
        radiusX: (27 - 17 * u) * mix(.38, 1, ready),
        radiusY: (24 - 7 * u) * mix(.45, 1, ready),
        strength: mix(.19, 1.05, ready),
      });
    }
  }
  return liquidPath(masses, { cellSize: 2, iso: .38 });
}

const sandSources: ParticleEndpoint[] = [
  ...samplePolygon([[-42, -102], [41, -105], [29, -74], [5, -34], [0, -22], [-24, -70]], 3.1, 112)
    .map((point) => ({ point, group: 0, order: -point[1] + point[0] * .24 })),
  ...samplePolygon([[-51, -120], [-35, -105], [-9, -96], [11, -91], [34, -107], [52, -120]], 2.7, 815)
    .map((point) => ({ point, group: 1, order: -point[1] + point[0] * .23 })),
];
const sandTargets: ParticleEndpoint[] = [
  ...samplePolygon(crownPolygon, 5.2, 721).map(point => ({
    point, group: 0, order: (point[0] + 105) * .0042 + (19 - point[1]) * .0017,
  })),
  ...[-1, 1].flatMap(side => Array.from({ length: 36 }, (_, index) => {
    const order = index / 35;
    return { point: oralPoint(side, order, 0), group: side === -1 ? 1 : 2, order };
  })),
  ...roots.flatMap((_, index) => Array.from({ length: 22 }, (_, grain) => {
    const order = (grain + 1) / 22;
    return { point: tentaclePoint(index, order, 0), group: index + 3, order };
  })),
];

function sourcePoint(source: ParticleEndpoint, time: number, funnel: number): Point {
  const upper = source.group === 0;
  const [x, y] = source.point;
  const chamber = multiply(hourglassTransform(time), chamberTransform(time, upper));
  return apply(chamber, [mix(x, x * .23, funnel), mix(y, -6, funnel)]);
}

function targetPoint(target: ParticleEndpoint, time: number): Point {
  const { bell } = timeline(time);
  if (target.group === 0) {
    return apply(jellyTransform(time), [target.point[0] * mix(.57, 1, bell), target.point[1] * mix(.18, 1, bell)]);
  }
  const p = target.group <= 2
    ? oralPoint(target.group === 1 ? -1 : 1, target.order, time)
    : tentaclePoint(target.group - 3, target.order, time);
  return apply(jellyTransform(time), p);
}

const transport = makeParticleTracks(sandSources, sandTargets, {
  seed: 2682,
  sourceFor: target => target.group === 0 ? 0 : 1,
  timing: (source, target) => ({
    depart: source.group === 0
      ? 1.28 + (source.order - 20) * .007 + target.order * .57
      : 1.76 + (source.order - 90) * .006 + target.order * .55 + (target.group % 3) * .12,
    arrive: target.group === 0 ? 2.47 + target.order * 1.31 : 3.18 + target.order * 1.13 + (target.group % 3) * .11,
    bend: target.group === 0 ? 73 : -67 - (target.group % 4) * 13,
  }),
}).map((track, index) => ({
  index,
  source: track.source,
  target: track.target,
  track: {
    ...track,
    source: { ...track.source, point: sourcePoint(track.source, track.depart, 1) },
    target: { ...track.target, point: targetPoint(track.target, track.arrive) },
    swirl: track.swirl * .28,
  },
}));

function sandAt(track: ParticleTrack, source: ParticleEndpoint, target: ParticleEndpoint, time: number) {
  const state = particleAt(track, time);
  if (state.state === "source") {
    const [x, y] = sourcePoint(source, time, ramp(time, track.depart - .52, track.depart));
    return { ...state, x, y };
  }
  const [tx, ty] = targetPoint(target, time);
  const progress = ramp(state.progress, 0, 1);
  return {
    ...state,
    x: state.x + (tx - track.target.point[0]) * progress,
    y: state.y + (ty - track.target.point[1]) * progress,
  };
}

const ambientRandom = seededRandom(10476);
const ambient = Array.from({ length: 168 }, () => ({
  x: ambientRandom() * width, y: ambientRandom() * height,
  size: .3 + ambientRandom() ** 3 * 2.3, depth: .2 + ambientRandom() * .8, phase: ambientRandom() * tau,
}));

function paintWater(ctx: CanvasRenderingContext2D, time: number) {
  const water = ctx.createLinearGradient(200, height, 840, 0);
  water.addColorStop(0, "#020a15");
  water.addColorStop(.58, "#041627");
  water.addColorStop(1, "#103549");
  ctx.fillStyle = water;
  ctx.fillRect(0, 0, width, height);

  const well = ctx.createRadialGradient(842, -31, 25, 746, 190, 640);
  well.addColorStop(0, "rgba(92, 187, 201, .43)");
  well.addColorStop(.35, "rgba(41, 118, 146, .15)");
  well.addColorStop(1, "rgba(25, 96, 132, 0)");
  ctx.fillStyle = well;
  ctx.fillRect(0, 0, width, height);

  for (let ray = 0; ray < 6; ray++) {
    const top = 752 + ray * 43 + 12 * Math.sin(time * .4 + ray * 1.3);
    const bottom = 133 + ray * 190;
    const light = ctx.createLinearGradient(top, -30, bottom, 684);
    light.addColorStop(0, "rgba(117, 211, 215, .085)");
    light.addColorStop(.58, "rgba(90, 194, 209, .022)");
    light.addColorStop(1, "rgba(68, 184, 204, 0)");
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.moveTo(top - 19, -10);
    ctx.lineTo(top + 17, -10);
    ctx.lineTo(bottom + 103, height);
    ctx.lineTo(bottom - 107, height);
    ctx.fill();
  }

  for (const mote of ambient) {
    const x = (mote.x + time * (2.3 + 8 * mote.depth)) % width;
    const y = mote.y + Math.sin(mote.phase + time * .55) * 7;
    const a = (.12 + .15 * mote.depth) * (.72 + .28 * Math.sin(mote.phase + time));
    ctx.fillStyle = 'rgba(139, 207, 212,' + a + ')';
    ctx.beginPath();
    ctx.arc(x, y, mote.size, 0, tau);
    ctx.fill();
  }
}

type Paint = (ctx: CanvasRenderingContext2D, shape: Path2D | null, time: number) => void;

function paintChamber(ctx: CanvasRenderingContext2D, _shape: Path2D | null, time: number) {
  ctx.globalAlpha *= 1 - .88 * timeline(time).recede;
  const glass = new Path2D("M-61 -126 C-59 -101 -49 -77 -24 -43 Q-9 -22 -6 -4 L6 -4 Q9 -22 24 -43 C49 -77 59 -101 61 -126 Z");
  const tint = ctx.createLinearGradient(-61, -85, 61, -85);
  tint.addColorStop(0, "rgba(120, 215, 213, .27)");
  tint.addColorStop(.15, "rgba(108, 177, 185, .055)");
  tint.addColorStop(.63, "rgba(101, 170, 176, .11)");
  tint.addColorStop(.85, "rgba(150, 233, 221, .32)");
  tint.addColorStop(1, "rgba(148, 232, 215, .09)");
  ctx.fillStyle = tint;
  ctx.fill(glass);
  ctx.strokeStyle = "rgba(150, 229, 221, .61)";
  ctx.lineWidth = 1.45;
  ctx.stroke(glass);
  ctx.strokeStyle = "rgba(199, 250, 221, .53)";
  ctx.lineWidth = 2.1;
  ctx.stroke(new Path2D("M49 -119 C45 -94 34 -70 23 -56 M-48 -112 Q-42 -90 -30 -74"));
  ctx.strokeStyle = "rgba(133, 235, 229, .33)";
  ctx.lineWidth = .8;
  ctx.stroke(new Path2D("M40 -118 C35 -87 15 -56 8 -37 M-54 -114 Q-47 -94 -41 -88"));

  const rod = ctx.createLinearGradient(-83, -115, 83, -42);
  rod.addColorStop(0, "#97684c");
  rod.addColorStop(.27, "#613e31");
  rod.addColorStop(.49, "#4d403a");
  rod.addColorStop(.75, "#b58855");
  rod.addColorStop(1, "#e3ae70");
  const struts = new Path2D("M-77 -136 C-78 -104 -74 -60 -51 -17 L-46 -8 M77 -136 C78 -104 74 -60 51 -17 L46 -8");
  ctx.strokeStyle = "#181921";
  ctx.lineWidth = 10;
  ctx.stroke(struts);
  ctx.strokeStyle = rod;
  ctx.lineWidth = 6;
  ctx.stroke(struts);
  ctx.strokeStyle = "rgba(242, 188, 119, .48)";
  ctx.lineWidth = 1;
  ctx.stroke(new Path2D("M-79 -134 Q-76 -51 -51 -13 M79 -133 Q78 -52 51 -13"));

  const copper = ctx.createLinearGradient(-79, -158, 75, -115);
  copper.addColorStop(0, "#55382f");
  copper.addColorStop(.22, "#a67147");
  copper.addColorStop(.42, "#815438");
  copper.addColorStop(.68, "#59443d");
  copper.addColorStop(.84, "#c68b52");
  copper.addColorStop(1, "#f4c381");
  const cap = new Path2D("M-82 -151 Q-74 -157 -59 -159 L58 -159 Q75 -158 83 -151 L83 -133 Q79 -125 65 -123 L-65 -123 Q-78 -125 -82 -133 Z");
  ctx.fillStyle = copper;
  ctx.fill(cap);
  ctx.strokeStyle = "rgba(239, 175, 111, .7)";
  ctx.lineWidth = 1.3;
  ctx.stroke(cap);
  ctx.strokeStyle = "#382920";
  ctx.lineWidth = 3.2;
  ctx.stroke(new Path2D("M-81 -144 Q-37 -136 0 -138 Q43 -136 82 -144 M-80 -132 Q-40 -125 0 -127 Q48 -125 82 -132"));
  ctx.strokeStyle = "rgba(246, 186, 119, .72)";
  ctx.lineWidth = .9;
  ctx.stroke(new Path2D("M-80 -146 Q-40 -139 0 -141 Q49 -139 82 -146 M-65 -155 Q-22 -151 26 -152 Q61 -152 73 -154"));
  for (let i = -5; i <= 5; i++) {
    const x = i * 12.9;
    const y = -136 - Math.abs(i / 5) ** 2 * 3.6;
    ctx.fillStyle = i % 3 === 0 ? "#ddb17b" : "#48382b";
    ctx.fillRect(x, y, 1.5, 4.1);
    ctx.fillStyle = "rgba(89, 145, 126, .52)";
    ctx.fillRect(x + Math.sin(i * 12.7) * 6, y - 16, 3.3, .9);
  }
  ctx.fillStyle = "#9a6a48";
  ctx.fill(new Path2D("M-9 -7 Q0 -10 9 -7 L8 -1 Q0 1 -8 -1 Z"));
}

function paintBell(ctx: CanvasRenderingContext2D, shape: Path2D | null, time: number) {
  const { bell } = timeline(time);
  ctx.globalAlpha *= ramp(bell, 0, .46);
  const tint = ctx.createLinearGradient(0, -90, 0, 22);
  tint.addColorStop(0, "rgba(134, 238, 224, .72)");
  tint.addColorStop(.21, "rgba(67, 173, 185, .64)");
  tint.addColorStop(.58, "rgba(20, 83, 115, .66)");
  tint.addColorStop(.85, "rgba(65, 180, 190, .54)");
  tint.addColorStop(1, "rgba(244, 197, 113, .78)");
  ctx.fillStyle = tint;
  ctx.shadowColor = "rgba(106, 220, 214, .64)";
  ctx.shadowBlur = 18;
  ctx.fill(shape!);
  ctx.shadowBlur = 0;

  ctx.save();
  ctx.clip(shape!);
  const internal = ctx.createRadialGradient(21, -35 * bell, 1, 15, -20 * bell, 83);
  internal.addColorStop(0, "rgba(192, 251, 228, .30)");
  internal.addColorStop(.5, "rgba(103, 206, 205, .13)");
  internal.addColorStop(1, "rgba(103, 206, 205, 0)");
  ctx.fillStyle = internal;
  ctx.fillRect(-110, -100, 220, 130);
  for (let rib = -5; rib <= 5; rib++) {
    const x = rib * 17 * mix(.55, 1, bell);
    ctx.beginPath();
    ctx.moveTo(x * .22, -84 * bell - 6);
    ctx.bezierCurveTo(x * 1.10, -60 * bell - 6, x * 1.18, -12 * bell, x, 19);
    ctx.strokeStyle = rib % 2 === 0 ? "rgba(181, 248, 224, .30)" : "rgba(89, 203, 206, .29)";
    ctx.lineWidth = rib === 0 ? 1.7 : 1.1;
    ctx.stroke();
  }
  ctx.restore();

  const edge = ctx.createLinearGradient(0, -86, 0, 23);
  edge.addColorStop(0, "#b9fbdf");
  edge.addColorStop(.50, "#61d1cf");
  edge.addColorStop(.84, "#6bc8bf");
  edge.addColorStop(1, "#ffe7a5");
  ctx.strokeStyle = edge;
  ctx.lineWidth = 2.1;
  ctx.stroke(shape!);
}

function paintArms(ctx: CanvasRenderingContext2D, shape: Path2D | null, time: number) {
  const arms = timeline(time).arms;
  ctx.globalAlpha *= .88 * ramp(arms, 0, .42);
  const tint = ctx.createLinearGradient(0, 7, 0, 151);
  tint.addColorStop(0, "rgba(235, 229, 161, .73)");
  tint.addColorStop(.22, "rgba(165, 239, 211, .63)");
  tint.addColorStop(.65, "rgba(59, 169, 186, .40)");
  tint.addColorStop(1, "rgba(89, 190, 195, .12)");
  ctx.fillStyle = tint;
  ctx.fill(shape!, "evenodd");
  ctx.lineWidth = .88;
  ctx.strokeStyle = tint;
  ctx.stroke(shape!);
}

function paintTentacles(ctx: CanvasRenderingContext2D, _shape: Path2D | null, time: number) {
  const ready = ramp(time, 3.2, 4.43);
  if (ready === 0) return;
  ctx.globalAlpha *= ready;
  for (let index = 0; index < roots.length; index++) {
    const filament = ctx.createLinearGradient(0, 9, 0, lengths[index] + 11);
    filament.addColorStop(0, "rgba(254, 222, 148, .75)");
    filament.addColorStop(.20, "rgba(167, 235, 203, .65)");
    filament.addColorStop(.75, "rgba(95, 197, 209, .47)");
    filament.addColorStop(1, "rgba(95, 197, 209, .02)");
    ctx.strokeStyle = filament;
    ctx.lineWidth = index % 3 === 1 ? 1.65 : .85;
    ctx.beginPath();
    ctx.moveTo(...tentaclePoint(index, 0, time));
    for (let step = 1; step <= 24; step++) ctx.lineTo(...tentaclePoint(index, step / 24 * ready, time));
    ctx.stroke();
  }
}

const parts = compileParts<Path2D | null, Paint>([
  { id: "hourglass", transform: hourglassTransform, geometry: () => null, material: () => () => {} },
  { id: "upper-chamber", parent: "hourglass", transform: time => chamberTransform(time, true), geometry: () => null, material: () => paintChamber, maySplit: true },
  { id: "lower-chamber", parent: "hourglass", transform: time => chamberTransform(time, false), geometry: () => null, material: () => paintChamber, maySplit: true },
  { id: "jellyfish", transform: jellyTransform, geometry: () => null, material: () => () => {} },
  { id: "tentacles", parent: "jellyfish", geometry: () => null, material: () => paintTentacles },
  { id: "oral-arms", parent: "jellyfish", geometry: time => timeline(time).arms ? armsGeometry(time) : null, material: () => paintArms, mayFuse: true },
  { id: "bell", parent: "jellyfish", geometry: time => timeline(time).bell ? new Path2D(crownContour(timeline(time).bell)[0]) : null, material: () => paintBell },
] satisfies Part<Path2D | null, Paint>[]);

function paintSand(ctx: CanvasRenderingContext2D, time: number) {
  for (const { track, source, target, index } of transport) {
    const p = sandAt(track, source, target, time);
    if (p.state === "transit" && index % 3 === 0) {
      const past = sandAt(track, source, target, time - .10);
      const middle = sandAt(track, source, target, time - .045);
      const alpha = .52 * Math.sin(Math.PI * p.progress);
      ctx.strokeStyle = source.group === 0 ? 'rgba(255, 206, 120,' + alpha + ')' : 'rgba(128, 221, 211,' + alpha + ')';
      ctx.lineWidth = track.size * .74;
      ctx.beginPath();
      ctx.moveTo(past.x, past.y);
      ctx.quadraticCurveTo(middle.x, middle.y, p.x, p.y);
      ctx.stroke();
    }

    const pulse = .7 + .3 * Math.sin(track.phase + time * 2.7);
    const arrival = p.state === "target" ? ramp(time, track.arrive, track.arrive + .50) : 0;
    const alpha = mix(mix(.54, .96, pulse), .19 + pulse * .27, arrival);
    const radius = track.size * (p.state === "source" ? .87 : mix(1.26, .77, arrival));
    ctx.fillStyle = source.group === 0 || p.state === "source"
      ? 'rgba(255, 205, 125,' + alpha + ')'
      : 'rgba(170, 250, 222,' + alpha + ')';
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, tau);
    ctx.fill();
  }
}

export const scene: MorphScene = {
  id: "hourglass-jellyfish",
  title: "潮汐漏刻",
  duration,
  draw(ctx, time) {
    paintWater(ctx, time);
    for (const part of parts(time)) {
      if ((part.id === "bell" || part.id === "oral-arms") && !part.geometry) continue;
      ctx.save();
      ctx.transform(...part.world);
      part.material(ctx, part.geometry, time);
      ctx.restore();
    }
    paintSand(ctx, time);
  },
};
