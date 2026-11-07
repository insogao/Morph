import type { MorphScene } from "../../packages/morph-engine/src/core/scene";
import { CardSpace, fromDesign, outline, shapes, type CameraKeys, type V3 } from "../../packages/morph-engine/src/renderers/card-space";
import { layoutText, type GlyphSet } from "../../packages/morph-engine/src/vector/text";
import glyphs from "../mm-word/glyphs.json";

/*
 * MM98 — one continuous drone shot through flat cards in real 3D (title-design grammar, original content).
 *
 * Rhymes are designed: SAME shape, SAME colour, SAME place.
 *   watch face (cream disc)  ≡ the full moon (cream disc)        hide: the camera dives until cream fills the frame
 *   lit window (cream rect)  ≡ the page of an open book (cream)  hide: the camera flies into the window
 * The camera is a drone: it travels, yaws, pitches and rolls, changes distance and lens; layers parallax past it.
 *   0–2.1 s   top shot of a pocket watch on a dark desk, spinning; a short gather, then a full-speed dive into the face
 *   2.1–4.2   burst out of the moon, climbing fast over the rooftops, unrolling; the turn taken at speed
 *   4.2–6.0   FPV: bank hard, plunge, skim the near roofs, into a lit window
 *   6.0–9.2   out of the page, whip down into a low raking view across the desk — book, tea, the title
 */
const RED = "#c8283c", INK = "#16161f", CREAM = "#efe6d4";
// Depth tints for far layers (atmosphere): each step back is a little closer to the sky.
const FAR3 = "#8a1d2e", FAR2 = "#5c1523", FAR1 = "#36111b";
const M: V3 = [0, 6, -36];                       // the watch face ≡ the moon
const H1: [number, number] = [0.35, 5.2];        // an empty patch of the face (no ticks, no hands)
const W: V3 = [3.2, 2.0, -14];                   // the lit window ≡ the open page

type P2 = [number, number];
const rot = (pts: P2[], a: number, by: P2 = [0, 0]): P2[] => pts.map(([x, y]) => [by[0] + x * Math.cos(a) - y * Math.sin(a), by[1] + x * Math.sin(a) + y * Math.cos(a)]);
const rectAt = (w: number, h: number, c: P2, a = 0): P2[] => rot(shapes.rect(w, h), a, c);
export const T1 = 2.1, T2 = 5.95;

/** The drone path (exported so its speed profile can be printed and checked). */
const face = (dx: number, dy: number, dz: number): V3 => [H1[0] + dx, H1[1] + dy, -36 + dz];
export const PATH: CameraKeys = {
  // Speed is the point: short gather, long fast stretches, short hard brakes, and turns taken AT speed
  // (an arc, never stop-and-turn). Print the profile with the snippet in M6-report.md before rendering.
  pos: [
    { t: 0, v: [0.9, 6.6, -24], d: [0, 0, 0.2] },
    { t: 0.5, v: [1.05, 6.75, -23.1], d: [0, 0, 0] },              // gather (0.5 s, not 1)
    { t: 1.55, v: face(0.1, 0.06, 4.2), d: [-0.35, -0.5, -21] },    // full-speed dive
    { t: T1, v: face(0, 0, 0.72), d: [0, 0, 0] },                   // hard brake: cream fills the frame
    { t: 2.45, v: face(-0.05, 0.35, 4.0), d: [-0.3, 2.6, 22] },     // burst out of the moon
    { t: 3.35, v: [0.4, 8.0, -15], d: [0.6, 0.6, 18] },            // climbing out over the roofs, fast
    { t: 4.1, v: [-0.8, 7.5, -3.2], d: [7.5, -1.6, 0.4] },         // the U-turn as a wide sideways sweep: speed never drops
    { t: 4.8, v: [2.7, 4.6, -7.6], d: [1.0, -4.0, -10] },          // FPV: plunge, skim the near roofs
    { t: 5.45, v: [W[0], W[1] + 0.1, W[2] + 2.2], d: [0.3, -1.2, -10] },
    { t: T2, v: [W[0], W[1], W[2] + 0.4], d: [0, 0, 0] },          // into the window: hard brake
    { t: 6.25, v: [W[0] + 0.25, W[1] - 1.0, W[2] + 2.0], d: [0.8, -7.5, 6.5] },  // out of the page, whip down
    { t: 7.1, v: [W[0] + 0.85, W[1] - 6.1, W[2] + 4.7], d: [0.3, -2.2, 1.2] },
    { t: 7.9, v: [W[0] + 0.7, W[1] - 7.0, W[2] + 5.05], d: [-0.05, -0.12, 0.05] },  // settle
    { t: 9.2, v: [W[0] + 0.62, W[1] - 7.12, W[2] + 5.1] },
  ],
  target: [
    { t: 0, v: [M[0], M[1], -36] },
    { t: 0.5, v: [M[0] + 0.1, M[1] - 0.05, -36] },
    { t: 1.55, v: [H1[0], H1[1], -36] },
    { t: T1, v: [H1[0], H1[1], -36], d: [0, 0, 0] },
    { t: 3.0, v: [0.2, 5.8, -36] },
    { t: 4.1, v: [1.8, 3.6, -22] },                                // the look swings with the turn
    { t: 4.8, v: [W[0], W[1] + 0.5, W[2]] },
    { t: T2, v: [W[0], W[1], W[2]], d: [0, 0, 0] },
    { t: 7.1, v: [W[0] - 0.4, W[1] - 1.8, W[2]] },
    { t: 9.2, v: [W[0] - 0.45, W[1] - 2.0, W[2]] },
  ],
  roll: [
    { t: 0, v: 0.25, d: -0.05 },
    { t: 0.5, v: 0.34, d: 0 },                                     // counter-roll while gathering
    { t: T1, v: -1.6 },                                            // spinning down into the face
    { t: 3.35, v: 0.12 },                                          // unrolling on the way out
    { t: 4.1, v: 0.5 },                                           // bank hard into the turn
    { t: 4.8, v: 0.22 },
    { t: T2, v: -0.08 },
    { t: 7.1, v: -0.14 },
    { t: 7.9, v: -0.04, d: 0 },
    { t: 9.2, v: -0.035 },
  ],
  fov: [                                                            // wide when fast, long when slow
    { t: 0, v: 40 }, { t: 0.5, v: 38 }, { t: 1.8, v: 54 }, { t: T1, v: 48 }, { t: 3.2, v: 56 }, { t: 4.1, v: 52 },
    { t: 5.2, v: 60 }, { t: T2, v: 48 }, { t: 6.6, v: 50 }, { t: 7.9, v: 38 }, { t: 9.2, v: 37 },
  ],
};

function build(): CardSpace {
  const cs = new CardSpace(RED);

  // ——— set 1: the desk, seen from above (a plane facing the camera) ———
  const desk = cs.set("desk", -Infinity, T1);
  cs.card(desk, outline(shapes.rect(60, 40)), INK, [0, 6, -36.06]);
  cs.card(desk, outline(shapes.disc(2.38)), RED, [M[0], M[1], -36.03]);                               // case
  cs.card(desk, outline(shapes.rect(0.55, 0.42)), RED, [M[0], M[1] + 2.55, -36.03]);                 // crown
  cs.card(desk, outline(shapes.disc(0.42), [shapes.disc(0.26)]), RED, [M[0], M[1] + 3.0, -36.03]);   // bow
  for (let i = 0; i < 9; i++) {                                                                      // chain
    const a = 0.25 + i * 0.32, r = 0.6 + i * 0.38;
    cs.card(desk, outline(shapes.disc(0.2), [shapes.disc(0.11)]), RED, [M[0] + Math.sin(a) * r * 1.6, M[1] + 3.2 + Math.cos(a * 0.7) * r, -36.03]);
  }
  cs.card(desk, outline(shapes.disc(2)), CREAM, [M[0], M[1], -36]);                                  // the face
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6, long = i % 3 === 0;
    cs.card(desk, outline(rectAt(long ? 0.13 : 0.07, long ? 0.42 : 0.26, [Math.sin(a) * 1.68, Math.cos(a) * 1.68], -a)), INK, [M[0], M[1], -35.99]);
  }
  cs.card(desk, outline(rectAt(0.14, 1.05, [0, 0.42], 0.9)), INK, [M[0], M[1], -35.985]);           // hour hand (≈10)
  cs.card(desk, outline(rectAt(0.08, 1.55, [0, 0.66], -0.95)), INK, [M[0], M[1], -35.985]);         // minute hand (≈2)
  cs.card(desk, outline(shapes.disc(0.13)), INK, [M[0], M[1], -35.98]);
  // a pencil and a ticket on the desk: flat, but they make the spin and the dive read
  cs.card(desk, outline(rectAt(0.32, 6, [0, 0], 0.5)), CREAM, [-5.2, 3.2, -36.04]);
  cs.card(desk, outline(rectAt(2.6, 1.3, [0, 0], -0.25)), RED, [5.6, 8.6, -36.04]);

  // ——— set 2: the town at night; the moon sits exactly where the face was ———
  const town = cs.set("town", T1, T2);
  cs.card(town, outline(shapes.rect(140, 90)), RED, [0, 10, -40]);
  cs.card(town, outline(shapes.disc(2)), CREAM, [M[0], M[1], -36]);
  const ridge = (w: number, base: number, seed: number, peaks: number): P2[] => {
    const pts: P2[] = [[-w / 2, base - 20]];
    for (let i = 0; i <= 40; i++) { const x = -w / 2 + w * i / 40; pts.push([x, base + 1.2 * Math.sin(i * 0.37 + seed) + 0.8 * Math.sin(i * peaks * 0.11 + seed * 2)]); }
    pts.push([w / 2, base - 20]);
    return pts;
  };
  cs.card(town, outline(ridge(160, 2.6, 1, 2)), FAR3, [0, 0, -34]);
  // rows of houses: INK silhouettes with CREAM lit windows; every row is its own depth layer (parallax)
  const row = (z: number, base: number, n: number, seed: number, lit: number, ink = INK) => {
    let s = seed;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const span = 2.2 * n;
    for (let i = 0; i < n; i++) {
      const x = -span / 2 + i * 2.2 + r() * 0.3, w = 1.5 + r() * 0.6, h = base + r() * 1.6;
      const roof: P2[] = [[-w / 2, -6], [w / 2, -6], [w / 2, h], [0, h + 0.6 + r() * 0.5], [-w / 2, h]];
      cs.card(town, outline(roof), ink, [x, 0, z]);
      if (r() < 0.35) cs.card(town, outline(shapes.rect(0.22, 0.6)), ink, [x + w * 0.25, h + 0.4, z]);   // chimney
      for (let k = 0; k < 3; k++) if (r() < lit) cs.card(town, outline(shapes.rect(0.3, 0.42)), CREAM, [x - w * 0.22 + k * w * 0.22, h * 0.45 + (k % 2) * 0.5, z + 0.01]);
    }
  };
  row(-28, 3.2, 26, 7, 0.25, FAR2);
  row(-21, 2.6, 20, 11, 0.3, FAR1);
  row(-8, 1.4, 14, 5, 0.2);
  // the near row with THE window
  row(-14, 2.2, 16, 3, 0.25);
  cs.card(town, outline(shapes.rect(1.5, 5.6)), INK, [W[0], -0.2, W[2] + 0.005]);                    // its house
  cs.card(town, outline([[-0.9, 2.6], [0.9, 2.6], [0, 3.5]]), INK, [W[0], 0, W[2] + 0.005]);
  cs.card(town, outline(shapes.rect(0.72, 0.96)), CREAM, [W[0], W[1], W[2] + 0.012]);             // the window

  // ——— set 3: the open book on a red desk; the page sits exactly where the window was ———
  const book = cs.set("book", T2, Infinity);
  cs.card(book, outline(shapes.rect(60, 40)), RED, [W[0], W[1], W[2] - 0.03]);
  cs.card(book, outline(shapes.rect(2.1, 2.8)), CREAM, [W[0], W[1], W[2]]);                         // right page ≡ window
  cs.card(book, outline(shapes.rect(2.1, 2.8)), CREAM, [W[0] - 2.16, W[1], W[2]]);                  // left page
  cs.card(book, outline(shapes.rect(4.5, 3.05)), INK, [W[0] - 1.08, W[1], W[2] - 0.015]);           // cover
  for (const side of [0, -2.16]) for (let k = 0; k < 9; k++) {                                       // type, away from the middle
    const y = 1.12 - k * 0.11 - (k > 2 ? 1.6 : 0);
    if (k > 2 && k < 6) continue;
    cs.card(book, outline(shapes.rect(1.5 - (k % 3) * 0.2, 0.04)), INK, [W[0] + side - 0.05, W[1] + y, W[2] + 0.005]);
  }
  cs.card(book, outline(rectAt(0.12, 2.6, [0, 0], 0.08)), INK, [W[0] - 0.5, W[1] + 1.6, W[2] + 0.006]); // ribbon
  cs.card(book, outline(shapes.disc(0.62)), CREAM, [W[0] + 2.6, W[1] - 0.8, W[2]]);                // tea
  cs.card(book, outline(shapes.disc(0.48)), INK, [W[0] + 2.6, W[1] - 0.8, W[2] + 0.005]);
  cs.card(book, outline(shapes.disc(0.22), [shapes.disc(0.12)]), CREAM, [W[0] + 3.28, W[1] - 0.8, W[2]]);
  // the title, set on the desk in front of the book
  const set = glyphs as GlyphSet;
  for (const [text, y] of [["MORPH", -2.2], ["MASTER", -3.25]] as const) {
    const slots = layoutText(set, text, { at: [640, 360], size: 100, tracking: 0.12 });
    for (const s of slots) cs.card(book, fromDesign(s.shape, 0.011, [640, 360]), CREAM, [W[0] - 1.1, W[1] + y, W[2] + 0.004]);
  }

  cs.path(PATH);
  return cs;
}

let cs: CardSpace | null = null;
export const scene: MorphScene = {
  id: "mm-drone-rhyme",
  title: "MM98 · 2.5D 无人机运镜 + 同形同色押韵：怀表 → 月亮 → 小镇 → 窗 → 书页",
  duration: 9.2,
  draw(ctx, t) {
    cs ??= build();
    cs.draw(ctx, t);
    ctx.font = "600 13px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = "rgba(239,230,212,.55)";
    ctx.textAlign = "right";
    ctx.fillText(t.toFixed(2).padStart(5, "0") + " s", 1232, 52);
    ctx.textAlign = "left";
  },
};
