// The ORIGINAL recognition code from index.html (before this rewrite), copied as-is
// into a small harness so it can be compared on the same synthetic data.
const CONFIG = {
  smoothing: 0.55, stableFrames: 4, fingerAngle: { min: 100, max: 165 }, fingerOn: 0.60, fingerOff: 0.35,
  thumbAcrossOn: 0.38, thumbAcrossOff: 0.50, thumbOut: 0.85, touch: 0.30, spreadApart: 1.5,
  curvedAvg: { min: 0.15, max: 0.70 },
  motion: { startSpeed: 1.0, stopSpeed: 0.5, stopMs: 220, minMs: 280, maxMs: 2600, minPath: 0.8, swingAmp: 0.3,
    minCircleTurn: 1.5 * Math.PI, minSwipe: 1.0, repeatBlockMs: 1800 },
  flap: { windowMs: 1600, minCloses: 2, high: 0.65, low: 0.35, maxSpeed: 0.8, cooldownMs: 1500 },
  template: { points: 32, maxDist: 0.22 }
};
const RESERVED = new Set(["motions", "pairs"]);
function normRule(r) {
  if (typeof r === "string") r = { label: r };
  const say = r.say ?? r.label;
  const kind = r.kind ?? (/^[A-Za-z]$/.test(say) ? "letter" : /^\d$/.test(say) ? "number" : "word");
  return Object.assign(r, { say, kind });
}
function normalizeDictionary(dict) {
  const motions = (dict.motions || []).map(normRule);
  const pairs = (dict.pairs || []).map(normRule);
  for (const key of Object.keys(dict)) {
    if (RESERVED.has(key)) continue;
    const v = dict[key];
    dict[key] = (Array.isArray(v) ? v : [v]).map(normRule);
  }
  dict.motions = motions; dict.pairs = pairs;
  return dict;
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
function angleAt(a, b, c) {
  const ux = a.x - b.x, uy = a.y - b.y, uz = a.z - b.z;
  const vx = c.x - b.x, vy = c.y - b.y, vz = c.z - b.z;
  const dot = ux * vx + uy * vy + uz * vz;
  const mag = Math.hypot(ux, uy, uz) * Math.hypot(vx, vy, vz) || 1e-9;
  return Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180 / Math.PI;
}
function dirOf(I, a, b, vw, vh) {
  const dx = (I[b].x - I[a].x) * vw, dy = (I[b].y - I[a].y) * vh;
  const deg = Math.atan2(-dy, dx) * 180 / Math.PI;
  if (deg > 45 && deg < 135) return "up";
  if (deg < -45 && deg > -135) return "down";
  return "side";
}
function ema(prev, cur, a) {
  if (!prev) return cur.map(p => ({ x: p.x, y: p.y, z: p.z || 0 }));
  return cur.map((p, i) => ({ x: prev[i].x + a * (p.x - prev[i].x), y: prev[i].y + a * (p.y - prev[i].y), z: prev[i].z + a * ((p.z || 0) - prev[i].z) }));
}
function hyst(state, name, value, low, high) {
  if (value > high) state[name] = true; else if (value < low) state[name] = false;
  return !!state[name];
}
const range = (a) => Math.max(...a) - Math.min(...a);
const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const FINGERS = { index: [5, 6, 7, 8], middle: [9, 10, 11, 12], ring: [13, 14, 15, 16], pinky: [17, 18, 19, 20] };
const TIPS = { index: 8, middle: 12, ring: 16, pinky: 20 };

function extractFeatures(h, W, I, vw, vh) {
  const palm = d3(W[0], W[9]) || 1e-6;
  const score = {};
  for (const [name, [mcp, pip, dip, tip]] of Object.entries(FINGERS)) {
    const ang = angleAt(W[mcp], W[pip], W[dip]);
    let s = clamp01((ang - CONFIG.fingerAngle.min) / (CONFIG.fingerAngle.max - CONFIG.fingerAngle.min));
    if (d3(W[0], W[tip]) < d3(W[0], W[pip])) s *= 0.4;
    score[name] = s;
  }
  let touch = "none", best = CONFIG.touch;
  for (const [name, tip] of Object.entries(TIPS)) {
    const dd = d3(W[4], W[tip]) / palm;
    if (dd < best) { best = dd; touch = name; }
  }
  const ext = {};
  for (const name of Object.keys(FINGERS)) ext[name] = hyst(h.hyst, "f_" + name, score[name], CONFIG.fingerOff, CONFIG.fingerOn);
  if (touch !== "none" && score[touch] < 0.8) ext[touch] = false;
  const acrossDist = Math.min(d3(W[4], W[10]), d3(W[4], W[13]), d3(W[4], W[14])) / palm;
  const across = hyst(h.hyst, "thumbAcross", -acrossDist, -CONFIG.thumbAcrossOff, -CONFIG.thumbAcrossOn);
  const outRatio = d3(W[4], W[6]) / palm;
  const thumbPos = across ? "across" : (outRatio > CONFIG.thumbOut ? "out" : "side");
  ext.thumb = thumbPos !== "across";
  const thumb = ext.thumb ? 1 : 0;
  const vals = Object.values(score);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const shape = (avg > CONFIG.curvedAvg.min && avg < CONFIG.curvedAvg.max && Math.max(...vals) < 0.85) ? "curved" : "none";
  const hookIndex = score.index > 0.2 && score.index < 0.62 && score.middle < 0.2 && score.ring < 0.2 && score.pinky < 0.2;
  const spreadRatio = d3(W[8], W[12]) / (d3(W[5], W[9]) || 1e-6);
  const spread = spreadRatio > CONFIG.spreadApart ? "apart" : "together";
  const key = `[${thumb}, ${+ext.index}, ${+ext.middle}, ${+ext.ring}, ${+ext.pinky}]`;
  return { key, thumbPos, touch, shape, hookIndex, spread, ext,
    handDir: dirOf(I, 0, 9, vw, vh), thumbDir: dirOf(I, 2, 4, vw, vh), indexDir: dirOf(I, 5, 8, vw, vh), _scores: score };
}
function matches(when, f) { return Object.entries(when).every(([k, v]) => Array.isArray(v) ? v.includes(f[k]) : f[k] === v); }
function flipThumb(key) { return key.slice(0, 1) + (key[1] === "1" ? "0" : "1") + key.slice(2); }

export class OldEngine {
  constructor(json) {
    this.dict = normalizeDictionary(JSON.parse(JSON.stringify(json)));
    this.reset();
  }
  reset() {
    this.h = { hyst: {}, smoothW: null, smoothI: null, buffer: [], scaleEma: 0, speedEma: 0,
      motion: { active: false, samples: [], stillSince: null, startCount: 0 }, fingerHist: [], flapCooldownUntil: 0 };
    this.shownState = null; this.shownRule = null; this.pendingState = null; this.pendingCount = 0;
    this.lastEvent = { label: null, t: 0 };
    this.events = [];
  }
  rulesOf(k) { return this.dict[k] || []; }
  lookupGesture(f) {
    const keys = [f.key];
    if (f.touch !== "none") keys.push(flipThumb(f.key));
    for (const r of this.rulesOf("*")) if (r.when && matches(r.when, f)) return r;
    for (const k of keys) for (const r of this.rulesOf(k)) if (r.when && matches(r.when, f)) return r;
    for (const r of this.rulesOf(f.key)) if (!r.when) return r;
    return null;
  }
  commit(state, rule) {
    if (state === this.shownState) { this.pendingState = null; this.pendingCount = 0; return; }
    if (state !== this.pendingState) { this.pendingState = state; this.pendingCount = 1; } else this.pendingCount++;
    if (this.shownState === null || this.pendingCount >= CONFIG.stableFrames) {
      this.shownState = state; this.shownRule = rule; this.pendingState = null; this.pendingCount = 0;
    }
  }
  // one frame; returns the shown rule (or null) and any motion events
  process(results, now, vw, vh) {
    this.events = [];
    const lm = results.landmarks[0];
    if (!lm) { this.commit("none", null); return { rule: null, events: [] }; }
    const h = this.h;
    h.smoothW = ema(h.smoothW, results.worldLandmarks[0], CONFIG.smoothing);
    h.smoothI = ema(h.smoothI, lm, CONFIG.smoothing);
    h.features = extractFeatures(h, h.smoothW, h.smoothI, vw, vh);
    h.rule = this.lookupGesture(h.features);
    const sample = this.pushSample(h, now, h.smoothI, vw, vh, h.rule ? h.rule.say : null, h.features);
    const speed = this.updateSpeed(h);
    this.updateMotion(h, now, sample, speed);
    this.updateFlap(h, now, sample, speed);
    this.commit(h.rule ? h.rule.label : "unknown", h.rule);
    return { rule: this.shownRule, events: this.events };
  }
  pushSample(h, now, I, vw, vh, say, features) {
    const ids = [0, 5, 9, 13, 17];
    const pc = { x: ids.reduce((a, i) => a + I[i].x, 0) / 5, y: ids.reduce((a, i) => a + I[i].y, 0) / 5 };
    const scalePx = Math.hypot((I[0].x - I[9].x) * vw, (I[0].y - I[9].y) * vh) || 1;
    h.scaleEma = h.scaleEma ? h.scaleEma + 0.1 * (scalePx - h.scaleEma) : scalePx;
    const sc = features._scores;
    const sample = { t: now, scale: h.scaleEma, palm: { x: (1 - pc.x) * vw, y: pc.y * vh },
      index: { x: (1 - I[8].x) * vw, y: I[8].y * vh }, pinky: { x: (1 - I[20].x) * vw, y: I[20].y * vh },
      say, fingers: [sc.index, sc.middle, sc.ring, sc.pinky] };
    h.buffer.push(sample);
    while (h.buffer.length && now - h.buffer[0].t > 3500) h.buffer.shift();
    return sample;
  }
  updateSpeed(h) {
    const buf = h.buffer, n = buf.length;
    if (n < 2) return h.speedEma;
    const cur = buf[n - 1]; let ref = buf[0];
    for (let i = n - 2; i >= 0; i--) { ref = buf[i]; if (cur.t - buf[i].t >= 100) break; }
    const dt = (cur.t - ref.t) / 1000;
    const raw = dt < 0.03 ? 0 : Math.hypot(cur.palm.x - ref.palm.x, cur.palm.y - ref.palm.y) / cur.scale / dt;
    h.speedEma += 0.5 * (raw - h.speedEma);
    return h.speedEma;
  }
  updateMotion(h, now, sample, speed) {
    const M = CONFIG.motion, m = h.motion;
    if (!m.active) {
      m.startCount = speed > M.startSpeed ? m.startCount + 1 : 0;
      if (m.startCount >= 2) { m.active = true; m.stillSince = null; m.samples = h.buffer.filter(s => s.t >= now - 250); }
      return;
    }
    m.samples.push(sample);
    if (speed < M.stopSpeed) {
      if (m.stillSince === null) m.stillSince = now; else if (now - m.stillSince > M.stopMs) this.finishMotion(h);
    } else m.stillSince = null;
    if (m.active && now - m.samples[0].t > M.maxMs) this.finishMotion(h);
  }
  finishMotion(h) {
    const m = h.motion;
    const endT = m.stillSince ?? m.samples[m.samples.length - 1].t;
    const segment = m.samples.filter(s => s.t <= endT);
    m.active = false; m.samples = []; m.stillSince = null; m.startCount = 0;
    const mf = analyzeMotion(segment);
    if (!mf) return;
    const rule = this.findMotionRule(mf, segment);
    if (rule) this.emitRule(rule, segment[segment.length - 1].t);
  }
  emitRule(rule, now) {
    if (rule.label === this.lastEvent.label && now - this.lastEvent.t < CONFIG.motion.repeatBlockMs) { this.lastEvent.t = now; return; }
    this.lastEvent = { label: rule.label, t: now };
    this.events.push({ rule });
  }
  findMotionRule(mf, samples) {
    let best = null, bestD = Infinity;
    for (const r of this.dict.motions) {
      if (!r.path || !matches(r.when || {}, mf)) continue;
      const d = templateDistance(samples, r);
      if (d < (r.maxDist ?? CONFIG.template.maxDist) && d < bestD) { best = r; bestD = d; }
    }
    if (best) return best;
    for (const r of this.dict.motions) if (!r.path && r.when && matches(r.when, mf)) return r;
    return null;
  }
  updateFlap(h, now, sample, speed) {
    const F = CONFIG.flap;
    h.fingerHist.push({ t: now, s: sample.fingers });
    while (h.fingerHist.length && now - h.fingerHist[0].t > F.windowMs) h.fingerHist.shift();
    if (now < h.flapCooldownUntil || h.motion.active || speed > F.maxSpeed || h.fingerHist.length < 12) return;
    const closes = [0, 1, 2, 3].map(i => countCloses(h.fingerHist.map(x => x.s[i]), F.high, F.low));
    const flapping = closes.map(c => c >= F.minCloses);
    let flap = null;
    if (flapping.every(Boolean)) flap = "all";
    else if (flapping[0] && closes[1] < 1 && closes[2] < 1 && closes[3] < 1) flap = "index";
    if (!flap) return;
    h.fingerHist.length = 0; h.flapCooldownUntil = now + F.cooldownMs;
    const mf = { motion: "none", spin: null, hand: null, flap };
    const rule = this.dict.motions.find(r => !r.path && r.when && matches(r.when, mf));
    if (rule) this.emitRule(rule, now);
  }
}
function countCloses(vals, hi, lo) {
  let state = null, closes = 0;
  for (const v of vals) { if (v >= hi) state = 1; else if (v <= lo && state === 1) { closes++; state = 0; } }
  return closes;
}
function countSwings(vals, minAmp) {
  let lastExt = vals[0], dir = 0, count = 0;
  for (const v of vals) {
    if (dir === 0) { if (v - lastExt > minAmp) { dir = 1; lastExt = v; } else if (lastExt - v > minAmp) { dir = -1; lastExt = v; } }
    else if (dir === 1) { if (v > lastExt) lastExt = v; else if (lastExt - v > minAmp) { count++; dir = -1; lastExt = v; } }
    else { if (v < lastExt) lastExt = v; else if (v - lastExt > minAmp) { count++; dir = 1; lastExt = v; } }
  }
  return count;
}
function circleInfo(pts) {
  const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length, cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  let prev = Math.atan2(pts[0].y - cy, pts[0].x - cx), total = 0, r = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = Math.atan2(pts[i].y - cy, pts[i].x - cx); let d = a - prev;
    while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    total += d; prev = a; r += Math.hypot(pts[i].x - cx, pts[i].y - cy);
  }
  return { turn: total, radius: r / pts.length };
}
function modeOf(samples, key) {
  const tally = {};
  for (const s of samples) if (s[key]) tally[s[key]] = (tally[s[key]] || 0) + 1;
  return Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}
function analyzeMotion(samples) {
  const M = CONFIG.motion;
  if (samples.length < 6) return null;
  const dur = samples[samples.length - 1].t - samples[0].t;
  if (dur < M.minMs) return null;
  const S = samples.reduce((a, s) => a + s.scale, 0) / samples.length || 1;
  const pts = samples.map(s => ({ x: s.palm.x / S, y: s.palm.y / S }));
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  const rangeX = range(xs), rangeY = range(ys);
  const dx = pts[pts.length - 1].x - pts[0].x, dy = pts[pts.length - 1].y - pts[0].y;
  const net = Math.hypot(dx, dy);
  const swingsX = countSwings(xs, M.swingAmp), swingsY = countSwings(ys, M.swingAmp);
  let kind = "other", spin = null;
  if (L >= M.minPath) {
    const circ = circleInfo(pts);
    const aspect = Math.min(rangeX, rangeY) / Math.max(rangeX, rangeY, 1e-6);
    if (Math.abs(circ.turn) >= M.minCircleTurn && circ.radius > 0.2 && aspect > 0.4) { kind = "circle"; spin = circ.turn > 0 ? "cw" : "ccw"; }
    else if (swingsX >= 2 && rangeX >= 1.2 * rangeY) kind = "waveX";
    else if (swingsY >= 2 && rangeY >= 1.2 * rangeX) kind = "shakeY";
    else if (net >= M.minSwipe && net / L > 0.65) kind = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "swipeRight" : "swipeLeft") : (dy < 0 ? "swipeUp" : "swipeDown");
  }
  return { motion: kind, spin, hand: modeOf(samples, "say"), flap: "none", path: +L.toFixed(2), swingsX, swingsY };
}
const pathLen = (pts) => { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); return l; };
function resample(pts, n) {
  const total = pathLen(pts);
  if (total === 0) return null;
  const step = total / (n - 1), src = pts.slice(), out = [src[0]];
  let D = 0;
  for (let i = 1; i < src.length; i++) {
    const d = Math.hypot(src[i].x - src[i - 1].x, src[i].y - src[i - 1].y);
    if (d > 0 && D + d >= step) {
      const t = (step - D) / d;
      const q = { x: src[i - 1].x + t * (src[i].x - src[i - 1].x), y: src[i - 1].y + t * (src[i].y - src[i - 1].y) };
      out.push(q); src.splice(i, 0, q); D = 0;
    } else D += d;
  }
  while (out.length < n) out.push(src[src.length - 1]);
  return out.slice(0, n);
}
function normalizePath(raw) {
  const r = resample(raw, CONFIG.template.points);
  if (!r) return null;
  const cx = mean(r.map(p => p.x)), cy = mean(r.map(p => p.y));
  const s = Math.max(range(r.map(p => p.x)), range(r.map(p => p.y))) || 1;
  return r.map(p => ({ x: (p.x - cx) / s, y: (p.y - cy) / s }));
}
const pathDist = (a, b) => a.reduce((sum, p, i) => sum + Math.hypot(p.x - b[i].x, p.y - b[i].y), 0) / a.length;
function templateDistance(samples, rule) {
  const raw = samples.map(s => s[rule.track || "palm"]);
  const S = samples.reduce((a, s) => a + s.scale, 0) / samples.length || 1;
  if (pathLen(raw) / S < 0.6) return Infinity;
  const cand = normalizePath(raw);
  if (!cand) return Infinity;
  rule._tpl = rule._tpl || normalizePath(rule.path.map(([x, y]) => ({ x, y })));
  let d = pathDist(cand, rule._tpl);
  if (rule.mirrorOk !== false) d = Math.min(d, pathDist(cand, rule._tpl.map(p => ({ x: -p.x, y: p.y }))));
  return d;
}
