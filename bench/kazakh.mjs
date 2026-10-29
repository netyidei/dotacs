// Accuracy test for the Kazakh hand shapes (static letters and held words) on simulated hands.
// Run from the project folder:  node bench/kazakh.mjs 60
import fs from "fs";
import { buildHand, toResults, srand, rr, rnd, EXT, FIST, CURVE, OCURVE, HOOK, BENT } from "./synth.mjs";
import { SignEngine } from "../recognizer.js";
const json = JSON.parse(fs.readFileSync(new URL("../gestures.json", import.meta.url)));

const T_OUT = [0.088, 0.055, 0.012], T_SIDE = [0.044, 0.074, 0.03], T_ACROSS_FIST = [0.0, 0.074, 0.06];
const T_ACROSS_PALM = [-0.012, 0.068, 0.016], T_HOLD = [-0.006, 0.07, 0.055];
const VSPREAD = { index: 13, middle: -6, ring: -4, pinky: -8 };
const KNUCKLE = [85, 5, 5];   // finger bent 90 degrees at the knuckle, otherwise straight
const DOWN = { roll: 180 };

// the Kazakh letters as poses (u = thumb side, v = along the fingers, n = out of the palm)
export const KK_POSES = {
  "А": { fingers: {}, thumb: T_SIDE },
  "Б": { fingers: { index: EXT, middle: EXT }, thumb: T_HOLD },
  "В": { fingers: { index: EXT, middle: EXT, ring: EXT, pinky: EXT }, thumb: T_ACROSS_PALM },
  "Г": { fingers: { index: EXT }, thumb: [0.095, 0.035, 0.0], view: DOWN },
  "Е": { fingers: {}, thumb: T_ACROSS_FIST },
  "Ж": { fingers: { index: KNUCKLE, middle: KNUCKLE, ring: KNUCKLE, pinky: KNUCKLE }, thumb: { touch: "index" } },
  "И": { fingers: { ring: EXT, pinky: EXT }, thumb: T_HOLD },
  "К": { fingers: { index: EXT, middle: EXT }, spread: VSPREAD, thumb: T_HOLD },
  "Л": { fingers: { index: EXT, middle: EXT }, spread: VSPREAD, thumb: T_HOLD, view: DOWN },
  "М": { fingers: { index: EXT, middle: EXT, ring: EXT, pinky: [80, 95, 60] }, spread: true, thumb: { touch: "pinky" }, view: DOWN },
  "Н": { fingers: { index: EXT, middle: EXT, ring: BENT, pinky: EXT }, spread: true, thumb: { touch: "ring" } },
  "О": { fingers: { index: OCURVE, middle: OCURVE, ring: OCURVE, pinky: OCURVE }, thumb: { touch: "index" } },
  "П": { fingers: { index: EXT, middle: EXT }, thumb: T_HOLD, view: DOWN },
  "Р": { fingers: { index: EXT, middle: BENT, ring: EXT, pinky: EXT }, spread: true, thumb: { touch: "middle" } },
  "С": { fingers: { index: CURVE, middle: CURVE, ring: CURVE, pinky: CURVE }, thumb: [0.07, 0.085, 0.07] },
  "Т": { fingers: { index: EXT, middle: EXT, ring: EXT, pinky: [80, 95, 60] }, thumb: { touch: "pinky" }, view: DOWN },
  "У": { fingers: { pinky: EXT }, spread: true, thumb: T_OUT },
  "Х": { fingers: { index: HOOK }, thumb: T_HOLD },
  "Ч": { fingers: { index: KNUCKLE, middle: KNUCKLE }, thumb: { touch: "index" } },
  "Ш": { fingers: { index: EXT, middle: EXT, ring: EXT, pinky: [80, 95, 60] }, spread: true, thumb: { touch: "pinky" } },
  "Ы": { fingers: { index: EXT, pinky: EXT }, spread: true, thumb: T_HOLD },
  "І": { fingers: { pinky: EXT }, thumb: T_HOLD },
  "Ь": { fingers: { index: EXT }, thumb: [0.095, 0.035, 0.0] },
  "Э": { fingers: { index: EXT }, thumb: [0.06, 0.09, 0.015], view: { roll: 90 } },
  "1": { fingers: { index: EXT }, thumb: T_HOLD },
  "4": { fingers: { index: EXT, middle: EXT, ring: EXT, pinky: EXT }, spread: true, thumb: T_ACROSS_PALM },
  "5": { fingers: { index: EXT, middle: EXT, ring: EXT, pinky: EXT }, spread: true, thumb: T_OUT },
  "Жақсы": { fingers: {}, thumb: [0.036, 0.168, 0.0], view: { roll: 0, yaw: 70 } },
  "Сені жақсы көремін": { fingers: { index: EXT, pinky: EXT }, spread: true, thumb: T_OUT }
};

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const N = +process.argv[2] || 40, FR = 40, WARM = 12;
  const LEVEL = { flex: 9, abd: 4, thumb: 0.006, world: 0.003, image: 0.004 };
  srand(11);
  let ok = 0, all = 0;
  for (const [say, pose] of Object.entries(KK_POSES)) {
    let hit = 0, n = 0;
    const wrong = {};
    for (let s = 0; s < N; s++) {
      const eng = new SignEngine(json, { lang: "kk" });
      const P = buildHand(pose, { flex: LEVEL.flex, abd: LEVEL.abd, thumb: LEVEL.thumb });
      const b = pose.view || {};
      const view = { roll: (b.roll || 0) + rr(-18, 18), yaw: (b.yaw || 0) + rr(-25, 25), pitch: rr(-20, 20),
        k: rr(2.4, 4.5), left: rnd() < 0.3, cx: rr(0.35, 0.65), cy: rr(0.45, 0.6) };
      for (let f = 0; f < FR; f++) {
        const r = eng.process(toResults(P, view, { world: LEVEL.world, image: LEVEL.image }), f * 33, 640, 480).rule;
        if (f < WARM) continue;
        n++;
        if (r && r.say === say) hit++;
        else { const k = r ? r.say : "(none)"; wrong[k] = (wrong[k] || 0) + 1; }
      }
    }
    ok += hit; all += n;
    const top = Object.entries(wrong).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => `${k} ${(100 * v / n).toFixed(0)}%`).join(", ");
    console.log(say.padEnd(20), (100 * hit / n).toFixed(1).padStart(5) + "%", top ? "  confused with: " + top : "");
  }
  console.log("ALL".padEnd(20), (100 * ok / all).toFixed(1).padStart(5) + "%");
}
