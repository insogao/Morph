import { remapScene, validateSpec } from "../../packages/morph-engine/src/vector/director";
import spec from "./morph.json";
import source from "../../fixtures/s1/flower.svg?raw";
import target from "../../fixtures/s1/butterfly.svg?raw";

// D1 — every creative decision (part fates, timing, cause, payoff) lives in morph.json.
export const scene = remapScene(validateSpec(spec), source, target);
