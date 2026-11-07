// Print a drone path's speed profile, so "hesitant" moves are caught BEFORE rendering.
//
//   npx tsx tools/camera-profile.ts lab/<id>/scene.ts      (the scene must export PATH: CameraKeys)
//
// Columns: speed (world units/s), perceived speed (speed ÷ distance to what it looks at), turn (°/s of the view
// direction), roll (°/s), fov. Flags: stalls (perceived speed collapsing mid-move), long gathers, long holds.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { curve } from "../packages/morph-engine/src/vector/camera-move";
import type { CameraKeys } from "../packages/morph-engine/src/renderers/card-space";

const file = process.argv[2];
if (!file) throw new Error("Usage: npx tsx tools/camera-profile.ts lab/<id>/scene.ts");
const { PATH } = await import(pathToFileURL(resolve(file)).href) as { PATH: CameraKeys };
const ax = (keys: CameraKeys["pos"]) => [0, 1, 2].map(k => curve(keys.map(q => ({ t: q.t, v: q.v[k], d: q.d?.[k] }))));
const P = ax(PATH.pos), G = ax(PATH.target), R = curve(PATH.roll ?? [{ t: 0, v: 0 }]), F = curve(PATH.fov ?? [{ t: 0, v: 40 }]);
const at = (t: number) => ({ p: P.map(f => f(t)), g: G.map(f => f(t)), r: R(t), f: F(t) });
const end = Math.max(...PATH.pos.map(k => k.t)), dt = 0.02, rows: Array<{ t: number; v: number; rel: number }> = [];
console.log("    t  speed  perceived   turn°/s  roll°/s  fov");
for (let t = 0; t <= end + 1e-9; t += 0.2) {
  const a = at(t), b = at(t + dt);
  const v = Math.hypot(...a.p.map((x, i) => b.p[i] - x)) / dt;
  const da = a.g.map((x, i) => x - a.p[i]), db = b.g.map((x, i) => x - b.p[i]), dist = Math.hypot(...da);
  const turn = Math.acos(Math.min(1, da.reduce((s, x, i) => s + x * db[i], 0) / dist / Math.hypot(...db))) * 180 / Math.PI / dt;
  const roll = (b.r - a.r) * 180 / Math.PI / dt, rel = v / Math.max(0.05, dist) + turn / 60 + Math.abs(roll) / 120;
  rows.push({ t, v, rel });
  console.log(t.toFixed(1).padStart(5), v.toFixed(1).padStart(6), rel.toFixed(2).padStart(9), turn.toFixed(0).padStart(9), roll.toFixed(0).padStart(8), a.f.toFixed(0).padStart(5), " " + "#".repeat(Math.min(40, Math.round(rel * 8))));
}
// A stall: perceived motion drops below a third of its neighbours' and they are both moving.
// Keys whose velocity is explicitly zero are intended brakes (a hide moment): stalls next to them are fine.
const brakes = PATH.pos.filter(k => k.d && k.d.every(x => x === 0)).map(k => k.t);
const warn: string[] = [];
for (let i = 2; i < rows.length - 2; i++) {
  const n = (rows[i - 2].rel + rows[i + 2].rel) / 2;
  if (n > 0.8 && rows[i].rel < n / 3 && !brakes.some(b => Math.abs(b - rows[i].t) < 0.3)) warn.push("stall at " + rows[i].t.toFixed(1) + " s (a turn taken by stopping? sweep it sideways)");
}
const still = rows.filter(r => r.rel < 0.08);
if (still.length * 0.2 > 1.6) warn.push("still for " + (still.length * 0.2).toFixed(1) + " s in total (holds longer than ~1.3 s read as hesitation)");
console.log(warn.length ? "\n" + warn.join("\n") : "\nno stalls");
