import { remapScene, validateSpec } from "../../packages/morph-engine/src/vector/director";
import spec from "./morph.json";
import source from "../../fixtures/s4/coffee.svg?raw";
import target from "../../fixtures/s4/plant.svg?raw";

// Blind test B1: coffee cup → potted plant. Steam rises into the plant, the cup becomes the pot.
export const scene = remapScene(validateSpec(spec), source, target);
