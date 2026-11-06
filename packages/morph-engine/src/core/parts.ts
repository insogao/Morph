import { orderParts } from "./plan";

export type Affine = readonly [a: number, b: number, c: number, d: number, x: number, y: number];
export type Point = readonly [x: number, y: number];
export const identity: Affine = [1, 0, 0, 1, 0, 0];

export interface Part<Geometry, Material> {
  id: string;
  parent?: string;
  transform?(time: number): Affine;
  geometry(time: number): Geometry;
  material(time: number): Material;
  controls?: Readonly<Record<string, Point>>;
  maySplit?: boolean;
  mayFuse?: boolean;
}

export function multiply([a, b, c, d, x, y]: Affine, [e, f, g, h, u, v]: Affine): Affine {
  return [a * e + c * f, b * e + d * f, a * g + c * h, b * g + d * h, a * u + c * v + x, b * u + d * v + y];
}

export function compileParts<G, M>(definitions: readonly Part<G, M>[]) {
  const parts = orderParts(definitions);
  return (time: number) => {
    const transforms = new Map<string, Affine>();
    return parts.map(part => {
      const parent = part.parent ? transforms.get(part.parent)! : identity;
      const world = multiply(parent, part.transform?.(time) ?? identity);
      transforms.set(part.id, world);
      return {
        id: part.id, world, geometry: part.geometry(time), material: part.material(time),
        controls: part.controls, maySplit: part.maySplit ?? false, mayFuse: part.mayFuse ?? false,
      };
    });
  };
}
