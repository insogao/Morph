import {
  makeParticleTracks, particleAt, samplePolygon, seededRandom,
  type ParticleEndpoint, type ParticleTrack, type Point2,
} from "../../packages/morph-engine/src/effects/particles";

const width = 1280;
const height = 720;
const duration = 7.6;
const stemSettled = 4.84;
const liftOff = 5.54;
const flower: Point2 = [523, 313];
const butterfly: Point2 = [738, 360];
const coral = [245, 151, 115] as const;
const turquoise = [100, 226, 194] as const;
const gold = [255, 200, 129] as const;
const colors = ["#f5a882", "#f28e77", "#ef8b74", "#df7b79", "#dd7b86", "#ed9490", "#f7a78f", "#ffc09c"];
const petalCount = 8;

type Cubic = readonly [number, number, number, number, number, number];
type Outline = readonly [Point2, ...Cubic[]];

const petal: Outline = [[0, 4], [-22, -10, -64, -61, -55, -109],
  [-54, -146, -21, -177, 1, -165], [37, -179, 59, -143, 56, -105],
  [54, -57, 21, -11, 0, 4]];
const forewing: Outline = [[3, 30], [31, -38, 77, -126, 150, -154],
  [185, -169, 223, -167, 242, -149], [237, -94, 214, -57, 182, -32],
  [151, -8, 116, 12, 89, 22], [57, 37, 24, 43, 3, 30]];
const hindwing: Outline = [[3, 30], [41, 11, 93, -1, 142, 17],
  [168, 27, 181, 49, 169, 74], [161, 95, 142, 109, 139, 123],
  [139, 130, 148, 138, 147, 147], [137, 155, 130, 142, 124, 140],
  [115, 145, 109, 168, 96, 167], [87, 164, 91, 146, 87, 141],
  [64, 131, 32, 118, 21, 90], [9, 63, 1, 46, 3, 30]];

function outline(ctx: CanvasRenderingContext2D, shape: Outline) {
  ctx.beginPath();
  ctx.moveTo(...shape[0]);
  for (const segment of shape.slice(1) as Cubic[]) ctx.bezierCurveTo(...segment);
  ctx.closePath();
}

function polygon(shape: Outline): Point2[] {
  const points: Point2[] = [shape[0]];
  let [x, y] = shape[0];
  for (const [cx, cy, dx, dy, endX, endY] of shape.slice(1) as Cubic[]) {
    for (let i = 1; i <= 18; i++) {
      const t = i / 18;
      const u = 1 - t;
      points.push([
        u ** 3 * x + 3 * u * u * t * cx + 3 * u * t * t * dx + t ** 3 * endX,
        u ** 3 * y + 3 * u * u * t * cy + 3 * u * t * t * dy + t ** 3 * endY,
      ]);
    }
    x = endX;
    y = endY;
  }
  return points;
}

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
function ease(a: number, b: number, time: number) {
  const t = clamp((time - a) / (b - a));
  return t * t * (3 - 2 * t);
}
function pigment(a: readonly number[], b: readonly number[], t: number) {
  return `rgb(${a.map((value, i) => Math.round(mix(value, b[i], t))).join(",")})`;
}

function petalAngle(index: number, time: number) {
  return index * Math.PI / 4 - 0.15 + Math.sin(time * 1.45 + index * 0.72) * 0.03 *
    (1 - ease(0.58, 1.18, time));
}
const petalStarts = [1.26, 1.05, 1.42, 1.66, 1.86, 1.54, 1.22, 1.13];
function departure(index: number, radius: number) {
  return petalStarts[index] + (1 - radius) * 1.06;
}

const source: ParticleEndpoint[] = Array.from({ length: petalCount }, (_, index) => {
  const angle = petalAngle(index, 2);
  return samplePolygon(polygon(petal), 5.5, 183 + index).map(([x, y]) => ({
    point: [flower[0] + x * Math.cos(angle) - y * Math.sin(angle),
      flower[1] + x * Math.sin(angle) + y * Math.cos(angle)] as Point2,
    group: index,
    order: 1 - clamp(-y / 173),
  }));
}).flat();

const target: ParticleEndpoint[] = [forewing, hindwing].flatMap((shape, lower) =>
  [-1, 1].flatMap((sign, side) => samplePolygon(polygon(shape), lower ? 9.5 : 8.5, 522 + lower * 13 + side)
    .map(([x, y]) => ({
      point: [butterfly[0] + sign * x, butterfly[1] + y] as Point2,
      group: lower * 4 + side * 2 + Number(y > (lower ? 85 : -70)),
      order: (x + Math.abs(y) * 0.12) / 259,
    }))));

const sourceGroups = [7, 6, 0, 1, 5, 4, 2, 3];
const tracks = makeParticleTracks(source, target, {
  seed: 1277,
  sourceFor: (point) => sourceGroups[point.group],
  timing: (from, to) => {
    const depart = departure(from.group, 1 - from.order);
    const sign = to.point[0] < butterfly[0] ? -1 : 1;
    const arrive = Math.max(depart + 0.8, 3.5 + to.order * 1.48 + to.group * 0.061);
    return { depart, arrive, bend: (55 + from.group * 14) * sign };
  },
});

const staticRandom = seededRandom(1335);
const grain = Array.from({ length: 990 }, () => [
  staticRandom() * width, staticRandom() * height, 0.3 + staticRandom() * 1.24,
]);

function background(ctx: CanvasRenderingContext2D) {
  const field = ctx.createRadialGradient(636, 350, 65, 636, 350, 635);
  field.addColorStop(0, "#193c38");
  field.addColorStop(0.55, "#112b2b");
  field.addColorStop(1, "#0a161e");
  ctx.fillStyle = field;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#c4d9b716";
  for (const [x, y, radius] of grain) ctx.fillRect(x, y, radius, radius);

  ctx.save();
  ctx.strokeStyle = "#adc3aa33";
  ctx.lineWidth = 1;
  ctx.strokeRect(42.5, 38.5, 1195, 643);
  ctx.setLineDash([1, 9]);
  ctx.strokeStyle = "#a6c9aa48";
  ctx.beginPath();
  ctx.ellipse(652, 360, 527, 242, -0.15, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = "#b4c6ac24";
  for (const [x, y] of [[73, 77], [1207, 77], [73, 643], [1207, 643], [652, 116], [652, 604]]) {
    ctx.beginPath();
    ctx.moveTo(x - 6, y);
    ctx.lineTo(x + 6, y);
    ctx.moveTo(x, y - 6);
    ctx.lineTo(x, y + 6);
    ctx.stroke();
  }

  ctx.font = "12px ui-monospace, monospace";
  ctx.fillStyle = "#afc0a6";
  ctx.fillText("MORPHOLOGY  /  PLATE 03", 90, 105);
  ctx.fillStyle = "#9ba79b";
  ctx.fillText("HELLEBORE  →  SWALLOWTAIL", 90, 128);
  ctx.textAlign = "right";
  ctx.fillText("SPECIMEN  03-A / 03-B", 1190, 623);
  ctx.restore();
}

function stemPoint(u: number): Point2 {
  return [flower[0] - 73 * (1 - u) ** 2 + 28 * Math.sin(Math.PI * u), 600 - 287 * u];
}

function drawStem(ctx: CanvasRenderingContext2D, time: number) {
  if (time >= stemSettled) return;
  const k = ease(2.15, stemSettled, time);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (let i = 0; i <= 42; i++) {
    const u = i / 42;
    const [x, y] = stemPoint(u);
    const arc = Math.sin(k * Math.PI) * Math.sin(u * Math.PI) * 62;
    const px = mix(x, butterfly[0], k) + arc;
    const py = mix(y, butterfly[1] + 92 - 125 * u, k);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.strokeStyle = pigment([58, 111, 86], [122, 79, 60], k);
  ctx.lineWidth = mix(9, 10, k);
  ctx.stroke();
  ctx.strokeStyle = pigment([120, 171, 108], [235, 162, 109], k);
  ctx.lineWidth = mix(2.6, 2.2, k);
  ctx.stroke();

  // These foliar lobes fold into the narrowing stem before it becomes the abdomen.
  const leaf = (u: number, angle: number, size: number, start: number) => {
    const folded = 1 - ease(start, start + 0.84, time);
    if (folded === 0) return;
    const [x, y] = stemPoint(u);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle + (1 - folded) * 1.25);
    ctx.scale(folded, 0.24 + 0.76 * folded);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(size * 0.41, -53, size, -12);
    ctx.quadraticCurveTo(size * 0.71, 25, 0, 0);
    ctx.fillStyle = "#407a6f";
    ctx.fill();
    ctx.strokeStyle = "#87ae92";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(size * 0.47, -14, size, -12);
    ctx.stroke();
    ctx.restore();
  };
  leaf(0.23, -0.58, 114, 1.38);
  leaf(0.42, 3.56, 101, 1.66);
}

function drawPetals(ctx: CanvasRenderingContext2D, time: number) {
  for (let i = 0; i < petalCount; i++) {
    const remaining = clamp(1 - (time - petalStarts[i]) / 1.06);
    if (remaining === 0) continue;
    ctx.save();
    ctx.translate(...flower);
    ctx.rotate(petalAngle(i, time));
    const edge = -173 * remaining;
    ctx.beginPath();
    ctx.moveTo(-67, 14);
    ctx.lineTo(-67, edge + 1);
    for (let x = -67; x <= 67; x += 3) {
      const scallop = remaining === 1 ? 0 : 3 * Math.sin(x * 0.27 + time * 7 + i) + 1.8 * Math.cos(x * 0.57 - i);
      ctx.lineTo(x, edge + scallop);
    }
    ctx.lineTo(67, 14);
    ctx.closePath();
    ctx.clip();

    outline(ctx, petal);
    const wash = ctx.createLinearGradient(0, -164, -16, 10);
    wash.addColorStop(0, colors[i]);
    wash.addColorStop(0.45, i % 2 ? "#cf6475" : "#e47a7a");
    wash.addColorStop(0.86, "#75384f");
    wash.addColorStop(1, "#462739");
    ctx.fillStyle = wash;
    ctx.fill();
    ctx.strokeStyle = "#ffd4a95e";
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.save();
    ctx.clip();
    ctx.lineWidth = 0.8;
    for (let vein = -4; vein <= 4; vein++) {
      ctx.strokeStyle = vein % 2 ? "#6f314f60" : "#ffc2a96e";
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.quadraticCurveTo(vein * 13.5, -93, vein * 8.1, -155 + Math.abs(vein) * 9);
      ctx.stroke();
    }
    for (let pin = 0; pin < 16; pin++) {
      const phase = pin * 2.4 + i * 11;
      ctx.fillStyle = pin % 3 ? "#6b39556e" : "#ffd2ae75";
      ctx.beginPath();
      ctx.arc(Math.sin(phase) * (12 + pin * 1.2), -36 - pin * 5.8, 0.8 + pin % 3 * 0.32, 0, 2 * Math.PI);
      ctx.fill();
    }
    ctx.restore();
    ctx.restore();
  }

  const gather = ease(2.07, 3.37, time);
  const x = mix(flower[0], butterfly[0], gather);
  const y = mix(flower[1], butterfly[1] - 26, gather) - 58 * Math.sin(gather * Math.PI);
  const shrink = (1 - 0.6 * gather) * (1 - ease(stemSettled, 5.28, time));
  if (shrink > 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(shrink, shrink);
    ctx.fillStyle = "#442637";
    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, 2 * Math.PI);
    ctx.fill();
    for (let i = 0; i < 53; i++) {
      const r = Math.sqrt(i / 53) * 25;
      const angle = i * 2.39996;
      ctx.fillStyle = i % 3 ? "#f4be7f" : "#f2da9d";
      ctx.beginPath();
      ctx.ellipse(Math.cos(angle) * r, Math.sin(angle) * r, 2.25, 1.48, angle, 0, 2 * Math.PI);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawWing(ctx: CanvasRenderingContext2D, lower: boolean) {
  const shape = lower ? hindwing : forewing;
  outline(ctx, shape);
  const wash = ctx.createLinearGradient(12, 39, 218, lower ? 110 : -121);
  wash.addColorStop(0, "#e8b183");
  wash.addColorStop(0.21, lower ? "#e68178" : "#72cab0");
  wash.addColorStop(0.56, lower ? "#8fae91" : "#54c5af");
  wash.addColorStop(0.88, "#287b79");
  wash.addColorStop(1, "#163c48");
  ctx.fillStyle = wash;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = "#102f42";
  ctx.lineWidth = lower ? 21 : 25;
  ctx.stroke();

  const fans: Point2[] = lower
    ? [[78, 13], [146, 22], [174, 49], [165, 82], [138, 111], [132, 137], [96, 161], [59, 125], [26, 97]]
    : [[56, -87], [96, -124], [135, -150], [173, -157], [206, -159], [237, -142],
      [234, -104], [220, -67], [193, -38], [161, -13], [124, 9], [95, 24], [65, 35]];
  const root: Point2 = [10, 28];
  for (let i = 0; i < fans.length; i++) {
    const [x, y] = fans[i];
    ctx.strokeStyle = lower ? "#473e51a8" : "#163e51aa";
    ctx.lineWidth = i % 3 === 0 ? 2.2 : 1.25;
    ctx.beginPath();
    ctx.moveTo(...root);
    ctx.quadraticCurveTo(x * 0.49 + 5, y * 0.31 + (lower ? 16 : 2), x, y);
    ctx.stroke();
    ctx.strokeStyle = "#f9dfac4a";
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(root[0] + 4, root[1] - 1);
    ctx.quadraticCurveTo(x * 0.49 + 8, y * 0.31 + (lower ? 14 : 0), x + 1, y - 1);
    ctx.stroke();

    const nx = x * 0.82 + 9;
    const ny = y * 0.83 + 5;
    ctx.fillStyle = lower ? "#f5a281" : "#ffe1a0";
    ctx.beginPath();
    ctx.ellipse(nx, ny, i % 3 ? 3.1 : 4.4, 1.9, Math.atan2(y, x), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c1eee0";
    ctx.beginPath();
    ctx.arc(x * 0.93 + 3, y * 0.92 + 3, 1.65, 0, Math.PI * 2);
    ctx.fill();
  }

  if (lower) {
    for (const [x, y, scale] of [[100, 102, 1], [127, 80, 0.78], [140, 56, 0.52]]) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-0.38);
      ctx.scale(scale, scale);
      for (const [rx, ry, fill] of [[20, 13, "#10394a"], [15, 10, "#f3ab81"], [10, 6.5, "#357a7f"], [5, 3, "#bee3c7"]] as const) {
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  } else {
    ctx.strokeStyle = "#c0e8d880";
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(45, -26);
    ctx.bezierCurveTo(85, -100, 166, -145, 217, -137);
    ctx.stroke();
  }
  ctx.restore();
  outline(ctx, shape);
  ctx.strokeStyle = "#aad4bc";
  ctx.lineWidth = 1.15;
  ctx.stroke();
}

function paintBody(ctx: CanvasRenderingContext2D, fullness: number, amplitude: number, flapTime: number) {
  ctx.save();
  ctx.fillStyle = pigment([122, 79, 60], [138, 88, 78], fullness);
  ctx.beginPath();
  ctx.moveTo(0, 93);
  ctx.bezierCurveTo(-mix(5, 13, fullness), 91, -mix(5, 10, fullness), 23, -mix(5, 11, fullness), 12);
  ctx.bezierCurveTo(-mix(5, 20, fullness), -8, -mix(5, 13, fullness), -38, 0, -38);
  ctx.bezierCurveTo(mix(5, 13, fullness), -38, mix(5, 20, fullness), -8, mix(5, 11, fullness), 12);
  ctx.bezierCurveTo(mix(5, 10, fullness), 23, mix(5, 13, fullness), 91, 0, 93);
  ctx.fill();
  ctx.strokeStyle = "#f2b18a";
  ctx.lineWidth = 1.2 * fullness;
  if (fullness > 0) ctx.stroke();
  if (fullness < 1) {
    ctx.lineCap = "round";
    ctx.strokeStyle = "#eba26d";
    ctx.lineWidth = 2.2 * (1 - fullness);
    ctx.beginPath();
    ctx.moveTo(0, -33);
    ctx.lineTo(0, 91);
    ctx.stroke();
  }
  for (let i = 0; i < 7; i++) {
    const y = 18 + i * 8.6;
    const segment = (7.5 - i * 0.4) * fullness;
    ctx.beginPath();
    ctx.moveTo(-segment, y);
    ctx.quadraticCurveTo(0, y + 2 * fullness, segment, y);
    ctx.stroke();
  }
  const antenna = ease(0.28, 1, fullness);
  if (antenna > 0) {
    for (const side of [-1, 1]) {
      const sway = Math.sin(flapTime * 8 + side * 0.38) * 4 * amplitude;
      const at = (u: number): Point2 => [side * (7 * (1 - u) ** 2 + 26 * u * (1 - u) + 39 * u ** 2),
        -31 * (1 - u) ** 2 - 124 * u * (1 - u) + (-79 + sway) * u ** 2];
      ctx.beginPath();
      ctx.moveTo(...at(0));
      for (let i = 1; i <= 18; i++) ctx.lineTo(...at(i / 18 * antenna));
      ctx.stroke();
      ctx.fillStyle = "#f0bd95";
      ctx.beginPath();
      ctx.arc(...at(antenna), 2.9 * antenna, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function paintFlight(ctx: CanvasRenderingContext2D, time: number, local: boolean) {
  const lift = local ? ease(liftOff, duration, time) : 0;
  const flapTime = Math.max(0, time - liftOff);
  const amplitude = local ? ease(liftOff, 5.88, time) * (1 - 0.78 * ease(7.2, duration, time)) : 0;
  const wingSqueeze = (phase: number) => 1 - (0.42 + 0.37 * Math.sin(flapTime * 9 + phase)) * amplitude;
  ctx.save();
  ctx.translate(butterfly[0] - 109 * lift, butterfly[1] - 92 * lift + Math.sin(flapTime * 9) * 6 * amplitude);
  ctx.rotate(-0.13 * lift);
  ctx.scale(1 - 0.1 * lift, 1 - 0.1 * lift);
  for (const lower of [true, false]) {
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.scale(side * wingSqueeze(lower ? 0.29 : 0), 1);
      ctx.rotate(amplitude * (lower ? 0.025 : 0.05) * Math.sin(flapTime * 9 + (side > 0 ? 0.4 : 0)));
      drawWing(ctx, lower);
      ctx.restore();
    }
  }
  if (local) paintBody(ctx, 1, amplitude, flapTime);
  ctx.restore();
}

function drawParticles(ctx: CanvasRenderingContext2D, time: number) {
  const arriving: ParticleTrack[] = [];
  for (const track of tracks) {
    const pose = particleAt(track, time);
    if (pose.state === "source") continue;
    if (pose.state === "target") {
      arriving.push(track);
      continue;
    }
    const size = track.size * (1.3 + Math.sin(Math.PI * pose.progress) * 0.77);
    const color = pigment(track.source.group % 3 === 0 ? gold : coral,
      track.target.group % 4 === 3 ? coral : turquoise, pose.progress);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(pose.x, pose.y, size, 0, Math.PI * 2);
    ctx.fill();
    if (track.size > 1.26) {
      const prev = particleAt(track, time - 0.038);
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.75;
      ctx.globalAlpha = 0.31;
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(pose.x, pose.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  if (!arriving.length) return;

  // Settled grains open the pattern in a union of growing circular deposits.
  // The target contour never animates into view ahead of the grains that draw it.
  ctx.save();
  ctx.beginPath();
  for (const track of arriving) {
    const [x, y] = track.target.point;
    const size = mix(track.size * 1.12, 15.6, ease(track.arrive, track.arrive + 0.26, time));
    ctx.moveTo(x + size, y);
    ctx.arc(x, y, size, 0, Math.PI * 2);
  }
  ctx.clip();
  paintFlight(ctx, time, false);
  ctx.restore();
}

export const scene = {
  id: "flower-butterfly",
  title: "Papilio ex flora",
  duration,
  draw(ctx: CanvasRenderingContext2D, time: number) {
    background(ctx);
    if (time >= liftOff) {
      paintFlight(ctx, time, true);
      return;
    }
    drawStem(ctx, time);
    drawPetals(ctx, time);
    drawParticles(ctx, time);
    if (time >= stemSettled) {
      ctx.save();
      ctx.translate(...butterfly);
      paintBody(ctx, ease(stemSettled, liftOff, time), 0, 0);
      ctx.restore();
    }
  },
};
