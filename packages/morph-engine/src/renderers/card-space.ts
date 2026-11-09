import { Color, DoubleSide, Group, Mesh, MeshBasicMaterial, Path, PerspectiveCamera, Scene, Shape as ThreeShape, ShapeGeometry, Vector2, Vector3 } from "three";
import { ThreeLayer } from "./three";
import { curve, type Key } from "../vector/camera-move";
import type { Shape } from "../vector/shape";

/**
 * Card space: flat graphic shapes as cards in real 3D, seen by a drone camera.
 *
 * Title design (the Magpie Murders sequences) is flat art — two or three colours, silhouettes — composited in 3D
 * and shot with a camera that really travels: yaw, pitch and roll, distance, lens. That is what makes the viewer
 * feel THEY are moving (parallax between layers, perspective changing), not that the picture is sliding.
 *
 * Sets are groups of cards. A set is visible during its time window; swaps happen at HIDE MOMENTS — when one flat
 * colour fills the whole frame (the camera is right up against a shape that has the same colour as the next set's
 * shape in the same place). Rhyme rule: same shape AND same colour, by design.
 */

export type V3 = [number, number, number];

/** 2D outline helpers in world units, y up. */
export const shapes = {
  disc: (r: number, n = 96) => ring2(n, i => [r * Math.cos(i), r * Math.sin(i)]),
  rect: (w: number, h: number): Array<[number, number]> => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]],
  poly: (pts: Array<[number, number]>) => pts,
};
function ring2(n: number, f: (a: number) => [number, number]): Array<[number, number]> {
  return Array.from({ length: n }, (_, i) => f(2 * Math.PI * i / n));
}

/** An outline (and holes) in world units, y up, as a card shape. */
export function outline(outer: ReadonlyArray<readonly [number, number]>, holes: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = []): ThreeShape {
  const s = new ThreeShape(outer.map(([x, y]) => new Vector2(x, y)));
  for (const h of holes) s.holes.push(new Path(h.map(([x, y]) => new Vector2(x, y))));
  return s;
}
const toThree = outline;

/** A vector-track Shape (design px, y down) as card outlines in world units (y up), scaled and centred on `at`. */
export function fromDesign(shape: Shape, scale: number, at: [number, number]): ThreeShape[] {
  const f = ([x, y]: readonly [number, number]): [number, number] => [(x - at[0]) * scale, -(y - at[1]) * scale];
  return shape.pieces.map(p => toThree(p.outer.map(f), p.holes.map(h => h.map(f))));
}

export interface CardOptions { rotation?: V3; scale?: number; order?: number }

export interface CameraKeys {
  /** Camera position keys per axis; target (look-at) keys; roll (radians about the view axis); vertical fov (degrees). */
  pos: Array<{ t: number; v: V3; d?: V3 }>;
  target: Array<{ t: number; v: V3; d?: V3 }>;
  roll?: Key[];
  fov?: Key[];
}

const split = (keys: Array<{ t: number; v: V3; d?: V3 }>) => [0, 1, 2].map(k => curve(keys.map(q => ({ t: q.t, v: q.v[k], d: q.d?.[k] }))));

export class CardSpace {
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  private readonly sets = new Map<string, { group: Group; from: number; to: number }>();
  private readonly layer: ThreeLayer;
  private pos: Array<(t: number) => number> = [];
  private tgt: Array<(t: number) => number> = [];
  private roll: (t: number) => number = () => 0;
  private fov: (t: number) => number = () => 40;

  constructor(background: string) {
    this.scene.background = new Color(background);
    this.camera = new PerspectiveCamera(40, 16 / 9, 0.02, 400);
    this.layer = new ThreeLayer({ flat: true });
  }

  /** A set of cards, visible for t in [from, to). */
  set(name: string, from = -Infinity, to = Infinity): Group {
    const group = new Group();
    group.name = name;
    this.scene.add(group);
    this.sets.set(name, { group, from, to });
    return group;
  }

  /** Add a flat card (one or more outlines) of one colour at a position; cards face +z unless rotated. */
  card(set: Group, shape: ThreeShape | ThreeShape[], color: string, at: V3, opts: CardOptions = {}): Mesh {
    const geo = new ShapeGeometry(shape, 24);
    const mesh = new Mesh(geo, new MeshBasicMaterial({ color: new Color(color), side: DoubleSide }));
    mesh.position.set(...at);
    if (opts.rotation) mesh.rotation.set(...opts.rotation);
    if (opts.scale) mesh.scale.setScalar(opts.scale);
    if (opts.order !== undefined) mesh.renderOrder = opts.order;
    set.add(mesh);
    return mesh;
  }

  /** Drone camera: position, look-at target, roll and fov, each a C¹ curve (they overlap freely). */
  path(keys: CameraKeys) {
    this.pos = split(keys.pos);
    this.tgt = split(keys.target);
    if (keys.roll) this.roll = curve(keys.roll);
    if (keys.fov) this.fov = curve(keys.fov);
  }

  /** Pose the camera and set visibility for time t. */
  pose(t: number) {
    for (const { group, from, to } of this.sets.values()) group.visible = t >= from && t < to;
    const c = this.camera;
    c.position.set(this.pos[0](t), this.pos[1](t), this.pos[2](t));
    c.up.set(0, 1, 0);
    c.lookAt(this.tgt[0](t), this.tgt[1](t), this.tgt[2](t));
    c.rotateZ(this.roll(t));
    const f = this.fov(t);
    if (c.fov !== f) { c.fov = f; c.updateProjectionMatrix(); }
    c.updateMatrixWorld();
  }

  /** Screen motion (design px) of the image between two instants: rotation of the view plus parallax at the target. */
  motion(t0: number, t1: number): number {
    const at = (t: number) => {
      this.pose(t);
      const f = new Vector3(); this.camera.getWorldDirection(f);
      const u = new Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
      const p = this.camera.position.clone(), g = new Vector3(this.tgt[0](t), this.tgt[1](t), this.tgt[2](t));
      return { f, u, p, d: Math.max(0.05, p.distanceTo(g)) };
    };
    const a = at(t0), b = at(t1);
    const fpx = 360 / Math.tan((this.camera.fov * Math.PI / 180) / 2);
    const turn = a.f.angleTo(b.f) + 0.5 * a.u.angleTo(b.u), move = a.p.distanceTo(b.p) / Math.min(a.d, b.d);
    return fpx * (turn + move);
  }

  /**
   * Render at time t with real motion blur: sub-frames over the shutter are averaged, as many as the image's motion
   * needs (none when slow).
   */
  draw(ctx: CanvasRenderingContext2D, t: number, shutter = 1 / 60) {
    const n = shutter > 0 ? Math.max(1, Math.min(8, Math.ceil(this.motion(t - shutter / 2, t + shutter / 2) / 8))) : 1;
    const rect = { x: 0, y: 0, width: 1280, height: 720 };
    if (n === 1) { this.pose(t); this.layer.composite(ctx, this.scene, this.camera, rect); return; }
    const acc = scratch(ctx, "card-acc");
    acc.setTransform(1, 0, 0, 1, 0, 0);
    acc.clearRect(0, 0, acc.canvas.width, acc.canvas.height);
    acc.setTransform(ctx.getTransform());
    for (let k = 0; k < n; k++) {
      this.pose(t - shutter / 2 + shutter * (k + 0.5) / n);
      acc.globalAlpha = 1 / (k + 1);
      this.layer.composite(acc, this.scene, this.camera, rect);
    }
    acc.globalAlpha = 1;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(acc.canvas, 0, 0);
    ctx.restore();
    this.pose(t);
  }
}

const SCRATCH = new Map<string, CanvasRenderingContext2D>();
function scratch(ctx: CanvasRenderingContext2D, name: string): CanvasRenderingContext2D {
  const w = ctx.canvas.width, h = ctx.canvas.height, key = name + ":" + w + "x" + h;
  let l = SCRATCH.get(key);
  if (!l) {
    const c = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
    l = c.getContext("2d") as CanvasRenderingContext2D;
    SCRATCH.set(key, l);
  }
  return l;
}
