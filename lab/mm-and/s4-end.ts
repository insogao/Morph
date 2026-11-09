import { CREAM, INK, P1, P2, glyphFoot, heavy, pathOf, rng, smooth, span, uiText, fillSlots, box, outBack } from "./common";
import { drawDepth } from "./s3-depth";

/*
 * The clear screen: the last 3D frame turns over tile by tile (a diagonal wave, the players' colours flashing on the
 * tiles' edges) to a cream card: & in the two players' colours, the level's sentence, THE END. The & lands on the
 * card on the beat and settles.
 */
export const FLIP = 86.5;
const TW = 80, TH = 80, COLS = 16, ROWS = 9;
const jitter = (() => { const r = rng(78); return Array.from({ length: COLS * ROWS }, () => r() * 0.35); })();
const AMP = glyphFoot(heavy, "&", [0, 40], 330), AB = box(AMP);
const LINE = uiText("TWO CAN GO WHERE ONE CANNOT.", [0, 150], 24, 0.22), END = uiText("THE END", [0, 210], 15, 0.5);
const CLEAR = uiText("2P CLEAR", [0, -270], 15, 0.5);

function card(ctx: CanvasRenderingContext2D, b: number) {
  ctx.fillStyle = CREAM; ctx.fillRect(-700, -400, 1400, 800);
  const g = ctx.createLinearGradient(AB.x0, 0, AB.x1, 0);
  g.addColorStop(0, P1); g.addColorStop(0.47, P1); g.addColorStop(0.53, P2); g.addColorStop(1, P2);
  const drop = outBack(span(b, FLIP + 3, FLIP + 3.7)), sq = 1 - 0.18 * Math.sin(Math.PI * span(b, FLIP + 3.55, FLIP + 4.1));
  ctx.save(); ctx.translate(0, (1 - drop) * -40 + 40); ctx.scale(1 / Math.sqrt(sq), sq); ctx.translate(0, -40);
  ctx.fillStyle = g; ctx.fill(pathOf(AMP), "evenodd"); ctx.restore();
  fillSlots(ctx, LINE, INK, smooth(span(b, FLIP + 4, FLIP + 5)));
  fillSlots(ctx, END, INK, 0.7 * smooth(span(b, FLIP + 5.5, FLIP + 6.5)));
  fillSlots(ctx, CLEAR, INK, 0.5 * smooth(span(b, FLIP + 5, FLIP + 6)));
}

let front: OffscreenCanvas | null = null, back: OffscreenCanvas | null = null;
function snapshot() {
  if (front || typeof OffscreenCanvas === "undefined") return front;
  front = new OffscreenCanvas(2560, 1440);
  const c = front.getContext("2d") as unknown as CanvasRenderingContext2D;
  c.setTransform(2, 0, 0, 2, 1280, 720); drawDepth(c, FLIP);
  return front;
}
export const prewarmEnd = () => { snapshot(); };

export function drawEnd(ctx: CanvasRenderingContext2D, b: number) {
  const f = snapshot();
  if (!f) { card(ctx, b); return; }
  const all = b > FLIP + 3.4;
  if (all) { card(ctx, b); return; }
  ctx.fillStyle = INK; ctx.fillRect(-700, -400, 1400, 800);
  // the back: the card as it is now, to cut tiles from
  back ??= new OffscreenCanvas(1280, 720);
  const bc = back.getContext("2d") as unknown as CanvasRenderingContext2D;
  bc.setTransform(1, 0, 0, 1, 640, 360); card(bc, b);
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
    const delay = (i + j) / (COLS + ROWS - 2) * 2.2 + jitter[j * COLS + i], phi = Math.PI * smooth(span(b, FLIP + delay, FLIP + delay + 0.7));
    const c = Math.cos(phi), x = -640 + i * TW, y = -360 + j * TH;
    if (Math.abs(c) < 0.02) continue;
    ctx.save(); ctx.translate(x + TW / 2, y + TH / 2); ctx.scale(Math.abs(c), 1);
    if (c >= 0) ctx.drawImage(f, i * TW * 2, j * TH * 2, TW * 2, TH * 2, -TW / 2, -TH / 2, TW, TH);
    else ctx.drawImage(back, i * TW, j * TH, TW, TH, -TW / 2, -TH / 2, TW, TH);
    // the edge catches a player's colour as it turns
    const edge = 1 - Math.abs(c);
    if (edge > 0.5) { ctx.globalAlpha = (edge - 0.5) * 1.6; ctx.fillStyle = (i + j) % 2 ? P1 : P2; ctx.fillRect(-TW / 2, -TH / 2, TW, TH); ctx.globalAlpha = 1; }
    ctx.restore();
  }
}
