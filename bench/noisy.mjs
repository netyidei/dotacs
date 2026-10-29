import fs from "fs";
import { POSES, buildHand, toResults, srand, rr, rnd } from "./synth.mjs";
import { OldEngine } from "./old.mjs";
import { SignEngine } from "../recognizer.js";
const json = JSON.parse(fs.readFileSync(new URL("../gestures.json", import.meta.url)));
const N = +process.argv[2] || 40, FR = 40, WARM = 12;
const LEVEL = { flex: +(process.argv[3] ?? 9), abd: 4, thumb: 0.006, world: 0.003, image: 0.004, rot: 1 };
srand(7);
const tot = { old: { ok: 0, wrong: 0, unk: 0, flips: 0 }, neu: { ok: 0, wrong: 0, unk: 0, flips: 0 } };
const per = {};
for (const [name, pose] of Object.entries(POSES)) {
  per[name] = { old: 0, neu: 0, n: 0, oldWrong: {}, newWrong: {} };
  for (let s = 0; s < N; s++) {
    const old = new OldEngine(json), eng = new SignEngine(JSON.parse(JSON.stringify(json)), JSON.parse(process.env.CFG || '{}'));
    const P = buildHand(pose, { flex: LEVEL.flex, abd: LEVEL.abd, thumb: LEVEL.thumb });
    const base = pose.view || {};
    const view = { roll: (base.roll || 0) + rr(-18, 18) * LEVEL.rot, yaw: (base.yaw || 0) + rr(-25, 25) * LEVEL.rot,
      pitch: rr(-20, 20) * LEVEL.rot, k: rr(2.4, 4.5), left: rnd() < 0.3, cx: rr(0.35, 0.65), cy: rr(0.45, 0.6) };
    let lastO = null, lastN = null;
    for (let f = 0; f < FR; f++) {
      const r = toResults(P, view, { world: LEVEL.world, image: LEVEL.image });
      const o = old.process(r, f * 33, 640, 480).rule;
      const n = eng.process(r, f * 33, 640, 480).rule;
      if (f < WARM) { lastO = o?.say; lastN = n?.say; continue; }
      for (const [k, v, last] of [["old", o, lastO], ["neu", n, lastN]]) {
        const t = tot[k];
        if (!v) t.unk++; else if (v.say === pose.say) t.ok++; else { t.wrong++; const w = k === "old" ? per[name].oldWrong : per[name].newWrong; w[v.say] = (w[v.say] || 0) + 1; }
        if ((v?.say ?? null) !== last) t.flips++;
      }
      if (o?.say === pose.say) per[name].old++;
      if (n?.say === pose.say) per[name].neu++;
      per[name].n++;
      lastO = o?.say ?? null; lastN = n?.say ?? null;
    }
  }
}
const pct = (a, b) => (100 * a / b).toFixed(1).padStart(5) + "%";
for (const [name, r] of Object.entries(per)) {
  const top = (w) => Object.entries(w).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => `${k}:${(100 * v / r.n).toFixed(0)}%`).join(" ");
  console.log(name.padEnd(5), "old", pct(r.old, r.n), "  new", pct(r.neu, r.n), "   old confuses:", top(r.oldWrong).padEnd(18), " new confuses:", top(r.newWrong));
}
for (const k of ["old", "neu"]) {
  const t = tot[k], all = t.ok + t.wrong + t.unk;
  console.log(k === "old" ? "OLD" : "NEW", "correct", pct(t.ok, all), " wrong", pct(t.wrong, all), " unknown", pct(t.unk, all), " label changes per 100 frames", (100 * t.flips / all).toFixed(1));
}
