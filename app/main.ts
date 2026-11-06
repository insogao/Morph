import "./style.css";
import { renderAt, type MorphScene } from "../packages/morph-engine/src/core/scene";

const modules = import.meta.glob<{ scene: MorphScene }>(["../demos/*/scene.ts", "../examples/*/scene.ts", "../lab/*/scene.ts"], { eager: true });
const scenes = Object.values(modules).map(({ scene }) => scene);
const stage = document.querySelector<HTMLCanvasElement>("#stage")!;
const context = stage.getContext("2d", { alpha: false })!;
const nav = document.querySelector<HTMLElement>("#scenes")!;
const title = document.querySelector<HTMLElement>("#title")!;
const scrub = document.querySelector<HTMLInputElement>("#seek")!;
const timer = document.querySelector<HTMLOutputElement>("#time")!;
const playButton = document.querySelector<HTMLButtonElement>("#play")!;
const reverseButton = document.querySelector<HTMLButtonElement>("#reverse")!;
const frameButton = document.querySelector<HTMLButtonElement>("#frame")!;
const request = new URLSearchParams(location.search);
const renderMode = request.get("render") === "1";
if (renderMode) document.body.classList.add("render");

let current = scenes.find(scene => scene.id === (request.get("scene") ?? document.body.dataset.defaultScene)) ?? scenes[0];
let time = 0;
let direction = 1;
let animation = 0;
let playing = false;

const problem = document.querySelector<HTMLElement>("#empty")!;
function seek(seconds: number) {
  try {
    time = renderAt(context, current, seconds);
    problem.hidden = true;
  } catch (error) {
    // One scene failing (e.g. no WebGL 2 float targets) must not take the whole player down.
    time = Math.max(0, Math.min(current.duration, seconds));
    problem.hidden = false;
    problem.textContent = "此场景无法在当前浏览器渲染：" + (error instanceof Error ? error.message : String(error)) +
      "。请用最新版 Chrome / Edge 打开，或在浏览器设置中开启硬件加速。";
    if (renderMode) throw error;
  }
  scrub.value = String(time);
  timer.value = time.toFixed(2) + " / " + current.duration.toFixed(2) + " s";
}

function pause() {
  playing = false;
  cancelAnimationFrame(animation);
  playButton.textContent = "播放";
  reverseButton.removeAttribute("aria-pressed");
}

function play(nextDirection = 1) {
  if (playing && nextDirection === direction) {
    pause();
    return;
  }
  pause();
  direction = nextDirection;
  if (direction > 0 && time >= current.duration) seek(0);
  if (direction < 0 && time <= 0) seek(current.duration);
  playing = true;
  playButton.textContent = direction > 0 ? "暂停" : "播放";
  if (direction < 0) reverseButton.setAttribute("aria-pressed", "true");
  const start = performance.now();
  const from = time;
  function tick(now: number) {
    const next = from + direction * (now - start) / 1000;
    seek(next);
    if (next <= 0 || next >= current.duration) pause();
    else animation = requestAnimationFrame(tick);
  }
  animation = requestAnimationFrame(tick);
}

function select(scene: MorphScene) {
  pause();
  current = scene;
  title.textContent = scene.title;
  scrub.max = String(scene.duration);
  for (const button of nav.querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(button.dataset.scene === scene.id));
  }
  seek(0);
}

function saveFrame() {
  const anchor = document.createElement("a");
  anchor.download = current.id + "-" + time.toFixed(3) + ".png";
  anchor.href = stage.toDataURL("image/png");
  anchor.click();
}

if (current) {
  for (const scene of scenes) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.scene = scene.id;
    button.textContent = scene.title;
    button.onclick = () => select(scene);
    nav.append(button);
  }
  playButton.onclick = () => play();
  reverseButton.onclick = () => play(-1);
  frameButton.onclick = saveFrame;
  scrub.oninput = () => { pause(); seek(Number(scrub.value)); };
  select(current);
} else {
  document.querySelector<HTMLElement>("#empty")!.hidden = false;
}

declare global {
  interface Window {
    MORPH: {
      list: () => Array<{ id: string; title: string; duration: number }>;
      select: (id: string) => boolean;
      renderAt: (time: number) => void;
      seek: (time: number) => void;
      play: () => void;
      pause: () => void;
      reverse: () => void;
      export: () => string;
      resize: (width: number, height: number) => void;
    };
  }
}

window.MORPH = {
  list: () => scenes.map(({ id, title, duration }) => ({ id, title, duration })),
  select(id) {
    const scene = scenes.find(item => item.id === id);
    if (!scene) return false;
    select(scene);
    return true;
  },
  renderAt: seek,
  seek,
  play: () => play(),
  pause,
  reverse: () => play(-1),
  export: () => stage.toDataURL("image/png"),
  resize(width, height) {
    if (![width, height].every(n => Number.isInteger(n) && n > 0 && n <= 7680)) {
      throw new RangeError("Invalid render dimensions.");
    }
    stage.width = width;
    stage.height = height;
    seek(time);
  },
};
