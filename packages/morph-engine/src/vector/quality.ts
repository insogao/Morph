/**
 * Visual-quality signals from rendered frames (pure; works on raw RGBA, any route: vector, bitmap, 3D).
 *
 * The checks that already exist (build, seek determinism, pops) prove a morph is technically correct. The failures
 * users actually complain about are different and can be measured from pixels, against how A and B look:
 *   - "it vanished, then reappeared"    → the subject's area dips
 *   - "the colours went muddy"           → chroma dips
 *   - "the frame was one flat colour"    → a hide moment; fine for a beat, dead air if long
 * These are signals for an AI to look at, not verdicts: each flag names a time span to render densely and judge.
 */

export interface FrameStats {
  /** Share of the frame that is subject (differs from the background colour). */
  area: number;
  /** Edge pixels per frame pixel (detail: outlines, features, texture). */
  edges: number;
  /** Mean chroma of the subject (0 grey … ~0.6 vivid). */
  chroma: number;
  /** Share of the frame covered by its single most common colour, and that colour (quantised key). */
  dominant: number;
  domKey: number;
  /** Solid share of the subject at fine scale: 1 = solid shapes, low = dust / speckle (subject ÷ its closed coarse mask). */
  fill: number;
  /** Coarse silhouette (G × G/16·9 cells, 1 = subject), for comparing the in-between with A and B. */
  mask: Uint8Array;
}

export const GRID_W = 64, GRID_H = 36;

const q = (r: number, g: number, b: number) => ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);

export function frameStats(data: ArrayLike<number>, w: number, h: number): FrameStats {
  // Background per row: the average of the row's left and right ends (3 px each). Handles flat backdrops and
  // vertical gradients (skies); a subject that touches both sides is simply counted as background there.
  const all = new Map<number, number>();
  const at = (x: number, y: number) => (y * w + x) * 4;
  const bgRow = new Float32Array(h * 3);
  for (let y = 0; y < h; y++) for (let c = 0; c < 3; c++) {
    let sum = 0;
    for (let k = 0; k < 3; k++) sum += data[at(k, y) + c] + data[at(w - 1 - k, y) + c];
    bgRow[y * 3 + c] = sum / 6;
  }
  const isFg = (x: number, y: number) => { const i = at(x, y); return Math.abs(data[i] - bgRow[y * 3]) + Math.abs(data[i + 1] - bgRow[y * 3 + 1]) + Math.abs(data[i + 2] - bgRow[y * 3 + 2]) > 54; };
  let fg = 0, edges = 0, chroma = 0;
  const lum = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = at(x, y), r = data[i], g = data[i + 1], b = data[i + 2];
    lum[y * w + x] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const k = q(r, g, b);
    all.set(k, (all.get(k) ?? 0) + 1);
    if (isFg(x, y)) {
      fg++;
      chroma += (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
    }
  }
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const gx = lum[y * w + x + 1] - lum[y * w + x - 1], gy = lum[(y + 1) * w + x] - lum[(y - 1) * w + x];
    if (gx * gx + gy * gy > 24 * 24) edges++;
  }
  let dom = 0, domKey = 0;
  for (const [k, c] of all) if (c > dom) { dom = c; domKey = k; }
  // Coarse silhouette: a cell is subject when ≥ 35 % of its pixels are; then a 1-cell closing (dilate, erode) so a
  // cloud of points reads as the mass it forms. Fine fill = subject pixels ÷ pixels of the closed silhouette.
  const cw = w / GRID_W, ch = h / GRID_H, cnt = new Float32Array(GRID_W * GRID_H);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (isFg(x, y)) cnt[Math.min(GRID_H - 1, Math.floor(y / ch)) * GRID_W + Math.min(GRID_W - 1, Math.floor(x / cw))]++;
  }
  const cell = cw * ch, raw = new Uint8Array(GRID_W * GRID_H);
  for (let k = 0; k < raw.length; k++) raw[k] = cnt[k] >= 0.12 * cell ? 1 : 0;
  const morph = (src: Uint8Array, grow: boolean) => {
    const o = new Uint8Array(src.length);
    for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
      let v = grow ? 0 : 1;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy, s = X < 0 || Y < 0 || X >= GRID_W || Y >= GRID_H ? 0 : src[Y * GRID_W + X];
        v = grow ? v | s : v & s;
      }
      o[y * GRID_W + x] = v;
    }
    return o;
  };
  const mask = morph(morph(raw, true), false);
  let closedPx = 0, inPx = 0;
  for (let k = 0; k < mask.length; k++) if (mask[k]) { closedPx += cell; inPx += cnt[k]; }
  return { area: fg / (w * h), edges: edges / (w * h), chroma: fg ? chroma / fg : 0, dominant: dom / (w * h), domKey, fill: closedPx ? inPx / closedPx : 1, mask };
}

export interface QualityFlag { kind: "vanish" | "muddy" | "flat-fill"; from: number; to: number; worst: number; note: string }

/** Intersection over union of two coarse silhouettes. */
export function iou(a: Uint8Array, b: Uint8Array): number {
  let i = 0, u = 0;
  for (let k = 0; k < a.length; k++) { i += a[k] & b[k]; u += a[k] | b[k]; }
  return u ? i / u : 1;
}

const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : 0; };

/**
 * Compare every in-between frame with the states around it. References are the nearest HOLDS (stretches where the
 * picture is still) before and after each frame, so a sequence A → B → C is judged step by step, and a payoff that
 * moves the subject afterwards doesn't count. With no holds at all (a continuous camera move), the first and last
 * frames are used. A flag needs `minFrames` consecutive offending samples, so one fast frame doesn't trip it.
 *
 * Not included, on purpose: a "blob" detector. Silhouette IoU, solidity and roundness were all tried on rendered
 * frames and could not separate the rejected planet → rocket dust (blind test B3) from accepted morphs (MM16, MM02,
 * MM04): any morph between different shapes resembles neither end mid-way. Blobs are judged by eye on dense frames.
 */
export function qualityFlags(times: number[], stats: FrameStats[], opts: { minFrames?: number; holdChange?: number } = {}): { flags: QualityFlag[]; holds: Array<[number, number]> } {
  const n = times.length, minF = opts.minFrames ?? 3, still = opts.holdChange ?? 0.006;
  // Holds: consecutive samples whose coarse silhouette and colour barely change.
  const change = (i: number) => {
    if (i === 0) return 0;
    let d = 0;
    for (let k = 0; k < stats[i].mask.length; k++) d += stats[i].mask[k] ^ stats[i - 1].mask[k];
    return d / stats[i].mask.length + Math.abs(stats[i].chroma - stats[i - 1].chroma) + Math.abs(stats[i].area - stats[i - 1].area);
  };
  const isStill = times.map((_, i) => change(i) < still);
  const holds: Array<[number, number]> = [];
  for (let i = 0; i < n;) {
    if (!isStill[i]) { i++; continue; }
    let j = i;
    while (j + 1 < n && isStill[j + 1]) j++;
    if (j - i + 1 >= 3) holds.push([i, j]);
    i = j + 1;
  }
  const summary = (from: number, to: number) => {
    const list = stats.slice(from, to + 1);
    return { area: median(list.map(s => s.area)), chroma: median(list.map(s => s.chroma)), domKey: list[0].domKey };
  };
  const before = (i: number) => { const h = [...holds].reverse().find(([, b]) => b < i); return h ? summary(h[0], h[1]) : summary(0, Math.min(n - 1, 2)); };
  const after = (i: number) => { const h = holds.find(([a]) => a > i); return h ? summary(h[0], h[1]) : summary(Math.max(0, n - 3), n - 1); };
  const inHold = (i: number) => holds.some(([a, b]) => i >= a && i <= b);
  // A hide moment: a colour that is neither side's backdrop fills the frame.
  const isFill = (i: number) => { const s = stats[i], A = before(i), B = after(i); return s.dominant > 0.92 && s.domKey !== A.domKey && s.domKey !== B.domKey; };
  const tests: Array<{ kind: QualityFlag["kind"]; bad: (i: number) => number; note: string }> = [
    { kind: "flat-fill", bad: i => isFill(i) ? stats[i].dominant : 0, note: "one colour fills the frame (a hide moment: fine for ~0.3 s, dead air when long)" },
    { kind: "vanish", bad: i => { if (inHold(i)) return 0; const s = stats[i], lo = Math.min(before(i).area, after(i).area); return !isFill(i) && lo > 0.01 && s.area < 0.55 * lo ? 1 - s.area / lo : 0; }, note: "the subject shrinks away, then comes back (a change should carry through, not disappear and reappear)" },
    { kind: "muddy", bad: i => { if (inHold(i)) return 0; const s = stats[i], lo = Math.min(before(i).chroma, after(i).chroma); return !isFill(i) && s.area > 0.003 && lo > 0.12 && s.chroma < 0.6 * lo ? 1 - s.chroma / lo : 0; }, note: "colours go grey/muddy mid-way (mix in OKLab; don't cross-fade two different colours or stack translucent layers)" },
  ];
  const flags: QualityFlag[] = [];
  for (const t of tests) {
    let start = -1, worst = 0;
    for (let i = 0; i <= n; i++) {
      const v = i < n ? t.bad(i) : 0;
      if (v > 0) { if (start < 0) start = i; worst = Math.max(worst, v); continue; }
      if (start >= 0 && i - start >= (t.kind === "flat-fill" ? 1 : minF)) {
        const dur = times[i - 1] - times[start];
        if (t.kind !== "flat-fill" || dur > 0.45) flags.push({ kind: t.kind, from: times[start], to: times[i - 1], worst: Math.round(worst * 100) / 100, note: t.kind === "flat-fill" ? t.note + ` — here ${dur.toFixed(2)} s` : t.note });
      }
      start = -1; worst = 0;
    }
  }
  return { flags: flags.sort((x, y) => x.from - y.from), holds: holds.map(([a, b]) => [times[a], times[b]] as [number, number]) };
}
