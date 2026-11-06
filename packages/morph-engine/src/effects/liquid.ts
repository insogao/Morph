export interface LiquidMass {
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  strength?: number;
}

export interface LiquidOptions {
  cellSize?: number;
  iso?: number;
}

type Point = readonly [number, number];

const cellEdges: readonly (readonly number[])[] = [
  [], [3, 0], [0, 1], [3, 1], [1, 2], [3, 0, 1, 2], [0, 2], [3, 2],
  [2, 3], [0, 2], [0, 1, 2, 3], [1, 2], [1, 3], [0, 1], [3, 0], [],
];
const twoCellsJoined = { 5: [0, 1, 2, 3], 10: [3, 0, 1, 2] };

/** A compact, additive ellipse field. Nearby masses join at the isocontour and split as they move apart. */
export function liquidPath(masses: readonly LiquidMass[], options: LiquidOptions = {}): Path2D {
  const path = new Path2D();
  const cell = options.cellSize ?? 3;
  const iso = options.iso ?? 0.36;
  if (!Number.isFinite(cell) || cell <= 0 || !Number.isFinite(iso) || iso <= 0) {
    throw new RangeError('Liquid field requires positive finite cellSize and iso');
  }
  const active = masses.filter(mass => mass.radiusX > 0 && mass.radiusY > 0 && (mass.strength ?? 1) > 0);
  if (active.length === 0) return path;
  if (active.some(mass => ![mass.x, mass.y, mass.radiusX, mass.radiusY, mass.strength ?? 1].every(Number.isFinite))) {
    throw new RangeError('Liquid masses require finite coordinates, radii and strength');
  }
  const left = Math.min(...active.map(mass => mass.x - mass.radiusX)) - cell;
  const top = Math.min(...active.map(mass => mass.y - mass.radiusY)) - cell;
  const right = Math.max(...active.map(mass => mass.x + mass.radiusX)) + cell;
  const bottom = Math.max(...active.map(mass => mass.y + mass.radiusY)) + cell;
  const cols = Math.ceil((right - left) / cell) + 1;
  const rows = Math.ceil((bottom - top) / cell) + 1;

  const values = new Float32Array(cols * rows);
  for (const mass of active) {
    const minX = Math.max(0, Math.ceil((mass.x - mass.radiusX - left) / cell));
    const maxX = Math.min(cols - 1, Math.floor((mass.x + mass.radiusX - left) / cell));
    const minY = Math.max(0, Math.ceil((mass.y - mass.radiusY - top) / cell));
    const maxY = Math.min(rows - 1, Math.floor((mass.y + mass.radiusY - top) / cell));
    const strength = mass.strength ?? 1;
    for (let y = minY; y <= maxY; y++) {
      const dy = (top + y * cell - mass.y) / mass.radiusY;
      for (let x = minX; x <= maxX; x++) {
        const dx = (left + x * cell - mass.x) / mass.radiusX;
        const support = Math.max(0, 1 - dx * dx - dy * dy);
        values[y * cols + x] += strength * support * support;
      }
    }
  }

  const vertices = new Map<number, Point>();
  const links = new Map<number, number[]>();
  const addLink = (from: number, to: number) => {
    const neighbors = links.get(from);
    if (neighbors) neighbors.push(to);
    else links.set(from, [to]);
  };
  const horizontal = (x: number, y: number) => y * cols + x;
  const vertical = (x: number, y: number) => cols * rows + y * cols + x;
  for (let y = 0; y < rows - 1; y++) {
    for (let x = 0; x < cols - 1; x++) {
      const offset = y * cols + x;
      const a = values[offset];
      const b = values[offset + 1];
      const c = values[offset + cols + 1];
      const d = values[offset + cols];
      const mask = Number(a >= iso) | (Number(b >= iso) << 1) | (Number(c >= iso) << 2) | (Number(d >= iso) << 3);
      if (mask === 0 || mask === 15) continue;
      const edges = (mask === 5 || mask === 10) && (a + b + c + d) * 0.25 >= iso
        ? twoCellsJoined[mask]
        : cellEdges[mask];
      const edgeId = (edge: number): number => {
        const ids = [horizontal(x, y), vertical(x + 1, y), horizontal(x, y + 1), vertical(x, y)];
        const id = ids[edge];
        if (!vertices.has(id)) {
          const interpolate = (from: number, to: number) => (iso - from) / (to - from);
          const points: Point[] = [
            [x + interpolate(a, b), y], [x + 1, y + interpolate(b, c)],
            [x + interpolate(d, c), y + 1], [x, y + interpolate(a, d)],
          ];
          const [px, py] = points[edge];
          vertices.set(id, [left + px * cell, top + py * cell]);
        }
        return id;
      };
      for (let pair = 0; pair < edges.length; pair += 2) {
        const from = edgeId(edges[pair]);
        const to = edgeId(edges[pair + 1]);
        addLink(from, to);
        addLink(to, from);
      }
    }
  }

  const visited = new Set<number>();
  for (const start of links.keys()) {
    if (visited.has(start)) continue;
    path.moveTo(...vertices.get(start)!);
    let previous = start;
    let current = links.get(start)![0];
    visited.add(start);
    while (!visited.has(current)) {
      path.lineTo(...vertices.get(current)!);
      visited.add(current);
      const next = links.get(current)!.find(neighbor => neighbor !== previous);
      if (next === undefined) break;
      previous = current;
      current = next;
    }
    path.closePath();
  }
  return path;
}
