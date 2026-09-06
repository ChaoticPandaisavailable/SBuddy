import type { AnimationState } from './companion-animation';

export type BodyPreset = 'female' | 'male';
export type RigAppearance = {
  preset: BodyPreset;
  rigVersion?: 1 | 2 | 3;
  spriteManifest?: import('./sprite-animation').SpriteManifest;
  atlasKey?: string;
  photoMode?: 'full-body' | 'head-only';
};
export type Pose = {
  x: number;
  y: number;
  torso: number;
  head: number;
  leftUpper: number;
  leftLower: number;
  rightUpper: number;
  rightLower: number;
  leftThigh: number;
  leftShin: number;
  rightThigh: number;
  rightShin: number;
  pen: number;
  notebook: number;
  laptop: number;
  blink: number;
};
export const RIG_STATES: AnimationState[] = [
  'idle',
  'greet',
  'think',
  'cheer',
  'study',
  'class',
  'meeting',
  'tired',
  'away',
  'returning',
];
export const CYCLE_MS: Record<AnimationState, number> = {
  idle: 6400,
  greet: 4200,
  think: 6000,
  cheer: 4000,
  study: 8000,
  class: 10000,
  meeting: 8000,
  tired: 7200,
  away: 6000,
  returning: 6000,
};
export const SEATED = new Set<AnimationState>([
  'study',
  'class',
  'meeting',
  'tired',
]);
export const HOME_X = 150;
export const DESK_X = 300;
export const OUTSIDE_X = 640;
export function standing(x = HOME_X): Pose {
  return {
    x,
    y: 272,
    torso: 0,
    head: 0,
    leftUpper: -0.06,
    leftLower: 0.04,
    rightUpper: 0.06,
    rightLower: -0.04,
    leftThigh: -0.045,
    leftShin: 0.02,
    rightThigh: 0.045,
    rightShin: -0.02,
    pen: 0,
    notebook: 0,
    laptop: 0,
    blink: 0,
  };
}
export function seated(): Pose {
  return {
    ...standing(DESK_X),
    y: 286,
    leftThigh: -0.78,
    leftShin: 0.04,
    rightThigh: 0.78,
    rightShin: -0.04,
    leftUpper: -0.2,
    leftLower: 0.42,
    rightUpper: 0.5,
    rightLower: -0.5,
  };
}
const smooth = (t: number) => {
  const n = Math.max(0, Math.min(1, t));
  return n * n * n * (n * (n * 6 - 15) + 10);
};
export function blendPose(from: Pose, to: Pose, progress: number): Pose {
  const t = smooth(progress);
  const pose = { ...from };
  for (const key of Object.keys(pose) as (keyof Pose)[])
    pose[key] = from[key] + (to[key] - from[key]) * t;
  return pose;
}
function envelope(t: number, start: number, end: number) {
  if (t < start || t > end) return 0;
  return Math.sin((Math.PI * (t - start)) / (end - start)) ** 2;
}
/** Every loop closes in both pose and velocity. Root position never oscillates. */
export function loopPose(state: AnimationState, elapsedMs: number): Pose {
  const t =
    (((elapsedMs % CYCLE_MS[state]) + CYCLE_MS[state]) % CYCLE_MS[state]) /
    CYCLE_MS[state];
  const wave = Math.sin(t * Math.PI * 2);
  const pose = SEATED.has(state)
    ? seated()
    : standing(state === 'away' ? OUTSIDE_X : HOME_X);
  pose.blink = envelope(t, 0.72, 0.755);
  if (state === 'greet') {
    const lift = envelope(t, 0.08, 0.84);
    pose.rightUpper = 0.06 + 2.42 * lift;
    pose.rightLower = -0.04 + (2.75 + Math.sin(t * Math.PI * 12) * 0.22) * lift;
  } else if (state === 'think') {
    pose.rightUpper = 0.9;
    pose.rightLower = -2.32;
    pose.head = -0.055 + wave * 0.025;
  } else if (state === 'cheer') {
    const lift = envelope(t, 0.06, 0.88);
    pose.leftUpper = -0.06 - 2.5 * lift;
    pose.leftLower = 0.04 - 2.8 * lift;
    pose.rightUpper = 0.06 + 2.5 * lift;
    pose.rightLower = -0.04 + 2.8 * lift;
  } else if (state === 'study' || state === 'class') {
    const writing =
      state === 'study' ? 1 - envelope(t, 0.76, 0.98) : envelope(t, 0.04, 0.56);
    pose.notebook = 1;
    pose.pen = 1;
    pose.head = 0.07 + writing * 0.06;
    pose.rightUpper = 0.47 + Math.sin(t * Math.PI * 8) * 0.018 * writing;
    pose.rightLower = -0.43 + Math.sin(t * Math.PI * 16) * 0.07 * writing;
  } else if (state === 'meeting') {
    pose.laptop = 1;
    const gesture = envelope(t, 0.16, 0.75);
    pose.rightUpper = 0.5 + 0.26 * gesture;
    pose.rightLower = -0.5 - 1.7 * gesture;
    pose.head = wave * 0.035;
  } else if (state === 'tired') {
    pose.torso = 0.07;
    pose.head = 0.17;
    pose.rightUpper = 0.2;
    pose.rightLower = -2.4;
    pose.blink = Math.max(pose.blink, envelope(t, 0.2, 0.65));
  } else if (state === 'returning') {
    // After walking back, settle into a quiet standing loop rather than restarting entry.
    pose.head = wave * 0.015;
  }
  return pose;
}

type Segment = { from: Pose; to: Pose; duration: number; walking: boolean };
export type RigRuntime = {
  current: AnimationState;
  desired: AnimationState;
  loopAt: number;
  segments: Segment[];
  segmentAt: number;
  pose: Pose;
};
export function createRigRuntime(state: AnimationState, now = 0): RigRuntime {
  return {
    current: state,
    desired: state,
    loopAt: now,
    segments: [],
    segmentAt: now,
    pose: loopPose(state, 0),
  };
}
function transition(
  from: AnimationState,
  to: AnimationState,
  captured: Pose,
): Segment[] {
  const segments: Segment[] = [];
  let last = captured;
  const add = (next: Pose, duration: number, walking = false) => {
    segments.push({ from: last, to: next, duration, walking });
    last = next;
  };
  if (from === 'away') {
    last = standing(OUTSIDE_X);
  } else if (SEATED.has(from)) {
    add(seated(), 500); // Put down the pen / lower the hands before changing activity.
    if (!SEATED.has(to)) add(standing(DESK_X), 1000);
  } else add(standing(captured.x), 550);
  if (SEATED.has(from) && SEATED.has(to)) {
    add(loopPose(to, 0), 650);
  } else {
    const destination =
      to === 'away' ? OUTSIDE_X : SEATED.has(to) ? DESK_X : HOME_X;
    if (Math.abs(destination - last.x) > 1)
      add(
        standing(destination),
        Math.max(1000, (Math.abs(destination - last.x) / 85) * 1000),
        true,
      );
    if (to !== 'away') {
      if (SEATED.has(to)) add(seated(), 1000);
      add(loopPose(to, 0), 550);
    }
  }
  return segments;
}
export function requestRigState(runtime: RigRuntime, next: AnimationState) {
  runtime.desired = next;
}
export function sampleRig(
  runtime: RigRuntime,
  now: number,
  reduced = false,
): Pose {
  if (reduced) {
    runtime.current = runtime.desired;
    runtime.segments = [];
    runtime.pose = loopPose(runtime.current, 0);
    runtime.loopAt = now;
    return runtime.pose;
  }
  if (!runtime.segments.length && runtime.current !== runtime.desired) {
    runtime.pose = loopPose(runtime.current, now - runtime.loopAt);
    runtime.segments = transition(
      runtime.current,
      runtime.desired,
      runtime.pose,
    );
    runtime.current = runtime.desired;
    runtime.segmentAt = now;
  }
  while (
    runtime.segments.length &&
    now - runtime.segmentAt >= runtime.segments[0].duration
  ) {
    runtime.segmentAt += runtime.segments[0].duration;
    runtime.segments.shift();
    if (!runtime.segments.length) runtime.loopAt = runtime.segmentAt;
  }
  if (!runtime.segments.length)
    runtime.pose = loopPose(runtime.current, now - runtime.loopAt);
  else {
    const segment = runtime.segments[0];
    const elapsed = now - runtime.segmentAt;
    const p = Math.max(0, Math.min(1, elapsed / segment.duration));
    runtime.pose = blendPose(segment.from, segment.to, p);
    if (segment.walking) {
      // Smooth takeoff/landing; constant body scale and height. Only articulated joints move.
      const stride =
        Math.sin((elapsed / 680) * Math.PI * 2) *
        Math.min(1, p * 6, (1 - p) * 6);
      const direction = Math.sign(segment.to.x - segment.from.x);
      runtime.pose.leftThigh += stride * 0.48 * direction;
      runtime.pose.rightThigh -= stride * 0.48 * direction;
      runtime.pose.leftShin += Math.max(0, -stride) * 0.66 * direction;
      runtime.pose.rightShin += Math.max(0, stride) * 0.66 * direction;
      runtime.pose.leftUpper -= stride * 0.23;
      runtime.pose.rightUpper += stride * 0.23;
    }
  }
  return runtime.pose;
}
