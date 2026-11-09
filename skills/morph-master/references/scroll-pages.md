# Scroll-driven pages: the morph IS the page

Every scene here is a pure function of time, so scroll position can simply **be** time. The reader scrubs the story forwards and backwards, and every frame is exact. This is the fastest-rising web trend (scrollytelling), and the architecture gives it to you almost free. Worked example: MM70 `lab/mm-tempo-scroll` plus the page `pages/tempo/`, a 72 KB offline HTML file.

## Build

1. **Write the story as a normal scene** (`lab/<id>/scene.ts`): `chain()` stages, carriers, overlaps (see [stages.md](stages.md)). Export a **layout factory** (`makeX(layout)`) so that portrait screens get their own stacked composition, not a crop of the landscape one.
2. **Write the page** in `pages/<name>/`:
   - `index.html`: a tall `.story` section with one `position: sticky` canvas, plus real DOM for the navigation, the call-to-action and screen-reader text;
   - `main.ts`: map the scroll progress through the story section to time, `t = progress × duration`.
3. **Follow the scroll with critical damping**, not raw: `shown += (target − shown)·(1 − e^(−9·dt))`. This gives the smooth "Lenis" feel without overshooting a beat.
4. **Fit the layout's design space to the viewport** (contain) and draw the backdrop far beyond it. Choose portrait vs landscape by aspect, and rebuild on rotation.
5. **Reduced motion:** with `prefers-reduced-motion`, show the end state and don't scrub.
6. **Expose `window.<NAME>.at(t)`, which pins the time**, so tools can render any moment.
7. **Hand the page over to DOM at the end.** The story's last beat is a frame-filling colour (the mark spreads into the page), and the CTA section starts with that colour, so there is no seam.

## Check and deliver

- **Story checks:** `mm verify <id>` and `mm frames`. The scene runs in the player like any other.
- **Export:** `node tools/export-page.mjs <name>` builds the page on its own (one entry, no code splitting) into `gallery/page-<name>.html`. Then run `node tools/page-check.mjs gallery/page-<name>.html <NAME> t1 t2 …`: it confirms no errors and no network from `file://`, and renders a strip.
- **Frame rate:** measure in a real browser while auto-scrolling with `requestAnimationFrame` (MM70: median 16.7 ms, max 18.8 ms at dpr 2).
- **Never add a page as a second entry in `vite.config.ts`.** It splits a shared chunk out of the player and breaks the player's offline build, and with it every render tool. This happened once.

## What makes it read as "of the web"

- **A real context:** a product, a brand, navigation, a CTA. Never a lab sheet with a HUD.
- **Typography as the hero:** a weight that "breathes" (the same glyph at 200 and 900 has the same structure, so the morph is perfect), plus letter-by-letter caption morphs.
- **One brand colour as the carrier** from first frame to CTA.
- **Short beats tied to scroll distance:** about 1 viewport-height per stage.
