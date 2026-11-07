import type { Vec2 } from "./geom";
import type { Cam } from "./rhyme";

/**
 * Coupled camera moves with momentum (pure, testable).
 *
 * Lesson from title design (and the user's critique of MM95–97 v1): a move is not "push → stop → hand-off → stop →
 * pull". Every channel — zoom, roll, position — runs on its own curve, the curves OVERLAP, and at no moment are all
 * of them still. A push gathers itself (a small pull-back first), accelerates, and brakes into the rhyme; the roll is
 * at full speed exactly when the zoom brakes; the pull-out overshoots a little and settles.
 */

export interface Key { t: number; v: number; /** Slope (value per second). Default: Catmull-Rom from the neighbours; 0 at the ends. */ d?: number }

/** Cubic Hermite curve through keys (C¹: no velocity jumps). Held constant outside the keys. */
export function curve(keys: readonly Key[]): (t: number) => number {
  const k = [...keys].sort((a, b) => a.t - b.t);
  const slope = (i: number) => {
    if (k[i].d !== undefined) return k[i].d!;
    if (i === 0 || i === k.length - 1) return 0;
    return (k[i + 1].v - k[i - 1].v) / (k[i + 1].t - k[i - 1].t);
  };
  const d = k.map((_, i) => slope(i));
  return (t: number) => {
    if (t <= k[0].t) return k[0].v;
    if (t >= k[k.length - 1].t) return k[k.length - 1].v;
    let i = 0;
    while (t > k[i + 1].t) i++;
    const h = k[i + 1].t - k[i].t, u = (t - k[i].t) / h, u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * k[i].v + (u3 - 2 * u2 + u) * h * d[i] + (-2 * u3 + 3 * u2) * k[i + 1].v + (u3 - u2) * h * d[i + 1];
  };
}

export type MoveStyle = "swing" | "dive";

export interface MovePlan {
  home: Cam;
  /** Where the rhyme is held (swing) or the cover point (dive). */
  peak: Cam;
  end: Cam;
  /** Seconds: go (end of the anticipation), peak, land (end of the overshoot), settle. */
  times: { go: number; peak: number; land: number; settle: number; end?: number };
  style?: MoveStyle;
  /** Extra bank at the rhyme moment, radians; it unwinds by the end (B lands upright). Default 0. */
  swing?: number;
  /** Anticipation: how far the camera gathers back before the push, as a fraction of the zoom range (log). Default 0.06. */
  anticipation?: number;
  /**
   * Overshoot of the pull-out, as a fraction of its zoom range (log). Default 0: pulling out PAST B's framing shows the
   * edge of B's drawing. Use it only when B bleeds beyond the frame; the roll overshoots regardless.
   */
  overshoot?: number;
}

export interface Move { camAt(t: number): Cam }

/** Zoom about a fixed point: the centre for zoom z, given a reference camera and the fixed world point F. */
const centreFor = (F: Vec2, ref: Cam, z: number): Vec2 => [F[0] - (F[0] - ref.c[0]) * ref.zoom / z, F[1] - (F[1] - ref.c[1]) * ref.zoom / z];
const fixedPoint = (a: Cam, b: Cam): Vec2 | null => Math.abs(b.zoom - a.zoom) < 1e-6 * a.zoom ? null
  : [(b.zoom * b.c[0] - a.zoom * a.c[0]) / (b.zoom - a.zoom), (b.zoom * b.c[1] - a.zoom * a.c[1]) / (b.zoom - a.zoom)];

export function planMove(p: MovePlan): Move {
  const { go, peak, land, settle } = p.times, end = Math.max(settle + 0.01, p.times.end ?? settle + 1.5);
  const zH = Math.log(p.home.zoom), zP = Math.log(p.peak.zoom), zE = Math.log(p.end.zoom);
  const dive = p.style === "dive";
  const antic = (p.anticipation ?? 0.06) * (zP - zH), over = (p.overshoot ?? 0) * (zE - zP);
  const pushSpan = peak - go, pullSpan = land - peak;
  // Zoom (log): drift, gather back, accelerate late, brake into the peak; pull out fast first, settle.
  // A dive is a sharp V: it arrives at full speed and leaves at full speed, so the frame is filled by the rhyme's
  // colour for only a beat (the hide moment) — a long flat field of colour reads as dead air.
  const keys = dive ? [
    { t: 0, v: zH, d: 0 },
    { t: go * 0.55, v: zH + 0.25 * antic },
    { t: go, v: zH - antic, d: 0 },
    { t: peak - 0.2, v: zP - 0.16 * (zP - zH), d: 2.6 * (zP - zH) / pushSpan },
    { t: peak, v: zP, d: 0 },
    { t: peak + 0.2, v: zP - 0.16 * (zP - zE), d: 2.4 * (zE - zP) / pullSpan },
    { t: land, v: zE + over, d: 0 },
  ] : [
    { t: 0, v: zH, d: 0 },
    { t: go * 0.55, v: zH + 0.25 * antic },                  // a slow drift in: the camera is never parked
    { t: go, v: zH - antic, d: 0 },
    { t: go + 0.62 * pushSpan, v: zH + 0.7 * (zP - zH), d: 1.7 * (zP - zH) / pushSpan },
    { t: peak, v: zP, d: 0 },
    { t: peak + 0.38 * pullSpan, v: zP + 0.72 * (zE - zP), d: 1.5 * (zE - zP) / pullSpan },
    { t: land, v: zE + over, d: 0 },
  ];
  const logZoom = curve([
    ...keys,
    { t: settle, v: zE, d: 0.012 },
    { t: end, v: zE + 0.012 * (end - settle), d: 0.012 },  // the hold keeps creeping in: never parked
  ]);
  // swing: an extra bank that peaks at the rhyme moment and unwinds by the end (the frame always lands upright on B).
  const aH = p.home.angle, aE = p.end.angle, total = aE - aH, sw = p.swing ?? 0;
  const sgn = Math.sign(total || sw) || 1;
  // The bank peaks a beat AFTER the rhyme moment, so the roll is still fast exactly when the zoom brakes.
  const bankAt = peak + 0.3 * pullSpan;
  const angle = Math.abs(total) + Math.abs(sw) < 1e-3 ? () => aH : curve([
    { t: 0, v: aH, d: 0 },
    { t: go, v: aH - sgn * Math.min(0.06, 0.08 * Math.abs(total + sw)), d: 0 },
    { t: peak, v: aH + 0.5 * total + 0.75 * sw, d: (0.5 * total + 1.4 * sw) / (bankAt - go) * 1.6 },
    { t: bankAt, v: aH + 0.62 * total + sw, d: total / pullSpan },
    { t: land, v: aE + sgn * Math.min(0.05, 0.06 * Math.abs(total)), d: 0 },
    { t: settle, v: aE, d: 0 },
  ]);
  const FA = fixedPoint(p.home, p.peak), FB = fixedPoint(p.end, p.peak);
  return {
    camAt(t: number): Cam {
      const a = angle(t), base = Math.exp(logZoom(t));
      let c: Vec2;
      if (t <= peak) c = FA ? centreFor(FA, p.home, base) : p.peak.c;
      else c = FB ? centreFor(FB, p.end, base) : p.peak.c;
      // A rolled frame shows the corners of a drawing that exactly fills it: zoom in (about the screen centre) just
      // enough to keep the rotated frame inside the drawing it frames — home before the peak, end after. The
      // compensation fades to nothing at the peak (the rhyme fills the frame there), so it never jumps.
      const s01 = (x: number) => { const v = Math.max(0, Math.min(1, x)); return v * v * (3 - 2 * v); };
      const weight = t <= peak ? 1 - s01(t / peak) : s01((t - peak) / (land - peak));
      const phi = Math.min(0.6, Math.abs(a - (t <= peak ? p.home.angle : p.end.angle))) * weight;
      const z = base * (Math.cos(phi) + (1280 / 720) * Math.sin(phi));
      return { c, zoom: z, angle: a };
    },
  };
}

/** Screen displacement (px) of the frame corners between two cameras — how much motion blur a sample interval needs. */
export function cameraMotion(a: Cam, b: Cam, frame: Vec2 = [1280, 720]): number {
  const toWorld = (cam: Cam, s: Vec2): Vec2 => {
    const x = (s[0] - frame[0] / 2) / cam.zoom, y = (s[1] - frame[1] / 2) / cam.zoom, c = Math.cos(cam.angle), si = Math.sin(cam.angle);
    return [cam.c[0] + c * x - si * y, cam.c[1] + si * x + c * y];
  };
  const toScreen = (cam: Cam, w: Vec2): Vec2 => {
    const x = w[0] - cam.c[0], y = w[1] - cam.c[1], c = Math.cos(-cam.angle), si = Math.sin(-cam.angle);
    return [frame[0] / 2 + cam.zoom * (c * x - si * y), frame[1] / 2 + cam.zoom * (si * x + c * y)];
  };
  let m = 0;
  for (const s of [[0, 0], [frame[0], 0], [0, frame[1]], frame, [frame[0] / 2, frame[1] / 2]] as Vec2[]) {
    const q = toScreen(b, toWorld(a, s));
    m = Math.max(m, Math.hypot(q[0] - s[0], q[1] - s[1]));
  }
  return m;
}
