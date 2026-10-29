// Moving Kazakh signs (letters such as Ә, Қ, Ң and phrases such as Сәлеметсіз бе) on simulated hands.
// Run from the project folder:  node bench/kazakh_motion.mjs 20
import fs from "fs";
import { buildHand, toResults, srand, rr, rnd, FIST } from "./synth.mjs";
import { SignEngine } from "../recognizer.js";
import { KK_POSES } from "./kazakh.mjs";
const json = JSON.parse(fs.readFileSync(new URL("../gestures.json", import.meta.url)));
const N = +process.argv[2] || 20;
srand(2026);
const TAU = Math.PI * 2;
const polyline = (pts) => (u) => {
  const segs = []; let tot = 0;
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segs.push(l); tot += l; }
  let d = u * tot;
  for (let i = 0; i < segs.length; i++) {
    if (d <= segs[i] || i === segs.length - 1) { const t = segs[i] ? Math.min(1, d / segs[i]) : 0; return [pts[i][0] + t * (pts[i + 1][0] - pts[i][0]), pts[i][1] + t * (pts[i + 1][1] - pts[i][1])]; }
    d -= segs[i];
  }
};
const pathOf = (say) => { const r = json.kk.motions.find(m => m.say === say); return polyline(r.path.map(([x, y]) => [-x, y])); };
const wave = { path: (A, c) => (u) => [A * Math.sin(TAU * c * u), 0], A: [0.5, 0.8], c: [2, 3], ms: [900, 1500] };
const shake = { path: (A, c) => (u) => [0, A * Math.sin(TAU * c * u)], A: [0.35, 0.6], c: [2, 3], ms: [800, 1300] };
const circle = { path: (A, c) => (u) => [A * Math.cos(TAU * c * u) - A, A * Math.sin(TAU * c * u)], A: [0.55, 0.9], c: [1.0, 1.3], ms: [900, 1500] };
const down = { path: (A) => (u) => [0.15 * A * u, A * u], A: [1.2, 1.8], c: [1, 1], ms: [450, 800] };
const up = { path: (A) => (u) => [0.1 * A * u, -A * u], A: [1.2, 1.8], c: [1, 1], ms: [450, 800] };
const draw = (say) => ({ path: (A) => (u) => pathOf(say)(u).map(v => v * A), A: [1.1, 1.6], c: [1, 1], ms: [700, 1300] });

const MOTIONS = {
  "Ә": { pose: "А", ...wave }, "Ғ": { pose: "Г", ...wave }, "Қ": { pose: "К", ...shake }, "Ң": { pose: "Н", ...wave },
  "Ө": { pose: "О", ...wave }, "Ү": { pose: "У", ...wave }, "Ұ": { pose: "У", ...down }, "Һ": { pose: "Х", ...wave },
  "Ё": { pose: "Е", ...wave }, "Й": { pose: "И", ...shake }, "Ц": { pose: "Б", ...down }, "Щ": { pose: "Ш", ...down },
  "Ъ": { pose: "Ь", ...wave }, "З": { pose: "1", ...draw("З") }, "Д": { pose: "Б", ...draw("Д") },
  "Сәлеметсіз бе": { pose: "5", ...wave }, "Иә": { pose: "Е", ...shake }, "Жоқ": { pose: "1", ...wave },
  "Өтінемін": { pose: "В", ...circle }, "Кешіріңіз": { pose: "Е", ...circle }, "Рақмет": { pose: "В", ...down },
  "Су": { pose: "Ш", ...shake }, "Тамақ": { pose: "О", ...shake }, "Ішу": { pose: "С", ...up },
  "Қарным ашты": { pose: "С", ...down }, "Кім?": { pose: "1", ...circle },
  "Сау болыңыз": { pose: "5", flap: "all", ms: [900, 1300] }, "Келіңіз": { pose: "1", flap: "index", ms: [900, 1300] }
};

function run(def) {
  const pose = KK_POSES[def.pose];
  const eng = new SignEngine(json, { lang: "kk" });
  const P = buildHand(pose, { flex: 6, abd: 3, thumb: 0.004 });
  const fist = buildHand({ ...pose, fingers: def.flap === "all" ? {} : { ...pose.fingers, index: FIST } }, { flex: 4, abd: 2, thumb: 0.003 });
  const b = pose.view || {}, k = rr(2.6, 4.2);
  const view = { roll: (b.roll || 0) + rr(-15, 15), yaw: (b.yaw || 0) + rr(-20, 20), pitch: rr(-15, 15), k, left: rnd() < 0.3, cx: 0.5, cy: 0.5 };
  const palmImg = 0.092 * k, aspect = 640 / 480, ms = rr(...def.ms);
  const A = def.A ? rr(...def.A) : 0, c = def.c ? rr(...def.c) : 1, path = def.path ? def.path(A, c) : null;
  const PRE = 600, POST = 700, events = [];
  for (let t = 0; t <= PRE + ms + POST; t += 33) {
    let dx = 0, dy = 0, H = P, moving = false;
    const u = (t - PRE) / ms;
    if (u >= 0 && u <= 1) {
      moving = true;
      if (path) [dx, dy] = path(u);
      else H = Math.sin(TAU * 2 * u - Math.PI / 2) * -1 < 0 ? fist : P;
    } else if (u > 1 && path) [dx, dy] = path(1);
    const v = { ...view, cx: 0.5 + dx * palmImg / aspect, cy: 0.5 + dy * palmImg };
    const r = toResults(H, v, moving ? { world: 0.005, image: 0.006 } : { world: 0.003, image: 0.004 });
    for (const ev of eng.process(r, t, 640, 480).events) events.push(ev.rule.say);
  }
  return events;
}

let ok = 0, all = 0;
for (const [say, def] of Object.entries(MOTIONS)) {
  let hit = 0;
  const wrong = {};
  for (let i = 0; i < N; i++) {
    const ev = run(def);
    if (ev.length === 1 && ev[0] === say) hit++;
    else { const k = ev.length ? ev.join("+") : "(nothing)"; wrong[k] = (wrong[k] || 0) + 1; }
  }
  ok += hit; all += N;
  const top = Object.entries(wrong).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => `${k} ${v}/${N}`).join(", ");
  console.log(say.padEnd(16), `${hit}/${N}`.padStart(6), top ? "  instead: " + top : "");
}
console.log("ALL".padEnd(16), (100 * ok / all).toFixed(1) + "%");
