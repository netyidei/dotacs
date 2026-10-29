// Synthetic MediaPipe-like hands: forward kinematics in an anatomical frame
// (u = thumb side, v = along the fingers, n = out of the palm), then rotated,
// projected and noised.
let seed = 12345;
export function srand(s) { seed = s >>> 0; }
export function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
export const rr = (a, b) => a + (b - a) * rnd();
export function gauss() { let u = 0, v = 0; while (u === 0) u = rnd(); v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

const MCP = { index: [0.026, 0.088, 0], middle: [0.005, 0.092, 0], ring: [-0.014, 0.087, 0], pinky: [-0.031, 0.077, 0] };
const BONES = { index: [0.042, 0.025, 0.020], middle: [0.046, 0.029, 0.021], ring: [0.043, 0.027, 0.021], pinky: [0.034, 0.020, 0.019] };
const CMC = [0.022, 0.028, 0.008];
const D2R = Math.PI / 180;

export const EXT = [4, 4, 3], FIST = [85, 100, 65], CURVE = [32, 42, 25], OCURVE = [42, 55, 35], HOOK = [12, 88, 70], BENT = [55, 65, 40];
const SPREAD = { index: 12, middle: 0, ring: -10, pinky: -20 };
const TOGETHER = { index: 2, middle: 0, ring: -2, pinky: -5 };

function chain(name, flex, abd) {
  const d = [Math.sin(abd * D2R), Math.cos(abd * D2R), 0];
  let cur = MCP[name].slice(), ang = 0;
  const pts = [cur.slice()];
  for (let k = 0; k < 3; k++) {
    ang += flex[k] * D2R;
    const dir = [d[0] * Math.cos(ang), d[1] * Math.cos(ang), Math.sin(ang)];
    cur = cur.map((c, i) => c + BONES[name][k] * dir[i]);
    pts.push(cur.slice());
  }
  return pts;
}

// pose: { fingers: {index:[f1,f2,f3], ...}, spread: true|false|{...}, thumb: [u,v,n] | {touch:'index'} }
export function buildHand(pose, jitter = null) {
  const J = jitter || { flex: 0, abd: 0, thumb: 0 };
  const P = new Array(21);
  P[0] = [0, 0, 0];
  const abd = pose.spread === true ? SPREAD : pose.spread && typeof pose.spread === "object" ? pose.spread : TOGETHER;
  const idx = { index: 5, middle: 9, ring: 13, pinky: 17 };
  for (const name of Object.keys(MCP)) {
    const f = (pose.fingers[name] || FIST).map(x => x + J.flex * gauss());
    const pts = chain(name, f, abd[name] + J.abd * gauss());
    for (let k = 0; k < 4; k++) P[idx[name] + k] = pts[k];
  }
  let T;
  if (pose.thumb && pose.thumb.touch) T = P[{ index: 8, middle: 12, ring: 16, pinky: 20 }[pose.thumb.touch]].slice();
  else T = pose.thumb.slice();
  T = T.map(x => x + J.thumb * gauss());
  const v = T.map((t, i) => t - CMC[i]);
  const bulge = [0.012, 0, 0.006];
  P[1] = CMC.slice();
  P[2] = CMC.map((c, i) => c + 0.38 * v[i] + bulge[i]);
  P[3] = CMC.map((c, i) => c + 0.72 * v[i] + 0.6 * bulge[i]);
  P[4] = T;
  return P;
}

const rot = (p, ax, a) => {
  const c = Math.cos(a), s = Math.sin(a);
  const [x, y, z] = p;
  if (ax === "x") return [x, y * c - z * s, y * s + z * c];
  if (ax === "y") return [x * c + z * s, y, -x * s + z * c];
  return [x * c - y * s, x * s + y * c, z];
};

// anatomical -> camera (MediaPipe world: x right, y down, z away). palm faces camera.
// view: { roll, yaw, pitch } degrees; left: mirror image hand; k: image scale; cx, cy: image position
export function toResults(P, view, noise = { world: 0, image: 0 }) {
  const sx = view.left ? -1 : 1;
  const world = P.map(([u, v, n]) => {
    let p = [sx * u, -v, -n];
    p = rot(p, "x", (view.pitch || 0) * D2R);
    p = rot(p, "y", (view.yaw || 0) * D2R);
    p = rot(p, "z", -(view.roll || 0) * D2R);   // positive roll turns the fingers clockwise on screen
    return p;
  });
  const k = view.k || 3.2, cx = view.cx ?? 0.5, cy = view.cy ?? 0.55, aspect = 640 / 480;
  const lm = world.map(([x, y, z]) => ({
    x: cx + x * k / aspect + noise.image * gauss(),
    y: cy + (y + 0.05) * k + noise.image * gauss(),
    z: z * k
  }));
  const W = world.map(([x, y, z]) => ({ x: x + noise.world * gauss(), y: y + noise.world * gauss(), z: z + noise.world * 1.5 * gauss() }));
  return { landmarks: [lm], worldLandmarks: [W], handedness: [[{ categoryName: view.left ? "Left" : "Right", score: 0.95 }]] };
}

// --------------------------------------------------------------------------
// The signs in gestures.json as poses. thumb targets in metres (u, v, n).
// --------------------------------------------------------------------------
const T_OUT = [0.088, 0.055, 0.012];
const T_SIDE = [0.044, 0.074, 0.03];
const T_ACROSS_FIST = [0.0, 0.074, 0.06];
const T_ACROSS_PALM = [-0.012, 0.068, 0.016];
const T_HOLD = [-0.006, 0.07, 0.055];   // thumb holding curled fingers down

export const POSES = {
  A:  { say: "A", fingers: {}, thumb: T_SIDE },
  S:  { say: "S", fingers: {}, thumb: T_ACROSS_FIST },
  "5": { say: "5", fingers: { index: EXT, middle: EXT, ring: EXT, pinky: EXT }, spread: true, thumb: T_OUT },
  B:  { say: "B", fingers: { index: EXT, middle: EXT, ring: EXT, pinky: EXT }, thumb: T_ACROSS_PALM },
  "4": { say: "4", fingers: { index: EXT, middle: EXT, ring: EXT, pinky: EXT }, spread: true, thumb: T_ACROSS_PALM },
  "1": { say: "1", fingers: { index: EXT }, thumb: T_HOLD },
  D:  { say: "D", fingers: { index: EXT, middle: BENT }, thumb: { touch: "middle" } },
  L:  { say: "L", fingers: { index: EXT }, thumb: [0.095, 0.035, 0.0] },
  G:  { say: "G", fingers: { index: EXT }, thumb: [0.06, 0.09, 0.015], view: { roll: 90 } },
  U:  { say: "U", fingers: { index: EXT, middle: EXT }, thumb: T_HOLD },
  V:  { say: "V", fingers: { index: EXT, middle: EXT }, spread: { index: 13, middle: -6, ring: -4, pinky: -8 }, thumb: T_HOLD },
  H:  { say: "H", fingers: { index: EXT, middle: EXT }, thumb: T_HOLD, view: { roll: 90 } },
  K:  { say: "K", fingers: { index: EXT, middle: EXT }, spread: { index: 13, middle: -6, ring: -4, pinky: -8 }, thumb: [0.022, 0.135, 0.028] },
  W:  { say: "W", fingers: { index: EXT, middle: EXT, ring: EXT, pinky: [80, 95, 60] }, spread: true, thumb: { touch: "pinky" } },
  F:  { say: "F", fingers: { index: BENT, middle: EXT, ring: EXT, pinky: EXT }, spread: true, thumb: { touch: "index" } },
  "7": { say: "7", fingers: { index: EXT, middle: EXT, ring: BENT, pinky: EXT }, spread: true, thumb: { touch: "ring" } },
  "8": { say: "8", fingers: { index: EXT, middle: BENT, ring: EXT, pinky: EXT }, spread: true, thumb: { touch: "middle" } },
  I:  { say: "I", fingers: { pinky: EXT }, thumb: T_HOLD },
  Y:  { say: "Y", fingers: { pinky: EXT }, spread: true, thumb: T_OUT },
  ILY: { say: "I love you", fingers: { index: EXT, pinky: EXT }, spread: true, thumb: T_OUT },
  ROCK: { say: "Rock on", fingers: { index: EXT, pinky: EXT }, spread: true, thumb: T_HOLD },
  "3": { say: "3", fingers: { index: EXT, middle: EXT }, spread: true, thumb: T_OUT },
  O:  { say: "O", fingers: { index: OCURVE, middle: OCURVE, ring: OCURVE, pinky: OCURVE }, thumb: { touch: "index" } },
  C:  { say: "C", fingers: { index: CURVE, middle: CURVE, ring: CURVE, pinky: CURVE }, thumb: [0.07, 0.085, 0.07] },
  X:  { say: "X", fingers: { index: HOOK }, thumb: T_HOLD },
  GOOD: { say: "Good", fingers: {}, thumb: [0.036, 0.168, 0.0], view: { roll: 0, yaw: 70 } },
  BAD:  { say: "Bad", fingers: {}, thumb: [0.036, 0.168, 0.0], view: { roll: 180, yaw: 70 } }
};
