# Runtime contract

The full engine is [insogao/Morph](https://github.com/insogao/Morph). In a full checkout, this skill is at skills/creative-morph and the engine root is two directories up. If the skill was copied separately, use a local checkout or obtain the v1.0.0 tag. GitHub archives are a fallback when Git transport is unavailable. Add scenes in a writable checkout.

Install Node.js 22.12+ or 24+, then run `npm ci`. Export requires Chromium and FFmpeg with libx264 and ffprobe. Use `npx playwright-core install chromium` if Chromium is missing. `MORPH_CHROMIUM`, `MORPH_FFMPEG`, and `MORPH_FFPROBE` override executable paths.

## Author a scene

Add `demos/your-scene/scene.ts` and `plan.json`. The player also discovers `examples/your-scene/scene.ts`.

```ts
import type { MorphScene } from "../../packages/morph-engine/src/core/scene";

export const scene: MorphScene = {
  id: "your-scene",
  title: "Your scene",
  duration: 6,
  draw(ctx, time) {
    // Paint 1280 × 720 logical pixels at any time from 0 to 6 seconds.
  },
};
```

Use the same ID and duration in [the plan schema](../../../schemas/morph-plan.schema.json). Set `selected` to the exact name of one candidate. Start and end the ordered beats at zero and the exact duration. Each mapping has arrays of source and target part IDs, plus a description of the cue that carries through.

The host clears the canvas and normalizes its transform on each call. Save and restore intermediate canvas state. Keep frame evaluation pure in time and seed. If a solver needs history, use fixed steps and checkpoint recovery for reverse seeks. A frame request must never advance the solver by itself.

## Check and export

```sh
npm run dev
npm run build
npm test
npm run check:visual -- your-scene
node tools/frames.mjs your-scene 2.5 3 3.5   # specific times side by side
npm run export -- your-scene --width 1920 --out gallery
```

The dev URL accepts `?scene=your-scene`. Scrub the live player while iterating. The visual check and exporter consume the existing production build, so rebuild after editing. Inspect the contact sheet in `.morph` and frames near each handoff. Chromium checks page errors, offline loading, and identical PNGs in both seek orders. The encoder verifies H.264 dimensions and exact frame count. Record visual issues at concrete timestamps before rerendering. When an independent reviewer is available, give them the rendered scene before the implementation and request timestamped findings.

The HTML player offers play, pause, reverse, scrub, and frame save. Automation uses `window.MORPH.renderAt(seconds)`, `select(id)`, `resize(width, height)`, and `export()` for a PNG data URL. Draw anything that must appear in the video inside the scene.
