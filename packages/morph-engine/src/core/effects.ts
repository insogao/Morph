import { clamp01 } from "./scene";

export interface Effect<State> {
  id: string;
  apply(state: State, frame: { time: number; progress: number }): State;
}

export type Cue<State> = { from: number; to: number; effect: Effect<State> };

export function compose<State>(makeState: (time: number) => State, cues: readonly Cue<State>[]) {
  if (cues.some(cue => !Number.isFinite(cue.from) || !Number.isFinite(cue.to) || cue.to <= cue.from)) {
    throw new Error("Each effect must have an ordered, finite time span.");
  }
  return (time: number): State => {
    if (!Number.isFinite(time)) throw new Error("Effect time must be finite.");
    let state = makeState(time);
    for (const { from, to, effect } of cues) {
      if (time >= from) state = effect.apply(state, { time, progress: clamp01((time - from) / (to - from)) });
    }
    return state;
  };
}
