export type Point2 = readonly [number, number];

export interface ParticleEndpoint {
  point: Point2;
  /** Semantic group such as a petal, wing or ribbon. */
  group: number;
  /** Relative arrival or departure order within the group. */
  order: number;
}

export interface ParticleTrack {
  source: ParticleEndpoint;
  target: ParticleEndpoint;
  depart: number;
  arrive: number;
  bend: number;
  swirl: number;
  size: number;
  phase: number;
}

export type ParticleState = "source" | "transit" | "target";

export interface ParticlePose {
  x: number;
  y: number;
  progress: number;
  state: ParticleState;
}

export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let n = Math.imul(state ^ (state >>> 15), 1 | state);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

function contains(polygon: readonly Point2[], x: number, y: number) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[j];
    if ((y1 > y) !== (y2 > y) && x < x1 + (x2 - x1) * (y - y1) / (y2 - y1)) {
      inside = !inside;
    }
  }
  return inside;
}

/** Grid sampling keeps the interior covered. Boundary samples prevent gaps along thin tips. */
export function samplePolygon(polygon: readonly Point2[], spacing: number, seed: number): Point2[] {
  if (polygon.length < 3 || !Number.isFinite(spacing) || spacing <= 0) {
    throw new RangeError("Sampling requires a polygon and positive, finite spacing");
  }
  const random = seededRandom(seed);
  const points: Point2[] = [];
  const xs = polygon.map(([x]) => x);
  const ys = polygon.map(([, y]) => y);
  for (let y = Math.min(...ys) + spacing / 2; y < Math.max(...ys); y += spacing) {
    for (let x = Math.min(...xs) + spacing / 2; x < Math.max(...xs); x += spacing) {
      const jitterX = x + (random() - 0.5) * spacing * 0.68;
      const jitterY = y + (random() - 0.5) * spacing * 0.68;
      if (contains(polygon, jitterX, jitterY)) points.push([jitterX, jitterY]);
    }
  }

  let untilSample = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [ax, ay] = polygon[i];
    const [bx, by] = polygon[(i + 1) % polygon.length];
    const length = Math.hypot(bx - ax, by - ay);
    if (length === 0) continue;
    while (untilSample < length) {
      const progress = untilSample / length;
      points.push([ax + (bx - ax) * progress, ay + (by - ay) * progress]);
      untilSample += spacing;
    }
    untilSample -= length;
  }
  return points;
}

export interface ParticleOptions {
  seed: number;
  /** Every target can choose one semantic source. Several target groups may reuse a source. */
  sourceFor: (target: ParticleEndpoint) => number;
  timing: (source: ParticleEndpoint, target: ParticleEndpoint) => {
    depart: number;
    arrive: number;
    bend: number;
  };
}

/**
 * Deterministic rank matching within semantic groups. Each target gets exactly one track.
 * When source and target counts differ, several grains may split from one source sample.
 */
export function makeParticleTracks(
  sources: readonly ParticleEndpoint[],
  targets: readonly ParticleEndpoint[],
  options: ParticleOptions,
): ParticleTrack[] {
  const random = seededRandom(options.seed);
  const groupBy = (points: readonly ParticleEndpoint[], key: (point: ParticleEndpoint) => number) => {
    const groups = new Map<number, ParticleEndpoint[]>();
    for (const point of points) {
      const id = key(point);
      const group = groups.get(id);
      if (group) group.push(point);
      else groups.set(id, [point]);
    }
    for (const group of groups.values()) group.sort((a, b) => a.order - b.order);
    return groups;
  };
  const sourceGroups = groupBy(sources, (point) => point.group);
  const targetGroups = groupBy(targets, options.sourceFor);
  const tracks: ParticleTrack[] = [];
  for (const [id, destination] of targetGroups) {
    const origin = sourceGroups.get(id);
    if (!origin?.length) throw new RangeError(`Particle source group ${id} is missing`);
    destination.forEach((target, index) => {
      const rank = (index + 0.5) / destination.length;
      const source = origin[Math.min(origin.length - 1, Math.floor(rank * origin.length))];
      const { depart, arrive, bend } = options.timing(source, target);
      if (!Number.isFinite(depart) || !Number.isFinite(arrive) || arrive <= depart) {
        throw new RangeError("Particle arrival must follow departure");
      }
      tracks.push({
        source, target, depart, arrive,
        bend: bend * (0.68 + random() * 0.64),
        swirl: (random() - 0.5) * 76,
        size: 0.66 + random() * 0.76,
        phase: random() * 2 * Math.PI,
      });
    });
  }
  return tracks;
}

/** Analytic paths are seekable and settle exactly at the assigned endpoint. */
export function particleAt(track: ParticleTrack, time: number): ParticlePose {
  const [sx, sy] = track.source.point;
  const [tx, ty] = track.target.point;
  if (time <= track.depart) return { x: sx, y: sy, progress: 0, state: "source" };
  if (time >= track.arrive) return { x: tx, y: ty, progress: 1, state: "target" };
  const progress = (time - track.depart) / (track.arrive - track.depart);
  const eased = progress * progress * (3 - 2 * progress);
  const arch = Math.sin(Math.PI * progress) ** 1.25;
  const swirl = track.swirl * arch;
  const phase = progress * Math.PI * 3.2 + track.phase;
  return {
    x: sx + (tx - sx) * eased + Math.sin(phase) * swirl + track.bend * 0.31 * arch,
    y: sy + (ty - sy) * eased - track.bend * arch + Math.cos(phase) * swirl * 0.57,
    progress,
    state: "transit",
  };
}
