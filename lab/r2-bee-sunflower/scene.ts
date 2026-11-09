import { remapScene, validateSpec } from "../../packages/morph-engine/src/vector/director";
import spec from "./morph.json";
import source from "../../lab/r2-bee-sunflower/bee.flat.svg?raw";
import target from "../../lab/r2-bee-sunflower/sunflower.split.svg?raw";

// Blind round 2 (B4): bee → sunflower, part remap from morph.json. Bee SVG flattened (clip, strokes) into bee.flat.svg.
export const scene = remapScene(validateSpec(spec), source, target);
