import type { AnimationState } from './companion-animation';

export type Point = { x: number; y: number };
export type RoomKind = 'library' | 'classroom';
export const ROOM_ANCHORS = {
  desk: 230,
  paper: { x: 10, y: 252 },
  seat: 0,
  exit: 650,
} as const;
export const CHIBI_PARTS = [
  'head',
  'headQuarter',
  'headSide',
  'headBlink',
  'torso',
  'torsoQuarter',
  'torsoSide',
  'hips',
  'upperLeft',
  'lowerLeft',
  'upperRight',
  'lowerRight',
  'hand',
  'grip',
  'thigh',
  'shin',
] as const;
export const CHIBI_CLIP_MS: Record<AnimationState, number> = {
  idle: 6400,
  greet: 3200,
  think: 7000,
  cheer: 2800,
  study: 8000,
  class: 10000,
  meeting: 7600,
  tired: 7200,
  away: 6400,
  returning: 6400,
};
export type ChibiPose = {
  x: number;
  rise: number;
  turn: number;
  headTilt: number;
  nod: number;
  leftX: number;
  leftY: number;
  rightX: number;
  rightY: number;
  rightBend: number;
  leftBend: number;
  blink: number;
  pen: number;
  penDown: number;
  stride: number;
  gait: number;
  breath: number;
};
const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));
export const ease = (n: number) => {
  const t = clamp(n);
  return t * t * (3 - 2 * t);
};
const pulse = (t: number, a: number, b: number) =>
  t <= a || t >= b ? 0 : Math.sin((Math.PI * (t - a)) / (b - a)) ** 2;
export function restingPose(): ChibiPose {
  return {
    x: 0,
    rise: 0,
    turn: 0,
    headTilt: 0,
    nod: 0,
    leftX: -46,
    leftY: 244,
    rightX: 46,
    rightY: 244,
    rightBend: -1,
    leftBend: 1,
    blink: 0,
    pen: 0,
    penDown: 0,
    stride: 0,
    gait: 0,
    breath: 0,
  };
}
/** Art is sampled on one fixed pixel grid. Root never sways during a seated clip. */
export function chibiLoop(state: AnimationState, elapsed: number): ChibiPose {
  const duration = CHIBI_CLIP_MS[state];
  const oneShot = state === 'greet' || state === 'cheer';
  if (oneShot && elapsed >= duration)
    return chibiLoop('idle', elapsed - duration);
  const t = (((elapsed % duration) + duration) % duration) / duration;
  const p = restingPose();
  p.blink = pulse(t, 0.71, 0.75);
  p.breath = 0.7 * (1 - Math.cos(t * Math.PI * 2));
  if (state === 'away')
    return { ...p, x: ROOM_ANCHORS.exit, rise: 42, turn: 1 };
  if (state === 'study' || state === 'class') {
    // Pick up once in the entry transition. The pen remains attached during lifted strokes.
    p.pen = 1;
    const writing = state === 'study' ? 1 : pulse(t, 0.05, 0.65);
    const cycle = (t * 4) % 1;
    const stroke = ease(Math.min(cycle / 0.68, 1));
    const returnStroke = ease((cycle - 0.68) / 0.32);
    p.rightX = 19 + writing * (14 * stroke - 14 * returnStroke);
    p.rightY =
      231 +
      writing * (2 * Math.sin(cycle * Math.PI * 8) - 8 * pulse(cycle, 0.68, 1));
    p.leftX = -32;
    p.leftY = 255;
    p.penDown = writing > 0.2 && cycle < 0.68 ? 1 : 0;
    p.nod = 3 * writing;
    p.headTilt = -0.025 * writing;
  } else if (state === 'greet' || state === 'cheer') {
    // Change bend side only with the arm extended, then fold the forearm upward.
    // This avoids the detached, downward palm of a rigid cutout wave.
    const u = t < 0.5 ? t : 1 - t;
    if (u < 0.15) {
      const a = ease(u / 0.15);
      p.rightX = 46 + 54 * a;
      p.rightY = 244 - 60 * a;
    } else {
      const a = ease((u - 0.15) / 0.13);
      p.rightX = 100 - 34 * a + 4 * Math.sin(t * Math.PI * 12) * a;
      p.rightY = 184 - 43 * a;
      p.rightBend = 1;
    }
    if (state === 'cheer') {
      p.leftX = -p.rightX;
      p.leftY = p.rightY;
      p.leftBend = -p.rightBend;
    }
    p.headTilt = -0.025 * pulse(t, 0.1, 0.9);
  } else if (state === 'think' || state === 'tired') {
    p.rightX = 21;
    p.rightY = 169;
    p.headTilt = state === 'tired' ? 0.07 : -0.045;
    p.nod = state === 'tired' ? 5 : 1;
    if (state === 'tired') p.blink = Math.max(p.blink, pulse(t, 0.25, 0.6));
  } else if (state === 'meeting') {
    const explain = pulse(t, 0.2, 0.72);
    p.rightX += 12 * explain;
    p.rightY -= 27 * explain;
    p.nod = 2 * pulse(t, 0.12, 0.32);
  }
  return p;
}
export function interpolateChibi(
  a: ChibiPose,
  b: ChibiPose,
  progress: number,
): ChibiPose {
  const p = { ...a },
    t = ease(progress);
  for (const key of Object.keys(p) as (keyof ChibiPose)[])
    p[key] = a[key] + (b[key] - a[key]) * t;
  return p;
}
/** Two-bone IK, fixed bend side, no stretching or elbow reversal at full extension. */
export function solveArm(
  root: Point,
  target: Point,
  bend: -1 | 1,
  upper = 34,
  lower = 34,
) {
  const dx = target.x - root.x,
    dy = target.y - root.y;
  const distance = Math.hypot(dx, dy);
  const d = clamp(distance, Math.abs(upper - lower) + 2, upper + lower - 0.05);
  const angle = Math.atan2(dy, dx);
  const offset = Math.acos(
    clamp((upper * upper + d * d - lower * lower) / (2 * upper * d), -1, 1),
  );
  const elbow = {
    x: root.x + Math.cos(angle + bend * offset) * upper,
    y: root.y + Math.sin(angle + bend * offset) * upper,
  };
  const hand = {
    x: root.x + Math.cos(angle) * d,
    y: root.y + Math.sin(angle) * d,
  };
  return { elbow, hand };
}
type Segment = { from: ChibiPose; to: ChibiPose; ms: number; walk?: boolean };
export type ChibiRuntime = {
  current: AnimationState;
  desired: AnimationState;
  pose: ChibiPose;
  segments: Segment[];
  at: number;
  loopAt: number;
  exitX: number;
};
export function createChibiRuntime(
  state: AnimationState,
  now = 0,
): ChibiRuntime {
  return {
    current: state,
    desired: state,
    pose: chibiLoop(state, 0),
    segments: [],
    at: now,
    loopAt: now,
    exitX: ROOM_ANCHORS.exit,
  };
}
function route(r: ChibiRuntime, now: number) {
  let last = { ...r.pose };
  const add = (to: ChibiPose, ms: number, walk = false) => {
    r.segments.push({ from: last, to, ms, walk });
    last = to;
  };
  const rest = restingPose();
  if (last.rightBend > 0 || last.leftBend < 0) {
    add(
      {
        ...last,
        rightX: last.rightBend > 0 ? 100 : last.rightX,
        rightY: last.rightBend > 0 ? 184 : last.rightY,
        leftX: last.leftBend < 0 ? -100 : last.leftX,
        leftY: last.leftBend < 0 ? 184 : last.leftY,
      },
      350,
    );
    add({ ...last, rightBend: -1, leftBend: 1 }, 100);
  }
  if (Math.abs(last.x) > 1) {
    if (r.desired === 'away')
      add(
        { ...rest, x: r.exitX, rise: 42, turn: 1 },
        Math.max(700, Math.abs(r.exitX - last.x) * 9),
        true,
      );
    else {
      add({ ...rest, x: last.x, rise: 42, turn: -1 }, 420);
      add(
        { ...rest, rise: 42, turn: -1 },
        Math.max(900, Math.abs(last.x) * 9),
        true,
      );
      add({ ...rest, rise: 42 }, 420);
      add(rest, 850);
    }
  } else {
    // Lower hands before putting down the pen; do not fade a prop while it is mid-air.
    if (last.pen > 0) {
      add({ ...rest, rightX: 58, rightY: 247, pen: 1 }, 500);
      add({ ...rest, rightX: 58, rightY: 247 }, 180);
    }
    add(rest, 450);
    if (r.desired === 'away') {
      add({ ...rest, leftY: 250, rightY: 250, rise: 12, nod: 4 }, 350);
      add(
        { ...rest, rise: 42, leftX: -36, rightX: 36, leftY: 242, rightY: 242 },
        650,
      );
      add({ ...rest, rise: 42, turn: 1 }, 420);
      add(
        { ...rest, x: r.exitX, rise: 42, turn: 1 },
        Math.max(1200, r.exitX * 9),
        true,
      );
    }
  }
  if (r.desired !== 'away') {
    if (r.desired === 'study' || r.desired === 'class') {
      add({ ...rest, rightX: 58, rightY: 247 }, 400);
      add({ ...rest, rightX: 58, rightY: 247, pen: 1 }, 180);
    }
    add(chibiLoop(r.desired, 0), 550);
  }
  r.current = r.desired;
  r.at = now;
}
export function sampleChibi(
  r: ChibiRuntime,
  now: number,
  reduced = false,
): ChibiPose {
  if (reduced) {
    r.segments = [];
    r.current = r.desired;
    r.loopAt = now;
    return (r.pose =
      r.current === 'away'
        ? { ...chibiLoop('away', 0), x: r.exitX }
        : chibiLoop(r.current, 0));
  }
  // Retarget at a completed segment, retaining the exact current pose.
  while (r.segments.length && now - r.at >= r.segments[0].ms) {
    r.pose = { ...r.segments[0].to };
    r.at += r.segments[0].ms;
    r.segments.shift();
    if (r.current !== r.desired) {
      r.segments = [];
      route(r, r.at);
    }
    if (!r.segments.length) r.loopAt = r.at;
  }
  if (!r.segments.length && r.current !== r.desired) route(r, now);
  if (r.segments.length) {
    const s = r.segments[0],
      t = clamp((now - r.at) / s.ms);
    r.pose = interpolateChibi(s.from, s.to, t);
    if (s.walk) {
      r.pose.gait = Math.min(1, t * 8, (1 - t) * 8);
      // Phase tracks distance travelled, avoiding feet cycling faster than root motion.
      r.pose.stride =
        Math.sin(((r.pose.x - s.from.x) / 21) * Math.PI) *
        Math.min(1, t * 8, (1 - t) * 8);
    }
  } else
    r.pose =
      r.current === 'away'
        ? { ...chibiLoop('away', 0), x: r.exitX }
        : chibiLoop(r.current, now - r.loopAt);
  return r.pose;
}
/** Foot travels backward relative to the hip during stance, so its world point is planted. */
export function footTarget(p: ChibiPose, sign: number): Point {
  const phase = (((p.x / 42 + (sign < 0 ? 0.5 : 0)) % 1) + 1) % 1;
  const swing = Math.max(0, (phase - 0.6) / 0.4);
  const offset = phase < 0.6 ? 12.6 - 42 * phase : -12.6 + 25.2 * ease(swing);
  return {
    x: sign * (Math.abs(p.turn) > 0.72 ? 9 : 17) + offset * p.gait,
    y: 123 + p.rise + p.breath - Math.sin(Math.PI * swing) * 12 * p.gait,
  };
}
