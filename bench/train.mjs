import fs from "fs";
import { POSES, buildHand, toResults, srand, rr, rnd, gauss } from "./synth.mjs";
import { OldEngine } from "./old.mjs";
import { SignEngine, SignModel } from "../recognizer.js";
const json = JSON.parse(fs.readFileSync(new URL("../gestures.json", import.meta.url)));
const PEOPLE = 6, TESTS = 12, FR = 40, WARM = 12;
srand(99);
// a person's habit for a pose: a fixed deviation from the textbook shape
function habit(pose, amt) {
  const p = JSON.parse(JSON.stringify(pose));
  for (const k of Object.keys(p.fingers)) p.fingers[k] = p.fingers[k].map(x => x + amt * 12 * gauss());
  for (const k of ["index", "middle", "ring", "pinky"]) if (!p.fingers[k]) p.fingers[k] = [85 + amt * 10 * gauss(), 100 + amt * 10 * gauss(), 65];
  if (Array.isArray(p.thumb)) p.thumb = p.thumb.map(x => x + amt * 0.009 * gauss());
  const sp = p.spread === true ? { index: 12, middle: 0, ring: -10, pinky: -20 } : typeof p.spread === "object" ? p.spread : { index: 2, middle: 0, ring: -2, pinky: -5 };
  p.spread = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, v + amt * 4 * gauss()]));
  return p;
}
const randView = (pose) => {
  const b = pose.view || {};
  return { roll: (b.roll || 0) + rr(-18, 18), yaw: (b.yaw || 0) + rr(-25, 25), pitch: rr(-20, 20), k: rr(2.4, 4.5), cx: rr(0.35, 0.65), cy: rr(0.45, 0.6) };
};
const J = { flex: 4, abd: 2, thumb: 0.003 }, NOISE = { world: 0.003, image: 0.004 };
const res = { old: [0, 0], none: [0, 0], trained: [0, 0] };
const CFG = JSON.parse(process.env.CFG || "{}"); const errs = {};
for (let person = 0; person < PEOPLE; person++) {
  const left = person % 3 === 2;   // some people sign left-handed
  const habits = Object.fromEntries(Object.entries(POSES).map(([k, p]) => [k, habit(p, 1)]));
  // teach: about 2 seconds per sign
  const model = new SignModel(null, { k: 3, perLabel: 30, ruleWeight: 0.3, suppress: 0.75, ...(CFG.model || {}) });
  for (const [name, pose] of Object.entries(habits)) {
    if (process.env.PARTIAL && Object.keys(habits).indexOf(name) % 2) continue;
    const eng = new SignEngine(JSON.parse(JSON.stringify(json)));
    const P = buildHand(pose, J), view = { ...randView(pose), left };
    const vecs = [];
    for (let f = 0; f < 60; f++) {
      eng.process(toResults(P, view, NOISE), f * 33, 640, 480);
      if (f >= 6) vecs.push(eng.hands[0].features.vec);
    }
    model.addShape(pose.say, vecs);
  }
  for (const [name, pose] of Object.entries(habits)) {
    for (let t = 0; t < TESTS; t++) {
      const P = buildHand(pose, J), view = { ...randView(pose), left };
      const old = new OldEngine(json.en || json);
      const e0 = new SignEngine(JSON.parse(JSON.stringify(json)));
      const e1 = new SignEngine(JSON.parse(JSON.stringify(json)), CFG, model);
      for (let f = 0; f < FR; f++) {
        const r = toResults(P, view, NOISE);
        const a = old.process(r, f * 33, 640, 480).rule, b = e0.process(r, f * 33, 640, 480).rule, c = e1.process(r, f * 33, 640, 480).rule;
        if (f < WARM) continue;
        for (const [k, v] of [["old", a], ["none", b], ["trained", c]]) { res[k][1]++; if (v && v.say === pose.say) res[k][0]++; else if (k === "trained") { const key = pose.say + "->" + (v ? v.say : "?"); errs[key] = (errs[key] || 0) + 1; } }
      }
    }
  }
}
for (const [k, [ok, n]] of Object.entries(res)) console.log(k.padEnd(8), (100 * ok / n).toFixed(1) + "% correct");

if (process.env.ERRS) console.log(Object.entries(errs).sort((a,b)=>b[1]-a[1]).slice(0,10));
