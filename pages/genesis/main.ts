import { DURATION, drawGenesis } from "../../lab/mm-genesis/scene";

/*
 * Genesis host: the picture follows the AUDIO clock (AudioContext.currentTime − output latency), so lines land on the
 * music's beats however the browser schedules frames. Plays once. Without a clip in ./media (the music is the
 * user's, kept out of git) it runs silent on the performance clock.
 */
const clips = import.meta.glob<string>("./media/*.wav", { eager: true, query: "?url", import: "default" });
const clipUrl = Object.values(clips)[0];
const stage = document.querySelector<HTMLCanvasElement>(".stage")!;
const start = document.querySelector<HTMLButtonElement>(".start")!;
const foot = document.querySelector<HTMLElement>(".foot")!;
const ctx = stage.getContext("2d")!;
let w = 0, h = 0, dpr = 1, shown = 0, pinned = false, running = false, t0 = 0, silentT0 = 0;
let audio: AudioContext | null = null;

function resize() {
  dpr = Math.min(2, devicePixelRatio || 1); w = innerWidth; h = innerHeight;
  stage.width = Math.round(w * dpr); stage.height = Math.round(h * dpr); draw();
}
function draw() {
  const k = Math.min(w / 1280, h / 720);
  ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (w - 1280 * k) / 2, dpr * (h - 720 * k) / 2);
  drawGenesis(ctx, shown);
}
const now = () => audio ? audio.currentTime - t0 - (audio.outputLatency || audio.baseLatency || 0) : (performance.now() - silentT0) / 1000;
function tick() {
  if (running && !pinned) { shown = Math.max(0, Math.min(DURATION, now())); draw(); }
  requestAnimationFrame(tick);
}
async function play() {
  start.hidden = true; foot.hidden = false;
  if (clipUrl) {
    audio = new AudioContext();
    const buffer = await audio.decodeAudioData(await (await fetch(clipUrl)).arrayBuffer());
    const source = audio.createBufferSource();
    source.buffer = buffer; source.connect(audio.destination);
    t0 = audio.currentTime + 0.05; source.start(t0);
  } else silentT0 = performance.now();
  running = true;
}
start.addEventListener("click", e => { e.stopPropagation(); play(); });
stage.addEventListener("click", () => { if (audio) { if (audio.state === "running") audio.suspend(); else audio.resume(); } });
addEventListener("resize", resize);
resize();
requestAnimationFrame(tick);
(window as unknown as { GENESIS: unknown }).GENESIS = { duration: DURATION, at(t: number) { pinned = true; start.hidden = foot.hidden = true; shown = t; draw(); } };
