import { remapScene, validateSpec } from "../../packages/morph-engine/src/vector/director";
import spec from "./morph.json";
import source from "../../fixtures/s1g/candle.svg?raw";
import target from "../../fixtures/s1g/tulip.svg?raw";

// MM10 — liquid is the story: wax melts and pools into the pot, drips run down into leaves,
// the wick grows into the stem, the flame splits into three petals. Data only (morph.json).
export const scene = remapScene(validateSpec(spec), source, target);
