import { AUDIO_LOOP, backdropAt, DROP, DURATION, LANDSCAPE, LOOP, makeHum, PORTRAIT, SQUARE, type HumLayout } from "../../lab/mm-hum-logo/scene";

/*
 * Music host. The picture follows the AUDIO clock (AudioContext.currentTime minus the output latency), never its own
 * timer, so it cannot drift from the music; the audio loops sample-accurately between the clip's loop points (beat 0
 * → beat 16 after the drop), and the scene folds time into the same loop. Without the clip (it is the user's music,
 * kept out of git) the page runs silent on the performance clock.
 */
const clips = import.meta.glob<string>("./media/*.wav", { eager: true, query: "?url", import: "default" });
const clipUrl = Object.values(clips)[0];

const stage = document.querySelector<HTMLCanvasElement>(".stage")!;
const start = document.querySelector<HTMLButtonElement>(".start")!;
const foot = document.querySelector<HTMLElement>(".foot")!;
const aspect = document.querySelector<HTMLElement>(".aspect")!;
const ctx = stage.getContext("2d")!;

let layout: HumLayout = LANDSCAPE, drawHum = makeHum(layout), w = 0, h = 0, dpr = 1;
let shown = DROP + 0.5 * LOOP / 16;   // before play: the logo, held
let pinned = false;
let audio: AudioContext | null = null, t0 = 0, silentT0 = 0, running = false;

function resize() {
  dpr = Math.min(2, devicePixelRatio || 1);
  w = innerWidth; h = innerHeight;
  // One composition per aspect: 16:9-ish, square-ish, tall (9:16) — re-laid out, not cropped.
  const r = w / h, want = r > 1.25 ? LANDSCAPE : r > 0.8 ? SQUARE : PORTRAIT;
  if (want !== layout) { layout = want; drawHum = makeHum(layout); }
  aspect.textContent = want === LANDSCAPE ? "16:9" : want === SQUARE ? "1:1" : "9:16";
  stage.width = Math.round(w * dpr); stage.height = Math.round(h * dpr);
  draw();
}

function draw() {
  const k = Math.min(w / layout.w, h / layout.h);
  ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (w - layout.w * k) / 2, dpr * (h - layout.h * k) / 2);
  drawHum(ctx, shown);
  const bg = backdropAt(shown);
  document.body.style.background = bg;
  foot.style.color = bg === "#0a0a0a" || bg === "#d31036" ? "#f1ebdf" : "#0a0a0a";
}

function now() {
  if (audio) return audio.currentTime - t0 - (audio.outputLatency || audio.baseLatency || 0);
  return (performance.now() - silentT0) / 1000;
}

function tick() {
  if (running && !pinned) {
    const t = Math.max(0, now());
    // Intro once, then the loop forever: fold into [DROP + LOOP, DROP + 2 LOOP) so the scene draws "not the first pass".
    shown = t < DROP + LOOP ? t : DROP + LOOP + ((t - DROP) % LOOP);
    draw();
  }
  requestAnimationFrame(tick);
}

async function play() {
  start.hidden = true; foot.hidden = false;
  if (clipUrl) {
    audio = new AudioContext();
    const buffer = await audio.decodeAudioData(await (await fetch(clipUrl)).arrayBuffer());
    const source = audio.createBufferSource();
    source.buffer = buffer; source.loop = true; source.loopStart = AUDIO_LOOP[0]; source.loopEnd = AUDIO_LOOP[1];
    source.connect(audio.destination);
    t0 = audio.currentTime + 0.05;
    source.start(t0);
  } else silentT0 = performance.now();
  running = true;
}

start.addEventListener("click", e => { e.stopPropagation(); play(); });
stage.addEventListener("click", () => {
  if (!running && start.hidden && !audio) return;
  if (!audio) return;
  if (audio.state === "running") audio.suspend(); else audio.resume();
});
addEventListener("keydown", e => { if (e.code === "Space") { e.preventDefault(); if (!running) play(); else stage.click(); } });
addEventListener("resize", resize);
resize();
requestAnimationFrame(tick);
// For tools: seek directly (pages are checked with the same frame tools as scenes).
(window as unknown as { HUM: unknown }).HUM = { duration: DURATION, at(t: number) { pinned = true; start.hidden = foot.hidden = true; shown = t; draw(); } };
