import { morphShapes, type Frame, type MorphOptions, type ShapeMorph } from "./morph";
import type { Shape } from "./shape";

export type Easing = "linear" | "in" | "out" | "inOut" | "inOutQuint" | "anticipate";

export function ease(name: Easing, t: number): number {
  const x = Math.max(0, Math.min(1, t));
  switch (name) {
    case "linear": return x;
    case "in": return x * x * x;
    case "out": return 1 - (1 - x) ** 3;
    case "inOut": return x < .5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
    case "inOutQuint": return x < .5 ? 16 * x ** 5 : 1 - (-2 * x + 2) ** 5 / 2;
    // A small pull back before the move, then a decisive arrival.
    case "anticipate": { const s = 1.4; return x < .5 ? ((2 * x) ** 2 * ((s + 1) * 2 * x - s)) / 2 : ((2 * x - 2) ** 2 * ((s + 1) * (2 * x - 2) + s) + 2) / 2; }
  }
}

/**
 * Inertial bounce after arrival, with the same three controls as common motion-design tools:
 * amplitude (overshoot in percent of the morph), frequency (Hz) and decay (1/s).
 */
export interface Bounce { amplitude: number; frequency: number; decay: number }
export const DEFAULT_BOUNCE: Bounce = { amplitude: 12, frequency: 3, decay: 5 };

export function bounceOffset(b: Bounce, since: number): number {
  if (since <= 0) return 0;
  return (b.amplitude / 100) * Math.sin(2 * Math.PI * b.frequency * since) * Math.exp(-b.decay * since);
}

export interface Step {
  shape: Shape;
  /** Seconds spent morphing into this shape from the previous one (ignored for the first step). */
  morph?: number;
  /** Seconds held on this shape after arriving. */
  hold?: number;
  ease?: Easing;
  bounce?: Bounce | false;
  /** Options for the morph that arrives at this step. */
  options?: MorphOptions;
  /** Arbitrary per-step payload (colour etc.) for the scene. */
  data?: Record<string, unknown>;
}

export interface SequenceState {
  frame: Frame;
  /** Index of the step being morphed into (or held). */
  step: number;
  /** Eased progress of the current morph, including bounce overshoot. */
  progress: number;
  /** Raw 0..1 phase within the current morph window (1 while holding). */
  phase: number;
  from: Step;
  to: Step;
}

export interface Sequence {
  readonly duration: number;
  readonly morphs: ShapeMorph[];
  at(time: number): SequenceState;
  /** Start and end time of every morph window. */
  readonly windows: Array<[number, number]>;
}

/** A → B → C …; with `loop`, the last step morphs back into the first. */
export function sequence(steps: readonly Step[], loop = false): Sequence {
  if (steps.length < 2) throw new Error("A sequence needs at least two shapes.");
  const chain = loop ? [...steps, { ...steps[0], options: steps[0].options }] : [...steps];
  const morphs: ShapeMorph[] = [];
  const windows: Array<[number, number]> = [];
  let clock = chain[0].hold ?? 0;
  for (let i = 1; i < chain.length; i++) {
    const step = chain[i];
    morphs.push(morphShapes(chain[i - 1].shape, step.shape, step.options));
    const length = step.morph ?? 1;
    windows.push([clock, clock + length]);
    clock += length + (step.hold ?? 0);
  }
  const duration = clock;
  const at = (time: number): SequenceState => {
    const t = Math.max(0, Math.min(duration, time));
    let k = windows.findIndex(([, end], i) => t < end || i === windows.length - 1);
    // In the hold after window k, stay on window k (bounce still ringing).
    for (let i = 0; i < windows.length; i++) if (t >= windows[i][0]) k = i;
    const [start, end] = windows[k];
    const to = chain[k + 1];
    const phase = Math.max(0, Math.min(1, (t - start) / (end - start)));
    let progress = ease(to.ease ?? "inOut", phase);
    if (to.bounce) progress += bounceOffset(to.bounce, t - end);
    if (t < start) progress = 0;
    return { frame: morphs[k].at(progress), step: k + 1, progress, phase, from: chain[k], to };
  };
  return { duration, morphs, at, windows };
}
