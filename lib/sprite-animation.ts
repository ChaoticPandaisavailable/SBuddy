import { authoredClip, AUTHORED_WALK } from './sprite-authored-clips';
import type { AnimationState } from './companion-animation';

export type SpriteManifest = {
  version: 3;
  layout: 'six-by-eight';
  columns: 6;
  rows: 8;
  anchor: { x: 128; seatY: 232; handY: 160 };
  paper: { x: 128; y: 169 };
  clips: Record<
    AnimationState,
    { frames: number[]; durations: number[]; loop: boolean }
  >;
};
const clip = (frames: number[], durations: number[], loop = true) => ({
  frames,
  durations,
  loop,
});
// A single authored pose is the common junction. We never rotate or stretch limbs.
export const SPRITE_MANIFEST: SpriteManifest = {
  version: 3,
  layout: 'six-by-eight',
  columns: 6,
  rows: 8,
  anchor: { x: 128, seatY: 232, handY: 160 },
  paper: { x: 128, y: 169 },
  clips: {
    idle: clip([0, 1, 2, 3, 4, 0], [2600, 600, 90, 110, 90, 1500]),
    study: clip(
      [0, 6, 7, 8, 9, 8, 7, 8, 9, 10, 11, 0],
      [400, 220, 240, 220, 240, 220, 240, 220, 240, 250, 250, 500],
    ),
    greet: clip(
      [0, 13, 14, 13, 14, 13, 0],
      [220, 230, 240, 240, 240, 240, 250],
      false,
    ),
    think: clip(
      [0, 19, 20, 21, 20, 22, 0],
      [500, 400, 650, 700, 650, 300, 400],
    ),
    cheer: clip([0, 25, 26, 27, 28, 0], [200, 200, 400, 500, 300, 300], false),
    class: clip(
      [0, 1, 19, 0, 6, 7, 8, 9, 10, 11, 0],
      [1800, 500, 500, 700, 220, 300, 300, 300, 250, 250, 1000],
    ),
    meeting: clip([0, 1, 19, 22, 0], [2000, 800, 500, 450, 1600]),
    tired: clip(
      [31, 32, 33, 34, 33, 32, 31],
      [2000, 600, 120, 1800, 120, 600, 1800],
    ),
    away: clip([36, 37, 38, 39, 40, 41], [240, 320, 350, 300, 280, 250], false),
    returning: clip(
      [41, 40, 39, 38, 37, 36, 0],
      [250, 280, 300, 350, 320, 240, 200],
      false,
    ),
  },
};
export function validateSpriteManifest(value: unknown): SpriteManifest {
  // V3 is a fixed shared timeline. Arbitrary clips could bypass contact/exit constraints.
  const canonical = (v: unknown) =>
    JSON.stringify(v, (_key, item) =>
      item && typeof item === 'object' && !Array.isArray(item)
        ? Object.fromEntries(
            Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
          )
        : item,
    );
  if (canonical(value) !== canonical(SPRITE_MANIFEST))
    throw new Error('序列帧动作定义不完整或不兼容，原人物已保留。');
  return structuredClone(SPRITE_MANIFEST);
}
export type SpriteStep = {
  frame: number;
  duration: number;
  from?: number;
  to?: number;
  flip?: boolean;
};
export type SpriteRuntime = {
  preset?: 'female' | 'male';
  current: AnimationState;
  desired: AnimationState;
  phase: 'loop' | 'join' | 'exit' | 'walk-out' | 'away' | 'walk-in' | 'sit';
  steps: SpriteStep[];
  at: number;
  index: number;
  x: number;
  frame: number;
  flip: boolean;
  completed: number;
  token: number;
  lastCompletedToken: number;
  exitX: number;
  lastCompletedAction?: AnimationState;
};
const stepsFor = (
  state: AnimationState,
  preset?: SpriteRuntime['preset'],
): SpriteStep[] => {
  const c = SPRITE_MANIFEST.clips[state];
  if (preset)
    return authoredClip(
      state,
      c.durations.reduce((a, b) => a + b, 0),
    );
  return c.frames.map((frame, i) => ({ frame, duration: c.durations[i] }));
};
export function createSpriteRuntime(
  now = 0,
  preset?: SpriteRuntime['preset'],
): SpriteRuntime {
  return {
    preset,
    current: 'idle',
    desired: 'idle',
    phase: 'loop',
    steps: stepsFor('idle', preset),
    at: now,
    index: 0,
    x: 0,
    frame: 0,
    flip: false,
    completed: 0,
    token: 0,
    lastCompletedToken: -1,
    exitX: 500,
  };
}
function begin(
  r: SpriteRuntime,
  phase: SpriteRuntime['phase'],
  steps: SpriteStep[],
  at: number,
) {
  r.phase = phase;
  r.steps = steps;
  r.index = 0;
  r.at = at;
}
function walk(r: SpriteRuntime, entering: boolean, at: number) {
  const distance = r.exitX,
    stride = r.preset ? 2.25 : 9,
    count = Math.ceil(distance / stride),
    steps: SpriteStep[] = [];
  for (let i = 0; i < count; i++) {
    const from = Math.min(distance, i * stride),
      to = Math.min(distance, (i + 1) * stride);
    steps.push({
      frame: r.preset ? AUTHORED_WALK[i % AUTHORED_WALK.length] : 42 + (i % 6),
      duration: (to - from) * 20,
      from: entering ? distance - from : from,
      to: entering ? distance - to : to,
      flip: entering,
    });
  }
  begin(r, entering ? 'walk-in' : 'walk-out', steps, at);
}
function reachTarget(r: SpriteRuntime, at: number) {
  if (r.desired === 'away') {
    r.current = 'away';
    begin(r, 'exit', stepsFor('away', r.preset), at);
  } else {
    r.current = r.desired === 'returning' ? 'idle' : r.desired;
    begin(r, 'loop', stepsFor(r.current, r.preset), at);
  }
}
function finish(r: SpriteRuntime, at: number) {
  if (r.phase === 'exit') return walk(r, false, at);
  if (r.phase === 'walk-out') {
    r.phase = 'away';
    r.x = r.exitX;
    return;
  }
  if (r.phase === 'walk-in')
    return begin(r, 'sit', stepsFor('returning', r.preset), at);
  if (r.phase === 'sit' || r.phase === 'join') return reachTarget(r, at);
  if (r.phase === 'loop') {
    if (
      (r.current === 'greet' || r.current === 'cheer') &&
      (r.lastCompletedToken !== r.token || r.lastCompletedAction !== r.current)
    ) {
      r.completed++;
      r.lastCompletedToken = r.token;
      r.lastCompletedAction = r.current;
      if (r.desired === r.current) r.desired = 'idle';
    }
    if (
      r.current !== r.desired &&
      !(r.current === 'idle' && r.desired === 'returning')
    ) {
      begin(r, 'join', [{ frame: r.preset ? 48 : 0, duration: 180 }], at);
    } else begin(r, 'loop', stepsFor(r.current, r.preset), at);
  }
}
export function sampleSprite(r: SpriteRuntime, now: number) {
  if (
    (r.desired === 'greet' || r.desired === 'cheer') &&
    r.lastCompletedToken === r.token &&
    r.lastCompletedAction === r.desired
  )
    r.desired = 'idle';
  if (r.phase === 'away') {
    if (r.desired !== 'away') walk(r, true, now);
    else
      return {
        frame: 41,
        x: r.exitX,
        flip: false,
        visible: false,
        travel: true,
      };
  }
  // Retarget at the next held pose. Writing first lifts the pen, tired first raises the head.
  if (
    r.phase === 'loop' &&
    r.current !== r.desired &&
    !(r.current === 'idle' && r.desired === 'returning') &&
    now - r.at >= Math.min(r.steps[r.index].duration, 200)
  ) {
    const closing = r.preset
      ? r.current === 'study'
        ? [58, 59, 48]
        : r.current === 'class'
          ? [83, 48]
          : r.current === 'tired'
            ? [94, 95, 48]
            : r.current === 'greet'
              ? [65, 48]
              : r.current === 'think'
                ? [70, 71, 48]
                : r.current === 'cheer'
                  ? [76, 77, 48]
                  : [48]
      : r.current === 'study' || r.current === 'class'
        ? [10, 11, 0]
        : r.current === 'tired'
          ? [32, 31, 0]
          : r.current === 'greet'
            ? [13, 0]
            : [0];
    begin(
      r,
      'join',
      closing.map((frame) => ({ frame, duration: 160 })),
      now,
    );
  }
  let limit = 0;
  while (
    r.phase !== 'away' &&
    now - r.at >= r.steps[r.index].duration &&
    limit++ < 1000
  ) {
    const step = r.steps[r.index],
      at = r.at + step.duration;
    if (step.to !== undefined) r.x = step.to;
    r.index++;
    if (r.index === r.steps.length) finish(r, at);
    else r.at = at;
  }
  if (r.phase === 'away')
    return { frame: 41, x: r.exitX, flip: false, visible: false, travel: true };
  const step = r.steps[r.index];
  r.frame = step.frame;
  r.flip = !!step.flip;
  if (step.from !== undefined && step.to !== undefined)
    r.x =
      step.from +
      (step.to - step.from) * Math.min(1, (now - r.at) / step.duration);
  else r.x = 0;
  return {
    frame: r.frame,

    x: r.x,
    flip: r.flip,
    visible: true,
    travel: ['exit', 'walk-out', 'walk-in', 'sit'].includes(r.phase),
  };
}
