export const DESIGN_WIDTH = 1280;
export const DESIGN_HEIGHT = 720;

export interface MorphScene {
  readonly id: string;
  readonly title: string;
  readonly duration: number;
  draw(context: CanvasRenderingContext2D, seconds: number): void;
}

export const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export function ramp(time: number, start: number, end: number): number {
  const t = clamp01((time - start) / (end - start));
  return t * t * (3 - 2 * t);
}

export function renderAt(context: CanvasRenderingContext2D, scene: MorphScene, seconds: number): number {
  if (!Number.isFinite(seconds) || !Number.isFinite(scene.duration) || scene.duration <= 0) {
    throw new RangeError("Time must be finite and scene duration must be positive.");
  }
  const time = Math.max(0, Math.min(scene.duration, seconds));
  const { width, height } = context.canvas;
  context.save();
  try {
    context.resetTransform();
    context.clearRect(0, 0, width, height);
    const scale = Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
    context.setTransform(scale, 0, 0, scale, (width - DESIGN_WIDTH * scale) / 2, (height - DESIGN_HEIGHT * scale) / 2);
    scene.draw(context, time);
    return time;
  } finally {
    context.restore();
  }
}

export function frameCount(duration: number, fps: number): number {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isInteger(fps) || fps < 1 || fps > 120) {
    throw new RangeError("Expected a positive duration and an integer FPS from 1 to 120.");
  }
  return Math.max(2, Math.round(duration * fps));
}

export function frameTime(index: number, count: number, duration: number): number {
  if (!Number.isInteger(index) || !Number.isInteger(count) || count < 2 || index < 0 || index >= count) {
    throw new RangeError("Frame index is outside the timeline.");
  }
  return index * duration / (count - 1);
}
