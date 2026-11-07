// Trace transparent PNG layers into vector outlines (marching squares on the alpha channel).
//
//   npx tsx tools/trace-layers.ts --out lab/<id>/layers.json [--scale 0.6667] [--copy lab/<id>/img] name=path.png …
//
// Every layer is traced at the alpha = 50% iso-line, simplified, and mapped into design space
// by `--scale` (1920 × 1080 art → 1280 × 720 design is 2/3). With `--copy`, the PNGs are copied
// next to the scene so it can draw the painted texture on top of the traced geometry.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { PNG } from "pngjs";

type P = [number, number];
const { positionals, values } = parseArgs({ allowPositionals: true, options: {
  out: { type: "string" }, scale: { type: "string", default: String(2 / 3) }, copy: { type: "string" },
  step: { type: "string", default: "2" }, tolerance: { type: "string", default: "0.8" }, "min-area": { type: "string", default: "120" },
} });
if (!values.out || !positionals.length) throw new Error("Usage: npx tsx tools/trace-layers.ts --out file.json [--copy dir] name=layer.png …");
const scale = Number(values.scale), step = Number(values.step), tol = Number(values.tolerance), minArea = Number(values["min-area"]);

/** Marching squares on a down-sampled alpha grid; returns closed loops in pixel coordinates. */
function trace(png: PNG): P[][] {
  const W = Math.floor(png.width / step), H = Math.floor(png.height / step);
  const a = new Float32Array((W + 2) * (H + 2));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0;
    for (let dy = 0; dy < step; dy++) for (let dx = 0; dx < step; dx++) s += png.data[((y * step + dy) * png.width + x * step + dx) * 4 + 3];
    a[(y + 1) * (W + 2) + x + 1] = s / (step * step * 255); // 1-cell transparent border closes every loop
  }
  const v = (x: number, y: number) => a[y * (W + 2) + x];
  const lerpEdge = (x0: number, y0: number, x1: number, y1: number): P => {
    const va = v(x0, y0), vb = v(x1, y1), t = Math.abs(vb - va) < 1e-9 ? 0.5 : (0.5 - va) / (vb - va);
    return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
  };
  const next = new Map<string, P[]>();
  const key = (p: P) => p[0].toFixed(4) + "," + p[1].toFixed(4);
  const seg = (p: P, q: P) => { const k = key(p); (next.get(k) ?? next.set(k, []).get(k)!).push(q); };
  for (let y = 0; y < H + 1; y++) for (let x = 0; x < W + 1; x++) {
    const c = (v(x, y) > 0.5 ? 8 : 0) | (v(x + 1, y) > 0.5 ? 4 : 0) | (v(x + 1, y + 1) > 0.5 ? 2 : 0) | (v(x, y + 1) > 0.5 ? 1 : 0);
    if (c === 0 || c === 15) continue;
    const T = () => lerpEdge(x, y, x + 1, y), R = () => lerpEdge(x + 1, y, x + 1, y + 1), B = () => lerpEdge(x, y + 1, x + 1, y + 1), L = () => lerpEdge(x, y, x, y + 1);
    // Segments oriented so the inside is on a consistent side; saddles split by the centre value.
    const centre = (v(x, y) + v(x + 1, y) + v(x + 1, y + 1) + v(x, y + 1)) / 4 > 0.5;
    switch (c) {
      case 1: seg(L(), B()); break; case 2: seg(B(), R()); break; case 3: seg(L(), R()); break;
      case 4: seg(R(), T()); break; case 6: seg(B(), T()); break; case 7: seg(L(), T()); break;
      case 8: seg(T(), L()); break; case 9: seg(T(), B()); break; case 11: seg(T(), R()); break;
      case 12: seg(R(), L()); break; case 13: seg(R(), B()); break; case 14: seg(B(), L()); break;
      case 5: if (centre) { seg(L(), T()); seg(R(), B()); } else { seg(L(), B()); seg(R(), T()); } break;
      case 10: if (centre) { seg(B(), L()); seg(T(), R()); } else { seg(T(), L()); seg(B(), R()); } break;
    }
  }
  const loops: P[][] = [];
  for (const [start, list] of next) {
    while (list.length) {
      const loop: P[] = [];
      let p = list.pop()!;
      const first = start;
      loop.push(start.split(",").map(Number) as P);
      for (let guard = 0; guard < 1e6; guard++) {
        loop.push(p);
        const k = key(p);
        if (k === first) break;
        const outs = next.get(k);
        if (!outs?.length) break;
        p = outs.pop()!;
      }
      if (loop.length > 3) loops.push(loop.slice(0, -1));
    }
  }
  return loops.map(l => l.map(([x, y]) => [(x - 1 + 0.5) * step, (y - 1 + 0.5) * step] as P));
}

/** Ramer–Douglas–Peucker on a closed loop. */
function simplify(loop: P[], eps: number): P[] {
  const rdp = (pts: P[]): P[] => {
    if (pts.length < 3) return pts;
    const [a, b] = [pts[0], pts[pts.length - 1]];
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    let worst = 0, at = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = Math.abs((pts[i][0] - a[0]) * dy - (pts[i][1] - a[1]) * dx) / len;
      if (d > worst) { worst = d; at = i; }
    }
    return worst > eps ? [...rdp(pts.slice(0, at + 1)).slice(0, -1), ...rdp(pts.slice(at))] : [a, b];
  };
  // Split at the point farthest from the first, so both halves are open chains.
  let far = 0;
  for (let i = 1; i < loop.length; i++) if (Math.hypot(loop[i][0] - loop[0][0], loop[i][1] - loop[0][1]) > Math.hypot(loop[far][0] - loop[0][0], loop[far][1] - loop[0][1])) far = i;
  return [...rdp(loop.slice(0, far + 1)).slice(0, -1), ...rdp([...loop.slice(far), loop[0]]).slice(0, -1)];
}

const area = (r: P[]) => Math.abs(r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);

const layers: Record<string, { rings: P[][]; file?: string; size: [number, number] }> = {};
if (values.copy) mkdirSync(values.copy, { recursive: true });
for (const arg of positionals) {
  const [name, path] = arg.split("=");
  if (!name || !path) throw new Error("Layers are name=path.png, got " + arg);
  const png = PNG.sync.read(readFileSync(path));
  const rings = trace(png).map(l => simplify(l, tol * step)).filter(r => r.length >= 3 && area(r) * scale * scale >= minArea)
    .map(r => r.map(([x, y]) => [Math.round(x * scale * 100) / 100, Math.round(y * scale * 100) / 100] as P));
  let file: string | undefined;
  if (values.copy) { file = name + ".png"; copyFileSync(path, join(values.copy, file)); }
  layers[name] = { rings, file, size: [png.width, png.height] };
  console.error(name + ": " + rings.length + " ring(s), " + rings.reduce((s, r) => s + r.length, 0) + " points");
}
mkdirSync(dirname(values.out), { recursive: true });
writeFileSync(values.out, JSON.stringify({ scale, source: positionals.map(p => basename(p.split("=")[1])), layers }) + "\n");
console.log(values.out);
