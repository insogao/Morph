// One entry point for the Morph Master workflow.
//
//   npx tsx tools/mm.ts <command> [args…]
//
//   inspect <files…>                diagnose material, route to a guide            (tools/inspect.ts)
//   suggest <a.svg> <b.svg>         draft a part mapping                           (tools/suggest-map.ts)
//   rhyme <A> <B>                   rank shape rhymes, shape × colour              (tools/rhyme.ts)
//   profile <lab/id/scene.ts>       drone-path speed profile, stall flags          (tools/camera-profile.ts)
//   frames <id> <t…>                contact strip of chosen times                  (tools/frames.mjs)
//   pops <id>                       jumps at 60 fps                                (tools/pops.mjs)
//   check <id>                      seek determinism                               (tools/visual-check.mjs)
//   qc <id…>                        visual-quality signals (vanish, muddy, long fills)  (tools/qc.ts)
//   gif <id…>                       GIF previews                                   (tools/gif.mjs)
//   export <id>                     offline HTML deliverable
//   verify <id> [--material novel|known] [--note "…"]
//                                   build + tests + check + pops + qc → lab/<id>/eval.json (a checkpoint)
//   review <id> pass|fail "<notes>" record the human/visual verdict in lab/<id>/eval.json
//   status                          the eval table for every scene that has one
//
// eval.json keeps the four claims apart — they are different and none implies the next:
//   code (build + tests) · playback (deterministic, no pops) · quality (qc signals; empty ≠ good) ·
//   visual (a person or an AI LOOKED at dense frames) · generalisation (was the material new to the skill?)
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [cmd, ...args] = process.argv.slice(2);
const run = (bin: string, argv: string[], capture = false) => {
  const r = spawnSync(bin, argv, { stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit", encoding: "utf8" });
  return { ok: r.status === 0, out: (r.stdout ?? "") + (r.stderr ?? ""), stdout: r.stdout ?? "" };
};
const tsx = (file: string, argv: string[], capture = false) => run("npx", ["tsx", file, ...argv], capture);
const node = (file: string, argv: string[], capture = false) => run("node", [file, ...argv], capture);

interface Eval {
  id: string; updated: string;
  code?: { ok: boolean; tests: string };
  playback?: { deterministic: boolean; pops: string[] };
  quality?: { flags: Array<{ kind: string; from: number; to: number; note: string }>; holds: Array<[number, number]> };
  visual?: { verdict: "pass" | "fail"; notes: string; at: string; fingerprint?: string };
  generalisation?: { material: "novel" | "known"; note?: string };
}
const evalPath = (id: string) => join("lab", id, "eval.json");
const load = (id: string): Eval => existsSync(evalPath(id)) ? JSON.parse(readFileSync(evalPath(id), "utf8")) : { id, updated: "" };
const save = (e: Eval) => { e.updated = new Date().toISOString(); writeFileSync(evalPath(e.id), JSON.stringify(e, null, 2) + "\n"); };
/** Fingerprint of a scene's own files (not eval.json): a visual verdict is only valid for the version that was looked at. */
const fingerprint = (id: string) => {
  const h = createHash("sha1");
  const walk = (dir: string) => { for (const e of readdirSync(dir, { withFileTypes: true }).sort((x, y) => x.name.localeCompare(y.name))) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p); else if (e.name !== "eval.json") h.update(p).update(readFileSync(p));
  } };
  walk(join("lab", id));
  return h.digest("hex").slice(0, 12);
};
const visualState = (e: Eval) => !e.visual ? "NOT REVIEWED" : e.visual.fingerprint && e.visual.fingerprint !== fingerprint(e.id) ? "STALE (" + e.visual.verdict + " was given to an older version)" : e.visual.verdict;
const flag = (name: string) => { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : undefined; };

switch (cmd) {
  case "inspect": process.exit(tsx("tools/inspect.ts", args).ok ? 0 : 1);
  case "suggest": process.exit(tsx("tools/suggest-map.ts", args).ok ? 0 : 1);
  case "rhyme": process.exit(tsx("tools/rhyme.ts", args).ok ? 0 : 1);
  case "profile": process.exit(tsx("tools/camera-profile.ts", args).ok ? 0 : 1);
  case "frames": process.exit(node("tools/frames.mjs", args).ok ? 0 : 1);
  case "pops": process.exit(node("tools/pops.mjs", args).ok ? 0 : 1);
  case "check": process.exit(node("tools/visual-check.mjs", args).ok ? 0 : 1);
  case "qc": process.exit(tsx("tools/qc.ts", args).ok ? 0 : 1);
  case "gif": process.exit(node("tools/gif.mjs", args).ok ? 0 : 1);
  case "export": process.exit(node("tools/export.mjs", [...args, "--html-only"]).ok ? 0 : 1);

  case "verify": {
    const id = args[0];
    if (!id || !existsSync(join("lab", id))) throw new Error("Usage: mm verify <lab scene id> [--material novel|known] [--note …]");
    const e = load(id);
    console.log("· build + tests");
    const build = run("npm", ["run", "build"], true), tests = run("npm", ["test"], true);
    const pass = tests.out.match(/ℹ pass (\d+)/)?.[1] ?? "?", fail = tests.out.match(/ℹ fail (\d+)/)?.[1] ?? "?";
    e.code = { ok: build.ok && tests.ok, tests: pass + " pass, " + fail + " fail" };
    save(e);                                                    // checkpoint: a long verify can be resumed
    console.log("· seek determinism");
    const check = node("tools/visual-check.mjs", [id], true);
    console.log("· pops");
    const pops = node("tools/pops.mjs", [id], true);
    e.playback = { deterministic: check.ok && /PASS/.test(check.out), pops: pops.out.split("\n").filter(l => /pop at/.test(l)).map(l => l.trim()) };
    save(e);
    console.log("· quality signals");
    const qc = tsx("tools/qc.ts", [id, "--json"], true);
    const parsed = JSON.parse(qc.stdout.slice(qc.stdout.indexOf("{")))[id];
    e.quality = { flags: parsed.flags, holds: parsed.holds };
    if (flag("material")) e.generalisation = { material: flag("material") as "novel" | "known", note: flag("note") };
    save(e);
    console.log(JSON.stringify({ code: e.code, playback: e.playback, quality: e.quality.flags.map(f => `${f.kind} ${f.from.toFixed(2)}–${f.to.toFixed(2)}`), visual: visualState(e) === e.visual?.verdict ? e.visual!.verdict : visualState(e) + " — look at dense frames, then: mm review " + id + " pass|fail \"…\"" }, null, 2));
    process.exit(e.code.ok && e.playback.deterministic ? 0 : 1);
  }

  case "review": {
    const [id, verdict, ...notes] = args;
    if (!id || !["pass", "fail"].includes(verdict)) throw new Error('Usage: mm review <id> pass|fail "what you saw"');
    const e = load(id);
    e.visual = { verdict: verdict as "pass" | "fail", notes: notes.join(" "), at: new Date().toISOString(), fingerprint: fingerprint(id) };
    save(e);
    console.log(evalPath(id) + ": visual " + verdict);
    break;
  }

  case "status": {
    const rows = readdirSync("lab").filter(d => existsSync(evalPath(d))).map(d => load(d));
    console.log("scene".padEnd(24) + "code   playback      quality       visual   material");
    for (const e of rows) {
      const play = e.playback ? (e.playback.deterministic ? "det" : "NON-DET") + (e.playback.pops.length ? " pops:" + e.playback.pops.length : " clean") : "—";
      const q = e.quality ? (e.quality.flags.length ? e.quality.flags.map(f => f.kind).join(",") : "no flags") : "—";
      console.log(e.id.padEnd(24) + (e.code ? (e.code.ok ? "ok" : "FAIL") : "—").padEnd(7) + play.padEnd(14) + q.slice(0, 13).padEnd(14) + (e.visual ? (visualState(e).startsWith("STALE") ? "stale" : e.visual.verdict) : "—").padEnd(9) + (e.generalisation?.material ?? "—"));
    }
    break;
  }

  default:
    console.log(readFileSync(new URL(import.meta.url), "utf8").split("\n").filter(l => l.startsWith("//")).map(l => l.slice(3)).join("\n"));

}
