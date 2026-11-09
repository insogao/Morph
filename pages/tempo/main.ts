import { DURATION, LANDSCAPE, makeTempo, ORANGE, PORTRAIT, type TempoLayout } from "../../lab/mm-tempo-scroll/scene";

/*
 * Scroll host. The scene is a pure function of time, so scroll position simply IS time: scrub forwards and
 * backwards, jump anywhere, and every frame is exact. A critically damped follower smooths the scroll (the
 * "Lenis feel") without ever overshooting a beat. Reduced motion: show the end state, no scrubbing.
 */
const stage = document.querySelector<HTMLCanvasElement>(".stage")!;
const story = document.querySelector<HTMLElement>(".story")!;
const nav = document.querySelector<HTMLElement>(".nav")!;
const hint = document.querySelector<HTMLElement>(".hint")!;
const ctx = stage.getContext("2d")!;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

let pinned = false;   // set by tools (window.TEMPO.at): stop following the scroll
let shown = reduced ? DURATION : 0, target = shown, last = performance.now(), w = 0, h = 0, dpr = 1;
// A portrait screen gets its own composition (stacked), not a crop of the landscape one.
let layout: TempoLayout = LANDSCAPE, drawTempo = makeTempo(layout);

function resize() {
  dpr = Math.min(2, devicePixelRatio || 1);
  w = stage.clientWidth; h = stage.clientHeight;
  const want = h > w * 1.1 ? PORTRAIT : LANDSCAPE;
  if (want !== layout) { layout = want; drawTempo = makeTempo(layout); }
  stage.width = Math.round(w * dpr); stage.height = Math.round(h * dpr);
  draw();
}

/** Scroll progress through the story section → scene time. */
function scrollTime() {
  const r = story.getBoundingClientRect(), travel = Math.max(1, r.height - innerHeight);
  return Math.max(0, Math.min(1, -r.top / travel)) * DURATION;
}

function draw() {
  // The layout's design space, fitted to the viewport (contain, centred); the backdrop is drawn far beyond it.
  const k = Math.min(w / layout.w, h / layout.h);
  ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (w - layout.w * k) / 2, dpr * (h - layout.h * k) / 2);
  drawTempo(ctx, shown);
  const onOrange = shown > DURATION * 0.86;
  nav.classList.toggle("on-orange", onOrange);
  document.body.style.background = onOrange ? ORANGE : "";
  hint.style.opacity = shown < 0.4 ? "0.45" : "0";
}

function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (!reduced && !pinned) {
    target = scrollTime();
    // Critically damped follow: fast, smooth, no overshoot.
    const a = 1 - Math.exp(-dt * 9);
    shown = Math.abs(target - shown) < 1e-4 ? target : shown + (target - shown) * a;
  }
  draw();
  requestAnimationFrame(frame);
}

addEventListener("resize", resize);
resize();
requestAnimationFrame(frame);
// For tools: seek the story directly (pages are checked with the same frame tools as scenes).
(window as unknown as { TEMPO: unknown }).TEMPO = { duration: DURATION, at(t: number) { pinned = true; shown = target = t; draw(); } };
