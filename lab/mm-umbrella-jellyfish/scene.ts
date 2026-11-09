import { remapScene, validateSpec } from "../../packages/morph-engine/src/vector/director";
import spec from "./morph.json";
import source from "../../fixtures/s1g/umbrella.svg?raw";
import target from "../../fixtures/s1g/jellyfish.svg?raw";

// Generalisation test G2: built from tools/suggest-map.ts + a semantic rewrite of morph.json, no scene code.
export const scene = remapScene(validateSpec(spec), source, target);
