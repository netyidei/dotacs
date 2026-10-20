// recognizer.js: the dotacs sign recognition engine.
//
// Feed it MediaPipe HandLandmarker results once per video frame and it tells you
// which sign each hand is making (with a confidence), and fires motion / two-hand
// signs as events. It has no DOM code, so it can also be tested in Node.
//
// How it decides:
//  1. Each hand is turned into soft features: every finger gets a probability of
//     being straight, the thumb a probability of being across / alongside / out,
//     directions a probability of up / down / sideways, and so on.
//  2. The rules in gestures.json are scored as a probabilistic decision list, so a
//     borderline hand gives a little weight to several signs instead of jumping
//     between them, and the best overall match wins.
//  3. Signs you taught it (SignModel) are matched by nearest neighbour on a
//     hand-shape vector measured in the palm's own frame, so they work for either
//     hand, at any distance, and override the rules where you trained.
//  4. Scores are smoothed over time and a sign only takes over when it clearly
//     beats the current one (no flicker).
//  5. Motion signs use the shape you held just before moving, soft motion scores,
//     dynamic time warping for drawn letters, and your own recorded motions.

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export const DEFAULTS = {
  smoothing: 0.55,           // landmark smoothing (0 = frozen, 1 = raw)
  handLostGraceMs: 350,
  leadHand: "auto",          // which hand spells when both are visible: auto | left | right
  stillSpeed: 0.8,           // palm lengths per second; faster than this counts as moving

  // hand shape thresholds (soft edges are built around these)
  fingerAngle: { min: 100, max: 165 },
  touch: 0.30,
  thumbAcrossOn: 0.38,
  thumbAcrossOff: 0.50,
  thumbOut: 0.85,
  spreadApart: 1.5,
  spreadDeg: 9.5,            // index and middle more than this many degrees apart = "apart"
  curvedAvg: { min: 0.15, max: 0.70 },

  // smoothing of sign scores over time
  filter: { tauMs: 140, enter: 0.40, margin: 0.15, exit: 0.22 },

  // personal model (signs you taught it)
  model: { k: 3, perLabel: 30, ruleWeight: 0.3, suppress: 0.75 },

  motion: {
    startSpeed: 1.0, stopSpeed: 0.5, stopMs: 240, minMs: 280, maxMs: 2800,
    minPath: 0.8, minSwipe: 1.0, tipWeight: 0.6,
    preShapeMs: 600, accept: 0.42, margin: 0.06, repeatBlockMs: 1800
  },
  flap: { windowMs: 1600, minCloses: 2, high: 0.65, low: 0.35, maxSpeed: 0.8, cooldownMs: 1500 },
  template: { points: 32, maxDist: 0.22, band: 6 },
  userMotion: { points: 24, sigma: 0.3 },
  pair: {
    windowMs: 1500, altRange: 0.5, altAmp: 0.25, altCorr: -0.35,
    clapAmp: 0.5, clapRange: 1.0, moveDelta: 1.0, cooldownMs: 1800,
    gapOverlap: 0.7, gapNear: 1.8
  }
};

function merge(base, over) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) && base[k] && typeof base[k] === "object"
      ? merge(base[k], v) : v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------
export const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const scale = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const unit = (a) => { const n = Math.hypot(a.x, a.y, a.z) || 1e-9; return scale(a, 1 / n); };
export const range = (a) => Math.max(...a) - Math.min(...a);
export const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);

function angleAt(a, b, c) {
  const u = sub(a, b), v = sub(c, b);
  const m = Math.hypot(u.x, u.y, u.z) * Math.hypot(v.x, v.y, v.z) || 1e-9;
  return Math.acos(Math.max(-1, Math.min(1, dot(u, v) / m))) * 180 / Math.PI;
}

function correlation(a, b) {
  const ma = mean(a), mb = mean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] - ma, y = b[i] - mb;
    num += x * y; da += x * x; db += y * y;
  }
  return num / (Math.sqrt(da * db) || 1e-9);
}

export function countSwings(vals, minAmp) {
  let lastExt = vals[0], dir = 0, count = 0;
  for (const v of vals) {
    if (dir === 0) {
      if (v - lastExt > minAmp) { dir = 1; lastExt = v; }
      else if (lastExt - v > minAmp) { dir = -1; lastExt = v; }
    } else if (dir === 1) {
      if (v > lastExt) lastExt = v;
      else if (lastExt - v > minAmp) { count++; dir = -1; lastExt = v; }
    } else {
      if (v < lastExt) lastExt = v;
      else if (v - lastExt > minAmp) { count++; dir = 1; lastExt = v; }
    }
  }
  return count;
}

// soft up / down / side from an angle in degrees (0 = right, 90 = up)
function dirDist(deg, reliable = 1) {
  const a = Math.abs(deg);
  const vertical = smooth(33, 57, a) * (1 - smooth(123, 147, a));
  const up = deg > 0 ? vertical : 0, down = deg <= 0 ? vertical : 0;
  const r = clamp01(reliable);
  return { up: up * r + (1 - r) / 3, down: down * r + (1 - r) / 3, side: (1 - up - down) * r + (1 - r) / 3 };
}
const argmax = (o) => Object.entries(o).reduce((b, e) => (e[1] > b[1] ? e : b))[0];

// ---------------------------------------------------------------------------
// Sign list (gestures.json)
// ---------------------------------------------------------------------------
const RESERVED = new Set(["motions", "pairs", "*"]);

export function normRule(r) {
  if (typeof r === "string") r = { label: r };
  const say = r.say ?? r.label;
  const kind = r.kind ?? (/^[A-Za-z]$/.test(say) ? "letter" : /^\d$/.test(say) ? "number" : "word");
  return Object.assign(r, { say, kind });
}

export function normalizeDictionary(json) {
  const dict = { star: [], keyed: [], motions: [], pairs: [], holdBySay: new Map(), all: [] };
  for (const [key, v] of Object.entries(json)) {
    if (key === "motions") { dict.motions = v.map(normRule); continue; }
    if (key === "pairs") { dict.pairs = v.map(normRule); continue; }
    const list = (Array.isArray(v) ? v : [v]).map(normRule);
    list.forEach(r => { if (!dict.holdBySay.has(r.say)) dict.holdBySay.set(r.say, r); });
    if (key === "*") { dict.star = list; continue; }
    const bits = (key.match(/[01]/g) || []).map(Number);
    if (bits.length !== 5) { console.warn("gestures.json: bad key", key); continue; }
    dict.keyed.push({ key, bits, list });
  }
  const keys = new Set(dict.keyed.map(k => k.bits.join("")));
  for (const k of dict.keyed) k.flipExists = keys.has([1 - k.bits[0], ...k.bits.slice(1)].join(""));
  dict.all = [...dict.holdBySay.values()];
  return dict;
}

// ---------------------------------------------------------------------------
// Hand features
// ---------------------------------------------------------------------------
const FINGERS = [
  ["index", [5, 6, 7, 8]],
  ["middle", [9, 10, 11, 12]],
  ["ring", [13, 14, 15, 16]],
  ["pinky", [17, 18, 19, 20]]
];
const TIPS = { index: 8, middle: 12, ring: 16, pinky: 20 };

// landmarks used for the personal-model vector, with a weight each
const VEC_POINTS = [[2, 1.0], [3, 1.3], [4, 1.6], [6, 0.7], [8, 1.0], [10, 0.7], [12, 1.0],
                    [14, 0.7], [16, 1.0], [18, 0.7], [20, 1.0]];

function dirDeg(I, a, b, vw, vh) {
  const dx = (I[b].x - I[a].x) * vw, dy = (I[b].y - I[a].y) * vh;
  return { deg: Math.atan2(-dy, dx) * 180 / Math.PI, len: Math.hypot(dx, dy), dx, dy };
}

// W: world landmarks (3D, any unit), I: image landmarks (0..1), chir: +1 right hand, -1 left hand
export function handFeatures(W, I, vw, vh, chir, cfg = DEFAULTS) {
  const palm = d3(W[0], W[9]) || 1e-6;

  // fingers: the classic joint-angle score (kept so tuned thresholds still mean the same thing)
  // plus a second opinion from the end joint and how straight the whole finger is
  const score = {}, evid = {};
  for (const [name, [mcp, pip, dip, tip]] of FINGERS) {
    const ang = angleAt(W[mcp], W[pip], W[dip]);
    let s = clamp01((ang - cfg.fingerAngle.min) / (cfg.fingerAngle.max - cfg.fingerAngle.min));
    if (d3(W[0], W[tip]) < d3(W[0], W[pip])) s *= 0.4;
    score[name] = s;
    const sDip = clamp01((angleAt(W[pip], W[dip], W[tip]) - 110) / 60);
    const chain = d3(W[mcp], W[pip]) + d3(W[pip], W[dip]) + d3(W[dip], W[tip]) || 1e-6;
    const sStraight = clamp01((d3(W[mcp], W[tip]) / chain - 0.62) / 0.3);
    evid[name] = 0.55 * s + 0.2 * sDip + 0.25 * sStraight;
  }

  // thumb touching a fingertip (the closest one wins, softly)
  const raw = {};
  let tmax = 0, pow = 0;
  for (const [name, tip] of Object.entries(TIPS)) {
    raw[name] = 1 - smooth(cfg.touch - 0.08, cfg.touch + 0.07, d3(W[4], W[tip]) / palm);
    tmax = Math.max(tmax, raw[name]);
    pow += raw[name] ** 4;
  }
  const tau = {};
  for (const k in raw) tau[k] = pow > 0 ? tmax * raw[k] ** 4 / pow : 0;
  const tsum = tmax;
  const touchDist = { none: 1 - tsum, ...tau };

  const p = {};
  for (const [name] of FINGERS) {
    let pe = smooth(0.3, 0.68, evid[name]);
    pe *= 1 - tau[name] * (1 - smooth(0.72, 0.88, score[name])); // a finger the thumb touches counts as bent
    p[name] = pe;
  }

  // thumb: across the palm / alongside the index / out to the side
  const acrossDist = Math.min(d3(W[4], W[10]), d3(W[4], W[13]), d3(W[4], W[14])) / palm;
  const pAcross = 1 - smooth(cfg.thumbAcrossOn - 0.02, cfg.thumbAcrossOff + 0.02, acrossDist);
  const outRatio = d3(W[4], W[6]) / palm;
  const pOut = (1 - pAcross) * smooth(cfg.thumbOut - 0.12, cfg.thumbOut + 0.12, outRatio);
  const thumbPosDist = { across: pAcross, side: Math.max(0, 1 - pAcross - pOut), out: pOut };
  const pThumb = 1 - pAcross;

  // thumb tip in the palm's own frame (x towards the index side, y along the palm, in palm lengths)
  const fy = unit(sub(W[9], W[0]));
  let fx = sub(W[5], W[17]);
  fx = unit(sub(fx, scale(fy, dot(fx, fy))));
  const tv = sub(W[4], W[0]);
  const tx = dot(tv, fx) / palm, ty = dot(tv, fy) / palm;
  // K: thumb pointing up between the index and middle fingers, above the knuckles
  const thumbBetween = smooth(0.98, 1.15, ty) * smooth(-0.2, -0.05, tx) * (1 - smooth(0.42, 0.6, tx));

  const vals = Object.values(score);
  const avg = mean(vals), mx = Math.max(...vals);
  const curved = smooth(cfg.curvedAvg.min - 0.06, cfg.curvedAvg.min + 0.05, avg) *
    (1 - smooth(cfg.curvedAvg.max - 0.05, cfg.curvedAvg.max + 0.06, avg)) * (1 - smooth(0.8, 0.9, mx));
  // X: index knuckle straight but the finger bent at the middle joints, other fingers curled
  const othersCurled = (1 - smooth(0.15, 0.27, score.middle)) * (1 - smooth(0.15, 0.27, score.ring)) * (1 - smooth(0.15, 0.27, score.pinky));
  const oldHook = smooth(0.14, 0.26, score.index) * (1 - smooth(0.56, 0.68, score.index));
  const idxMcpFlex = 180 - angleAt(W[0], W[5], W[6]);
  const idxPipFlex = 180 - angleAt(W[5], W[6], W[7]);
  const idxTipUp = smooth(0.7, 0.9, dot(sub(W[8], W[0]), fy) / palm);   // tip not tucked into the palm
  const newHook = (1 - smooth(32, 52, idxMcpFlex)) * smooth(42, 62, idxPipFlex) * idxTipUp;
  const hook = Math.max(oldHook, newHook) * othersCurled;
  // fingers apart or together: the sideways angle between index and middle, measured flat in
  // the palm's plane, so bending one finger more than the other does not look like spreading
  const flat = (a, b) => { const v = sub(W[b], W[a]); return Math.atan2(dot(v, fx), dot(v, fy)) * 180 / Math.PI; };
  const spreadDeg = Math.abs(flat(5, 7) - flat(9, 11));
  const spreadRatio = d3(W[8], W[12]) / (d3(W[5], W[9]) || 1e-6);
  const apart = 0.8 * smooth(cfg.spreadDeg - 3, cfg.spreadDeg + 3, spreadDeg) +
                0.2 * smooth(cfg.spreadApart - 0.2, cfg.spreadApart + 0.2, spreadRatio);

  // directions on screen; unreliable when the bone points at the camera
  const handScale = Math.hypot((I[0].x - I[9].x) * vw, (I[0].y - I[9].y) * vh) || 1;
  const dHand = dirDeg(I, 0, 9, vw, vh), dThumb = dirDeg(I, 2, 4, vw, vh), dIndex = dirDeg(I, 5, 8, vw, vh);
  const handDir = dirDist(dHand.deg, smooth(0.25, 0.55, dHand.len / handScale));
  const thumbDir = dirDist(dThumb.deg, smooth(0.18, 0.4, dThumb.len / handScale));
  const indexDir = dirDist(dIndex.deg, smooth(0.2, 0.45, dIndex.len / handScale));

  const dist = {
    thumbPos: thumbPosDist,
    touch: touchDist,
    shape: { curved, none: 1 - curved },
    hookIndex: { true: hook, false: 1 - hook },
    thumbBetween: { true: thumbBetween, false: 1 - thumbBetween },
    spread: { apart, together: 1 - apart },
    handDir, thumbDir, indexDir
  };

  const ext = { thumb: pThumb > 0.5, index: p.index > 0.5, middle: p.middle > 0.5, ring: p.ring > 0.5, pinky: p.pinky > 0.5 };
  const probs = [pThumb, p.index, p.middle, p.ring, p.pinky];
  const key = `[${probs.map(v => +(v > 0.5)).join(", ")}]`;

  return {
    key, probs, ext, dist, scores: score, touchAmount: tsum,
    thumbPos: argmax(thumbPosDist), touch: argmax(touchDist), shape: curved > 0.5 ? "curved" : "none",
    hookIndex: hook > 0.5, thumbBetween: thumbBetween > 0.5, spread: apart > 0.5 ? "apart" : "together",
    handDir: argmax(handDir), thumbDir: argmax(thumbDir), indexDir: argmax(indexDir),
    vec: shapeVector(W, I, vw, vh, chir, palm)
  };
}

// The hand measured in its own frame: x towards the thumb side, y along the palm,
// z out of the palm. Mirrored for left hands, so a left and a right hand making the
// same sign give the same numbers. Distances are in palm lengths.
export function shapeVector(W, I, vw, vh, chir, palm = d3(W[0], W[9]) || 1e-6) {
  const O = W[0];
  const Y = unit(sub(W[9], W[0]));
  let X = sub(W[5], W[17]);
  X = unit(sub(X, scale(Y, dot(X, Y))));
  const Z = scale(cross(X, Y), chir < 0 ? -1 : 1);
  const v = [];
  for (const [i, w] of VEC_POINTS) {
    const d = sub(W[i], O);
    v.push(w * dot(d, X) / palm, w * dot(d, Y) / palm, w * dot(d, Z) / palm);
  }
  // how the hand, index and thumb point on screen (x mirrored for left hands)
  for (const [a, b, w] of [[0, 9, 0.4], [5, 8, 0.3], [2, 4, 0.35]]) {
    let dx = (I[b].x - I[a].x) * vw, dy = (I[b].y - I[a].y) * vh;
    const n = Math.hypot(dx, dy) || 1;
    v.push(w * (chir < 0 ? -dx : dx) / n, w * dy / n);
  }
  return v;
}

// ---------------------------------------------------------------------------
// Scoring the rules
// ---------------------------------------------------------------------------
function featureProb(f, k, value) {
  const d = f.dist[k];
  if (d) return d[String(value)] || 0;
  return f[k] === value ? 1 : 0;
}

function whenScore(when, f) {
  let s = 1;
  for (const [k, v] of Object.entries(when)) {
    const allowed = Array.isArray(v) ? v : [v];
    let p = 0;
    for (const a of allowed) p += featureProb(f, k, a);
    s *= Math.min(1, p);
    if (s < 1e-4) return 0;
  }
  return s;
}

// The rules are a decision list (first match wins); this is the soft version of that:
// rule i gets  P(its conditions) x P(none of the earlier rules matched).
export function staticScores(dict, f) {
  const acc = new Map();
  const add = (rule, p) => {
    if (p < 1e-4) return;
    const e = acc.get(rule.say);
    if (e) { e.p += p; if (p > e.best) { e.best = p; e.rule = rule; } }
    else acc.set(rule.say, { rule, p, best: p });
  };
  let rest = 1;
  for (const r of dict.star) {
    const c = r.when ? whenScore(r.when, f) : 1;
    add(r, rest * c);
    rest *= 1 - c;
  }
  if (rest > 1e-4) {
    // When the thumb touches a fingertip, whether it counts as "out" is unclear, so rules may
    // also match with the thumb bit flipped (the old flipThumb behaviour, done softly).
    const tau = f.touchAmount || 0;
    for (const { bits, list, flipExists } of dict.keyed) {
      let P4 = rest;
      for (let i = 1; i < 5 && P4 > 1e-4; i++) P4 *= bits[i] ? f.probs[i] : 1 - f.probs[i];
      if (P4 < 1e-4) continue;
      const pm = bits[0] ? f.probs[0] : 1 - f.probs[0];
      const Kc = P4 * (pm + tau * (1 - pm));                       // rules with conditions
      const Kd = P4 * (pm + (flipExists ? 0 : tau) * (1 - pm));    // the plain default rule
      let r2 = 1;
      for (const r of list) {
        const c = r.when ? whenScore(r.when, f) : 1;
        add(r, (r.when ? Kc : Kd) * r2 * c);
        r2 *= 1 - c;
        if (r2 < 1e-4) break;
      }
    }
  }
  const res = [...acc.values()].map(e => ({ rule: e.rule, p: e.p }));
  const total = res.reduce((s, e) => s + e.p, 0);
  if (total > 1) res.forEach(e => { e.p /= total; });
  return res.sort((a, b) => b.p - a.p);
}

// ---------------------------------------------------------------------------
// Smoothing over time with a "clear winner" rule
// ---------------------------------------------------------------------------
export class LabelFilter {
  constructor(cfg = DEFAULTS.filter) { this.cfg = cfg; this.reset(); }
  reset() { this.m = new Map(); this.t = null; this.cur = null; }
  update(list, now) {
    const { tauMs, enter, margin, exit } = this.cfg;
    const a = this.t === null ? 1 : 1 - Math.exp(-Math.max(0, now - this.t) / tauMs);
    this.t = now;
    for (const v of this.m.values()) v.p *= 1 - a;
    for (const s of list) {
      const e = this.m.get(s.rule.say);
      if (e) { e.p += a * s.p; e.rule = s.rule; } else this.m.set(s.rule.say, { rule: s.rule, p: a * s.p });
    }
    let best = null;
    for (const [k, v] of this.m) {
      if (v.p < 0.005) { this.m.delete(k); continue; }
      if (!best || v.p > best.p) best = v;
    }
    let curP = this.cur ? (this.m.get(this.cur.say)?.p || 0) : 0;
    if (this.cur && curP < exit) { this.cur = null; curP = 0; }
    if (best && best.rule.say !== this.cur?.say && best.p >= enter && best.p >= curP + margin) this.cur = best.rule;
    if (this.cur) this.cur = this.m.get(this.cur.say)?.rule || this.cur;
    return { rule: this.cur, conf: this.cur ? (this.m.get(this.cur.say)?.p || 0) : 0 };
  }
  top(n = 3) {
    return [...this.m.values()].sort((a, b) => b.p - a.p).slice(0, n).map(v => ({ say: v.rule.say, p: v.p }));
  }
}

// ---------------------------------------------------------------------------
// Personal model: signs you taught it
// ---------------------------------------------------------------------------
const vdist = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
};

export class SignModel {
  constructor(json, cfg = DEFAULTS.model) {
    this.cfg = cfg;
    this.shapes = new Map();   // say -> [vector]
    this.sigma = new Map();    // say -> how far a sample may stray and still count
    this.motions = new Map();  // say -> [{ palm, tip, shape }]
    if (json) this.load(json);
  }
  get size() { return new Set([...this.shapes.keys(), ...this.motions.keys()]).size; }
  has(say) { return this.shapes.has(say) || this.motions.has(say); }

  addShape(say, vecs) {
    if (!vecs.length) return;
    const n = this.cfg.perLabel;
    const pick = vecs.length <= n ? vecs.slice() : Array.from({ length: n }, (_, i) => vecs[Math.floor(i * vecs.length / n)]);
    this.shapes.set(say, pick.map(v => Array.from(v, x => Math.round(x * 1000) / 1000)));
    this._sigma(say);
  }
  _sigma(say) {
    const arr = this.shapes.get(say);
    const nn = arr.map((a, i) => Math.min(...arr.map((b, j) => (i === j ? Infinity : vdist(a, b)))));
    const fin = nn.filter(Number.isFinite).sort((a, b) => a - b);
    const med = fin.length ? fin[fin.length >> 1] : 0.1;
    this.sigma.set(say, Math.min(0.6, Math.max(0.32, 3 * med)));
  }
  addMotion(say, tpl) {
    const list = this.motions.get(say) || [];
    list.push(tpl);
    while (list.length > 4) list.shift();
    this.motions.set(say, list);
  }
  forget(say) { this.shapes.delete(say); this.sigma.delete(say); this.motions.delete(say); }
  clear() { this.shapes.clear(); this.sigma.clear(); this.motions.clear(); }

  // similarity (0..1) of a hand vector to each trained sign
  shapeScores(vec) {
    const sims = new Map();
    let max = 0;
    for (const [say, arr] of this.shapes) {
      const ds = arr.map(v => vdist(v, vec)).sort((a, b) => a - b);
      const k = Math.min(this.cfg.k, ds.length);
      const dk = mean(ds.slice(0, k));
      const sim = Math.exp(-0.5 * (dk / this.sigma.get(say)) ** 2);
      sims.set(say, sim);
      if (sim > max) max = sim;
    }
    return { sims, max };
  }

  toJSON() {
    return {
      app: "dotacs", version: 1,
      shapes: Object.fromEntries(this.shapes),
      motions: Object.fromEntries(this.motions)
    };
  }
  load(json) {
    this.clear();
    if (!json || typeof json !== "object") return;
    for (const [say, arr] of Object.entries(json.shapes || {})) {
      if (Array.isArray(arr) && arr.length) { this.shapes.set(say, arr); this._sigma(say); }
    }
    for (const [say, list] of Object.entries(json.motions || {})) {
      if (Array.isArray(list) && list.length) this.motions.set(say, list);
    }
  }
}

// mix the rule scores with the personal model
export function fuseWithModel(list, model, vec, dict, cfg = DEFAULTS.model) {
  if (!model || !model.shapes.size) return list;
  const { sims, max } = model.shapeScores(vec);
  const out = new Map();
  for (const s of list) out.set(s.rule.say, { rule: s.rule, rp: s.p });
  for (const say of sims.keys()) {
    if (!out.has(say)) {
      const rule = dict.holdBySay.get(say) || normRule({ label: say });
      out.set(say, { rule, rp: 0 });
    }
  }
  const res = [];
  for (const [say, e] of out) {
    let p;
    if (sims.has(say)) {
      // a sign you taught: your example counts, and the rules only lose weight
      // when one of your other signs matches clearly better
      const sim = sims.get(say);
      p = Math.max(cfg.ruleWeight * e.rp + (1 - cfg.ruleWeight) * sim, e.rp * (1 - cfg.suppress * Math.max(0, max - sim)));
    } else {
      p = e.rp * (1 - cfg.suppress * max);  // a hand that looks like one of yours is probably not this
    }
    if (p > 1e-4) res.push({ rule: e.rule, p: Math.min(1, p) });
  }
  return res.sort((a, b) => b.p - a.p);
}

// ---------------------------------------------------------------------------
// Paths: resampling, template matching, dynamic time warping
// ---------------------------------------------------------------------------
const pathLen = (pts) => {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return l;
};

export function resample(pts, n) {
  const total = pathLen(pts);
  if (!(total > 0)) return null;
  const step = total / (n - 1);
  const src = pts.map(p => ({ x: p.x, y: p.y }));
  const out = [src[0]];
  let D = 0;
  for (let i = 1; i < src.length; i++) {
    const d = Math.hypot(src[i].x - src[i - 1].x, src[i].y - src[i - 1].y);
    if (d > 0 && D + d >= step) {
      const t = (step - D) / d;
      const q = { x: src[i - 1].x + t * (src[i].x - src[i - 1].x), y: src[i - 1].y + t * (src[i].y - src[i - 1].y) };
      out.push(q);
      src.splice(i, 0, q);
      D = 0;
    } else D += d;
  }
  while (out.length < n) out.push(src[src.length - 1]);
  return out.slice(0, n);
}

function normalizePath(raw, n) {
  const r = resample(raw, n);
  if (!r) return null;
  const cx = mean(r.map(p => p.x)), cy = mean(r.map(p => p.y));
  const s = Math.max(range(r.map(p => p.x)), range(r.map(p => p.y))) || 1;
  return r.map(p => ({ x: (p.x - cx) / s, y: (p.y - cy) / s }));
}

// average distance between two point sequences after the best time alignment
export function dtw(a, b, band, cost) {
  const n = a.length, m = b.length;
  const w = Math.max(band, Math.abs(n - m));
  const W = m + 1;
  const D = new Float64Array((n + 1) * W).fill(Infinity);
  D[0] = 0;
  for (let i = 1; i <= n; i++) {
    for (let j = Math.max(1, i - w); j <= Math.min(m, i + w); j++) {
      const c = cost(a[i - 1], b[j - 1]);
      D[i * W + j] = c + Math.min(D[(i - 1) * W + j], D[i * W + j - 1], D[(i - 1) * W + j - 1]);
    }
  }
  return D[n * W + m] / (n + m);
}
const ptCost = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);

function templateDistance(samples, rule, cfg) {
  const raw = samples.map(s => s[rule.track || "palm"]);
  const S = mean(samples.map(s => s.scale)) || 1;
  if (pathLen(raw) / S < 0.6) return Infinity;
  const cand = normalizePath(raw, cfg.template.points);
  if (!cand) return Infinity;
  rule._tpl = rule._tpl || normalizePath(rule.path.map(([x, y]) => ({ x, y })), cfg.template.points);
  const band = cfg.template.band;
  let d = Math.min(dtw(cand, rule._tpl, band, ptCost), mean(cand.map((p, i) => ptCost(p, rule._tpl[i]))));
  if (rule.mirrorOk !== false) {
    const mir = rule._tpl.map(p => ({ x: -p.x, y: p.y }));
    d = Math.min(d, dtw(cand, mir, band, ptCost));
  }
  return d;
}

// a motion recorded by the user, stored relative to where it started, in palm lengths
export function motionTemplate(samples, shapeSay, n = DEFAULTS.userMotion.points) {
  if (samples.length < 4) return null;
  const S = mean(samples.map(s => s.scale)) || 1;
  const t0 = samples[0].t, t1 = samples[samples.length - 1].t || t0 + 1;
  const p0 = samples[0].palm;
  const out = { palm: [], tip: [], shape: shapeSay || null, ms: Math.round(t1 - t0) };
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = t0 + (t1 - t0) * i / (n - 1);
    while (j < samples.length - 2 && samples[j + 1].t < t) j++;
    const a = samples[j], b = samples[j + 1] || a;
    const u = b.t > a.t ? clamp01((t - a.t) / (b.t - a.t)) : 0;
    const lerp = (k) => ({ x: a[k].x + u * (b[k].x - a[k].x), y: a[k].y + u * (b[k].y - a[k].y) });
    const pm = lerp("palm"), tp = lerp("writer");
    out.palm.push([+((pm.x - p0.x) / S).toFixed(3), +((pm.y - p0.y) / S).toFixed(3)]);
    out.tip.push([+((tp.x - pm.x) / S).toFixed(3), +((tp.y - pm.y) / S).toFixed(3)]);
  }
  return out;
}

function userMotionDistance(a, b, band) {
  const A = a.palm.map((p, i) => [p[0], p[1], a.tip[i][0], a.tip[i][1]]);
  const B = b.palm.map((p, i) => [p[0], p[1], b.tip[i][0], b.tip[i][1]]);
  const cost = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) + 0.6 * Math.hypot(p[2] - q[2], p[3] - q[3]);
  return dtw(A, B, band, cost);
}

// ---------------------------------------------------------------------------
// Motion analysis: soft scores for wave / shake / circle / swipe
// ---------------------------------------------------------------------------
function circleInfo(pts) {
  const cx = mean(pts.map(p => p.x)), cy = mean(pts.map(p => p.y));
  let prev = Math.atan2(pts[0].y - cy, pts[0].x - cx), total = 0, r = 0;
  for (const p of pts) {
    const a = Math.atan2(p.y - cy, p.x - cx);
    let d = a - prev;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    total += d;
    prev = a;
    r += Math.hypot(p.x - cx, p.y - cy);
  }
  return { turn: total, radius: r / pts.length };
}

export function analyzeMotion(samples, M = DEFAULTS.motion) {
  if (samples.length < 6) return null;
  const dur = samples[samples.length - 1].t - samples[0].t;
  if (dur < M.minMs) return null;
  const S = mean(samples.map(s => s.scale)) || 1;
  const pts = samples.map(s => ({ x: s.palm.x / S, y: s.palm.y / S }));
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const L = pathLen(pts);
  const rangeX = range(xs), rangeY = range(ys);
  const dx = pts[pts.length - 1].x - pts[0].x, dy = pts[pts.length - 1].y - pts[0].y;
  const net = Math.hypot(dx, dy);

  const kinds = { circle: 0, waveX: 0, shakeY: 0, swipeUp: 0, swipeDown: 0, swipeLeft: 0, swipeRight: 0 };
  let spin = null;
  const gate = smooth(M.minPath * 0.75, M.minPath * 1.1, L);
  if (gate > 0) {
    const circ = circleInfo(pts);
    const aspect = Math.min(rangeX, rangeY) / Math.max(rangeX, rangeY, 1e-6);
    kinds.circle = gate * smooth(1.15 * Math.PI, 1.55 * Math.PI, Math.abs(circ.turn)) *
      smooth(0.3, 0.45, aspect) * smooth(0.12, 0.22, circ.radius);
    spin = circ.turn > 0 ? "cw" : "ccw";
    const amps = [0.22, 0.3, 0.42];
    const swX = mean(amps.map(a => (countSwings(xs, a) >= 2 ? 1 : 0)));
    const swY = mean(amps.map(a => (countSwings(ys, a) >= 2 ? 1 : 0)));
    const notCircle = 1 - kinds.circle;
    kinds.waveX = gate * swX * smooth(1.0, 1.4, rangeX / Math.max(rangeY, 1e-6)) * notCircle;
    kinds.shakeY = gate * swY * smooth(1.0, 1.4, rangeY / Math.max(rangeX, 1e-6)) * notCircle;
    const sw = gate * smooth(0.55, 0.75, net / Math.max(L, 1e-6)) * smooth(M.minSwipe * 0.8, M.minSwipe * 1.15, net) *
      (1 - Math.max(kinds.waveX, kinds.shakeY));
    const d = dirDist(Math.atan2(-dy, dx) * 180 / Math.PI);
    kinds.swipeUp = sw * d.up;
    kinds.swipeDown = sw * d.down;
    const side = sw * d.side;
    kinds.swipeRight = dx > 0 ? side : 0;
    kinds.swipeLeft = dx > 0 ? 0 : side;
  }
  const motion = Object.values(kinds).some(v => v > 0.3) ? argmax(kinds) : "other";
  return { kinds, motion, spin, flap: "none", path: +L.toFixed(2), dur };
}

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------
const palmCenter = (I) => {
  const ids = [0, 5, 9, 13, 17];
  return { x: ids.reduce((a, i) => a + I[i].x, 0) / 5, y: ids.reduce((a, i) => a + I[i].y, 0) / 5 };
};

function ema(prev, cur, a) {
  if (!prev) return cur.map(p => ({ x: p.x, y: p.y, z: p.z || 0 }));
  return cur.map((p, i) => ({
    x: prev[i].x + a * (p.x - prev[i].x),
    y: prev[i].y + a * (p.y - prev[i].y),
    z: prev[i].z + a * ((p.z || 0) - prev[i].z)
  }));
}

function newHand(id, cfg) {
  return {
    id, active: false, present: false, lostSince: null, appearedAt: 0, lastPalm: null,
    smoothW: null, smoothI: null, chirScore: 0, chir: 1,
    filter: new LabelFilter(cfg.filter),
    buffer: [], scaleEma: 0, speedEma: 0, speed: 0, motionSpeed: 0, lastMovingAt: 0,
    motion: { active: false, samples: [], stillSince: null, startCount: 0, startT: 0 },
    fingerHist: [], flapCooldownUntil: 0,
    landmarks: null, features: null, scores: [], rule: null, conf: 0, sample: null
  };
}

export class SignEngine {
  constructor(gesturesJson, config = {}, model = null) {
    this.cfg = merge(DEFAULTS, config);
    this.dict = normalizeDictionary(gesturesJson);
    this.model = model || new SignModel(null, this.cfg.model);
    this.hands = [newHand(0, this.cfg), newHand(1, this.cfg)];
    this.pair = { buf: [], cooldownUntil: 0 };
    this.lastEvent = { say: null, t: 0 };
    this.debug = false;
  }

  // every sign in the list, for the guide and the practice game
  guideItems() {
    const seen = new Set(), items = [];
    const push = (r, how, pair = false) => {
      const id = (pair ? "pair:" : "") + how + ":" + r.say;
      if (seen.has(id)) return;
      seen.add(id);
      items.push({ say: r.say, kind: r.kind, hint: r.hint || r.label, how, pair, rule: r });
    };
    for (const r of this.dict.star) push(r, "hold");
    for (const { list } of this.dict.keyed) list.forEach(r => push(r, "hold"));
    this.dict.motions.forEach(r => push(r, "motion"));
    this.dict.pairs.forEach(r => push(r, r.when && r.when.pairMotion ? "motion" : "hold", true));
    return items;
  }

  resetHand(h) { Object.assign(h, newHand(h.id, this.cfg)); }

  // results: HandLandmarker output. Returns what is happening this frame.
  process(results, now, vw, vh) {
    const out = { events: [], segments: [] };
    this._out = out;
    const hands = this.hands;
    hands.forEach(h => { h.present = false; });

    const handed = results.handedness || results.handednesses || [];
    const dets = (results.landmarks || []).map((lm, i) => {
      const cat = handed[i] && handed[i][0];
      return {
        lm,
        world: (results.worldLandmarks && results.worldLandmarks[i]) || lm.map(p => ({ x: p.x * vw, y: p.y * vh, z: (p.z || 0) * vw })),
        pc: palmCenter(lm),
        side: cat ? (cat.categoryName || cat.displayName) : null,
        sideScore: cat ? cat.score : 0
      };
    });
    for (const { h, det } of this._assign(dets)) this._processHand(h, det, now, vw, vh);

    for (const h of hands) {
      if (!h.active || h.present) continue;
      if (h.lostSince === null) h.lostSince = now;
      if (now - h.lostSince > this.cfg.handLostGraceMs) {
        if (h.motion.active) this._finishMotion(h);
        this.resetHand(h);
        this.pair.buf.length = 0;
      }
    }

    const present = hands.filter(h => h.present);
    if (present.length === 2) this._updatePair(now, hands[0], hands[1]);

    const act = hands.filter(h => h.active);
    let rule = null, conf = 0, lead = null, pairStatic = false;
    if (act.length) {
      lead = this._pickLead(act);
      if (act.length === 2 && act[0].sample && act[1].sample) {
        const pr = this._lookupPair(this._pairFeatures(act[0], act[1]), false);
        if (pr) { rule = pr; conf = Math.min(act[0].conf || 0, act[1].conf || 0); pairStatic = true; }
      }
      if (!rule) { rule = lead.rule; conf = lead.conf; }
    }
    const moving = act.some(h => h.motion.active || h.speed > this.cfg.stillSpeed);
    return { ...out, hands: present, active: act, lead, rule, conf, pairStatic, moving };
  }

  _assign(dets) {
    const result = [], taken = new Set(), used = new Set(), cand = [];
    dets.forEach((d, i) => this.hands.forEach(h => {
      if (h.active && h.lastPalm) cand.push({ i, h, dist: Math.hypot(d.pc.x - h.lastPalm.x, d.pc.y - h.lastPalm.y) });
    }));
    cand.sort((a, b) => a.dist - b.dist);
    for (const c of cand) {
      if (used.has(c.i) || taken.has(c.h)) continue;
      used.add(c.i); taken.add(c.h);
      result.push({ h: c.h, det: dets[c.i] });
    }
    dets.forEach((d, i) => {
      if (used.has(i)) return;
      const free = this.hands.find(h => !h.active && !taken.has(h));
      if (free) { taken.add(free); result.push({ h: free, det: d }); }
    });
    return result;
  }

  _processHand(h, det, now, vw, vh) {
    const cfg = this.cfg;
    h.present = true;
    h.lostSince = null;
    h.landmarks = det.lm;
    h.lastPalm = det.pc;
    if (!h.active) { h.active = true; h.appearedAt = now; }

    // left or right hand (averaged, so one wrong guess does not flip it)
    if (det.side) {
      const s = /right/i.test(det.side) ? 1 : -1;
      h.chirScore = h.chirScore ? 0.85 * h.chirScore + 0.15 * s : s;
      h.chir = h.chirScore >= 0 ? 1 : -1;
    }

    h.smoothW = ema(h.smoothW, det.world, cfg.smoothing);
    h.smoothI = ema(h.smoothI, det.lm, cfg.smoothing);
    h.features = handFeatures(h.smoothW, h.smoothI, vw, vh, h.chir, cfg);
    let list = staticScores(this.dict, h.features);
    list = fuseWithModel(list, this.model, h.features.vec, this.dict, cfg.model);
    h.scores = list;
    const fz = h.filter.update(list, now);
    h.rule = fz.rule;
    h.conf = fz.conf;

    h.sample = this._pushSample(h, now, h.smoothI, vw, vh);
    this._updateSpeed(h);
    if (h.speed > cfg.stillSpeed || h.motion.active) h.lastMovingAt = now;
    this._updateMotion(h, now);
    this._updateFlap(h, now);
  }

  _pickLead(act) {
    if (act.length === 1) return act[0];
    const mode = this.cfg.leadHand;
    const x = (h) => (h.sample ? h.sample.palm.x : 0);
    if (mode === "left") return act.reduce((a, b) => (x(a) <= x(b) ? a : b));
    if (mode === "right") return act.reduce((a, b) => (x(a) >= x(b) ? a : b));
    return act.reduce((a, b) => (a.appearedAt <= b.appearedAt ? a : b));
  }

  _pushSample(h, now, I, vw, vh) {
    const pc = palmCenter(I);
    const scalePx = Math.hypot((I[0].x - I[9].x) * vw, (I[0].y - I[9].y) * vh) || 1;
    h.scaleEma = h.scaleEma ? h.scaleEma + 0.1 * (scalePx - h.scaleEma) : scalePx;
    const f = h.features;
    // the fingertip that "writes" (J, Z, and the on-screen trail)
    const writerId = (f.ext.pinky && !f.ext.index) ? 20 : f.ext.index ? 8 : null;
    const wp = writerId ? I[writerId] : pc;
    const disp = (p) => ({ x: (1 - p.x) * vw, y: p.y * vh });  // mirrored, so right is the user's right
    const sample = {
      t: now,
      scale: h.scaleEma,
      palm: disp(pc),
      index: disp(I[8]),
      pinky: disp(I[20]),
      writer: disp(wp),
      writerId,
      trail: { x: wp.x, y: wp.y },
      say: h.rule ? h.rule.say : null,
      shape: h.filter.top(3),
      fingers: [f.scores.index, f.scores.middle, f.scores.ring, f.scores.pinky]
    };
    h.buffer.push(sample);
    while (h.buffer.length && now - h.buffer[0].t > 4000) h.buffer.shift();
    return sample;
  }

  _updateSpeed(h) {
    const buf = h.buffer, n = buf.length;
    if (n < 2) return;
    const cur = buf[n - 1];
    let ref = buf[0];
    for (let i = n - 2; i >= 0; i--) { ref = buf[i]; if (cur.t - buf[i].t >= 100) break; }
    const dt = (cur.t - ref.t) / 1000;
    let palmV = 0, tipV = 0;
    if (dt >= 0.03) {
      palmV = Math.hypot(cur.palm.x - ref.palm.x, cur.palm.y - ref.palm.y) / cur.scale / dt;
      if (cur.writerId && cur.writerId === ref.writerId) {
        tipV = Math.hypot(cur.writer.x - ref.writer.x, cur.writer.y - ref.writer.y) / cur.scale / dt;
      }
    }
    h.speedEma += 0.5 * (palmV - h.speedEma);
    h.speed = h.speedEma;
    // drawn letters move the fingertip more than the palm
    const act = Math.max(palmV, this.cfg.motion.tipWeight * tipV);
    h.motionSpeed += 0.5 * (act - h.motionSpeed);
  }

  _updateMotion(h, now) {
    const M = this.cfg.motion, m = h.motion, speed = h.motionSpeed;
    if (now < (h.motionBlockUntil || 0)) { if (m.active) this._resetMotion(h); m.startCount = 0; return; }
    if (!m.active) {
      m.startCount = speed > M.startSpeed ? m.startCount + 1 : 0;
      if (m.startCount >= 2) {
        m.active = true;
        m.stillSince = null;
        m.samples = h.buffer.filter(s => s.t >= now - 250);
        m.startT = m.samples.length ? m.samples[0].t : now;
      }
      return;
    }
    m.samples.push(h.sample);
    if (speed < M.stopSpeed) {
      if (m.stillSince === null) m.stillSince = now;
      else if (now - m.stillSince > M.stopMs) this._finishMotion(h);
    } else m.stillSince = null;
    if (m.active && now - m.samples[0].t > M.maxMs) this._finishMotion(h);
  }

  _resetMotion(h) {
    h.motion.active = false;
    h.motion.samples = [];
    h.motion.stillSince = null;
    h.motion.startCount = 0;
  }

  // what hand shape went with a movement: mostly the shape held just before it
  _segmentShape(h, segment) {
    const t0 = segment[0].t;
    const pre = h.buffer.filter(s => s.t >= t0 - this.cfg.motion.preShapeMs && s.t < t0 - 30);
    const acc = new Map();
    const add = (samples, w) => {
      if (!samples.length || !w) return;
      for (const s of samples) for (const { say, p } of s.shape) acc.set(say, (acc.get(say) || 0) + w * p / samples.length);
    };
    add(pre, pre.length >= 3 ? 0.6 : 0);
    add(segment, pre.length >= 3 ? 0.4 : 1);
    return acc;
  }

  _finishMotion(h) {
    const m = h.motion;
    if (!m.samples.length) { this._resetMotion(h); return; }
    const endT = m.stillSince ?? m.samples[m.samples.length - 1].t;
    const segment = m.samples.filter(s => s.t <= endT);
    this._resetMotion(h);
    const mf = analyzeMotion(segment, this.cfg.motion);
    if (!mf) return;
    const shape = this._segmentShape(h, segment);
    const topShape = [...shape.entries()].sort((a, b) => b[1] - a[1])[0];
    this._out.segments.push({ hand: h, samples: segment, mf, shape, shapeSay: topShape ? topShape[0] : null });

    const cand = this._scoreMotion(mf, segment, shape);
    if (this.debug) console.log("hand", h.id, "motion", JSON.stringify(mf), cand.slice(0, 3).map(c => `${c.rule.say} ${c.p.toFixed(2)}`));
    const best = cand[0];
    if (!best || best.p < this.cfg.motion.accept) return;
    const second = cand.find(c => c.rule.say !== best.rule.say);
    if (second && best.p - second.p < this.cfg.motion.margin) return;  // too close to call
    this._emit(best.rule, h, "motion", best.p);
  }

  _scoreMotion(mf, segment, shape) {
    const cfg = this.cfg;
    const handMatch = (allowed) => {
      if (!allowed) return 1;
      const list = Array.isArray(allowed) ? allowed : [allowed];
      return Math.min(1, list.reduce((a, x) => a + (shape.get(x) || 0), 0) / 0.6);
    };
    const out = [];
    for (const r of this.dict.motions) {
      const w = r.when || {};
      if (w.flap) continue;  // handled by the finger-flap detector
      let s;
      if (r.path) {
        const d = templateDistance(segment, r, cfg);
        const lim = r.maxDist ?? cfg.template.maxDist;
        s = Number.isFinite(d) ? 1 - smooth(lim * 0.6, lim * 1.35, d) : 0;
        s *= handMatch(w.hand);
      } else {
        s = 1;
        for (const [k, v] of Object.entries(w)) {
          const allowed = Array.isArray(v) ? v : [v];
          if (k === "motion") s *= Math.min(1, allowed.reduce((a, x) => a + (mf.kinds[x] || 0), 0));
          else if (k === "hand") s *= handMatch(allowed);
          else s *= allowed.includes(mf[k]) ? 1 : 0;
        }
      }
      if (s > 0.01) out.push({ rule: r, p: s });
    }
    // motions the user recorded
    if (this.model.motions.size) {
      const tpl = motionTemplate(segment, null, cfg.userMotion.points);
      if (tpl) {
        const lenOf = (p) => { let l = 0; for (let i = 1; i < p.length; i++) l += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return l; };
        const candLen = lenOf(tpl.palm) + 0.6 * lenOf(tpl.tip);
        for (const [say, list] of this.model.motions) {
          let best = 0;
          for (const t of list) {
            // a movement of a very different size is not the same sign
            const tLen = lenOf(t.palm) + 0.6 * lenOf(t.tip);
            const ratio = Math.min(candLen, tLen) / Math.max(candLen, tLen, 1e-6);
            if (ratio < 0.3) continue;
            const ext = Math.max(0.6, range(t.palm.map(p => p[0])), range(t.palm.map(p => p[1])));
            const d = userMotionDistance(tpl, t, 5);
            const sim = Math.exp(-0.5 * (d / (cfg.userMotion.sigma * ext)) ** 2) * smooth(0.3, 0.6, ratio) *
              (t.shape ? 0.55 + 0.45 * handMatch([t.shape]) : 1);
            if (sim > best) best = sim;
          }
          if (best > 0.01) {
            const rule = this.dict.motions.find(r => r.say === say) || this.dict.pairs.find(r => r.say === say) || normRule({ label: say });
            const prev = out.find(o => o.rule.say === say);
            const p = Math.min(1, best * 1.1);
            if (prev) prev.p = Math.max(prev.p, p); else out.push({ rule, p });
          }
        }
      }
    }
    return out.sort((a, b) => b.p - a.p);
  }

  _emit(rule, h, source, p = 1) {
    const now = h && h.sample ? h.sample.t : (this.hands.find(x => x.sample)?.sample.t ?? 0);
    if (h && this.hands.some(o => o !== h && o.active && now - o.lastMovingAt < 500)) return;
    if (rule.say === this.lastEvent.say && now - this.lastEvent.t < this.cfg.motion.repeatBlockMs) { this.lastEvent.t = now; return; }
    this.lastEvent = { say: rule.say, t: now };
    this._out.events.push({ rule, hand: h, source, p });
  }

  // ----- finger flapping (bye, come here) -----
  _updateFlap(h, now) {
    const F = this.cfg.flap;
    // finger readings get noisy while the whole hand moves, so only count flaps from a steady hand
    if (h.speed > F.maxSpeed) { h.fingerHist.length = 0; return; }
    h.fingerHist.push({ t: now, s: h.sample.fingers });
    while (h.fingerHist.length && now - h.fingerHist[0].t > F.windowMs) h.fingerHist.shift();
    if (now < h.flapCooldownUntil || h.fingerHist.length < 12) return;
    const closes = [0, 1, 2, 3].map(i => {
      let state = null, c = 0;
      for (const x of h.fingerHist) {
        const v = x.s[i];
        if (v >= F.high) state = 1;
        else if (v <= F.low && state === 1) { c++; state = 0; }
      }
      return c;
    });
    const flapping = closes.map(c => c >= F.minCloses);
    let flap = null;
    if (flapping.every(Boolean)) flap = "all";
    else if (flapping[0] && closes[1] < 1 && closes[2] < 1 && closes[3] < 1) flap = "index";
    if (!flap) return;
    h.fingerHist.length = 0;
    h.flapCooldownUntil = now + F.cooldownMs;
    this._resetMotion(h);  // the flapping is the sign, not a hand movement
    h.motionBlockUntil = now + 900;
    const rule = this.dict.motions.find(r => r.when && r.when.flap === flap);
    if (rule) this._emit(rule, h, "flap");
  }

  // ----- two hands -----
  _pairFeatures(h0, h1, pairMotion = "none", sayA = null, sayB = null) {
    const a = h0.sample, b = h1.sample, P = this.cfg.pair;
    sayA = sayA ?? (h0.rule ? h0.rule.say : null);
    sayB = sayB ?? (h1.rule ? h1.rule.say : null);
    const aIsLeft = a.palm.x <= b.palm.x;
    const S = (a.scale + b.scale) / 2 || 1;
    const d = Math.hypot(a.palm.x - b.palm.x, a.palm.y - b.palm.y) / S;
    const dy = (a.palm.y - b.palm.y) / S;
    let above = "level";
    if (dy < -0.5) above = aIsLeft ? "left" : "right";
    else if (dy > 0.5) above = aIsLeft ? "right" : "left";
    return {
      left: aIsLeft ? sayA : sayB, right: aIsLeft ? sayB : sayA,
      gap: d < P.gapOverlap ? "overlap" : d < P.gapNear ? "near" : "far",
      above, pairMotion
    };
  }

  _lookupPair(pf, moving) {
    const hard = (when, f) => Object.entries(when).every(([k, v]) => (Array.isArray(v) ? v.includes(f[k]) : f[k] === v));
    for (const r of this.dict.pairs) {
      const w = r.when || {};
      if (!!w.pairMotion !== moving) continue;
      if (hard(w, pf)) return r;
      if (r.sym === false) continue;
      const sw = { ...pf, left: pf.right, right: pf.left, above: pf.above === "left" ? "right" : pf.above === "right" ? "left" : "level" };
      if (hard(w, sw)) return r;
    }
    return null;
  }

  _updatePair(now, h0, h1) {
    const P = this.cfg.pair, pair = this.pair;
    const a = h0.sample, b = h1.sample;
    const S = (a.scale + b.scale) / 2 || 1;
    pair.buf.push({
      t: now,
      d: Math.hypot(a.palm.x - b.palm.x, a.palm.y - b.palm.y) / S,
      yA: a.palm.y / S, yB: b.palm.y / S,
      sA: h0.rule ? h0.rule.say : null, sB: h1.rule ? h1.rule.say : null
    });
    while (pair.buf.length && now - pair.buf[0].t > 2500) pair.buf.shift();
    if (now < pair.cooldownUntil) return;
    const win = pair.buf.filter(s => s.t >= now - P.windowMs);
    if (win.length < 15) return;
    const yA = win.map(s => s.yA), yB = win.map(s => s.yB), d = win.map(s => s.d);

    let kind = null;
    if (range(yA) >= P.altRange && range(yB) >= P.altRange &&
        countSwings(yA, P.altAmp) >= 2 && countSwings(yB, P.altAmp) >= 2 && correlation(yA, yB) < P.altCorr) {
      kind = "alternate";
    } else if (countSwings(d, P.clapAmp) >= 2 && range(d) >= P.clapRange) {
      kind = "clap";
    } else {
      const recent = win.filter(s => s.t >= now - 700);
      if (recent.length >= 8) {
        const rd = recent.map(s => s.d);
        const delta = rd[rd.length - 1] - rd[0];
        if (Math.abs(delta) >= P.moveDelta && countSwings(rd, 0.4) === 0) kind = delta > 0 ? "apart" : "together";
      }
    }
    if (!kind) return;
    const mode = (key) => {
      const t = {};
      for (const s of win) if (s[key]) t[s[key]] = (t[s[key]] || 0) + 1;
      return Object.entries(t).sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
    };
    const pf = this._pairFeatures(h0, h1, kind, mode("sA"), mode("sB"));
    const rule = this._lookupPair(pf, true);
    if (this.debug) console.log("pair", kind, JSON.stringify(pf), "->", rule ? rule.label : "no match");
    if (rule) {
      pair.cooldownUntil = now + P.cooldownMs;
      pair.buf.length = 0;
      this._resetMotion(h0);
      this._resetMotion(h1);
      this._emit(rule, null, "pair");
    }
  }
}