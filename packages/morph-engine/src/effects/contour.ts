import flubber from "flubber";
import { clamp01 } from "../core/scene";

export type ContourPair = { from: string; to: string };

export function contourMorph(pairs: readonly ContourPair[], maxSegmentLength = 4) {
  if (!pairs.length || !Number.isFinite(maxSegmentLength) || maxSegmentLength <= 0) {
    throw new Error("Provide a matched contour and a positive segment length.");
  }
  const rings = pairs.map(({ from, to }) => flubber.interpolate(from, to, { maxSegmentLength }));
  return (t: number) => {
    if (!Number.isFinite(t)) throw new Error("Contour time must be finite.");
    return rings.map(ring => ring(clamp01(t)));
  };
}
