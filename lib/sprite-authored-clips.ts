import type { AnimationState } from './companion-animation';

// The original 48-cell backup contract remains unchanged. These extra drawings
// belong only to the two bundled characters, in a six-column, ten-row sheet.
export const AUTHORED_FRAME_COUNT = 24;
export const EXTRA_POSE_COUNT = 60;
const pose = (row: number, col: number) => 48 + row * 6 + col;
const row = (index: number) =>
  Array.from({ length: 6 }, (_, col) => pose(index, col));
// Bundled playback uses the new pose set exclusively.
const stand = row(8);
const paths: Record<AnimationState, number[]> = {
  idle: row(0),
  study: [48, ...row(1), 48],
  greet: [48, 60, 61, 62, 63, 64, 65, 48],
  think: [48, ...row(3), 48],
  cheer: [48, ...row(4), 48],
  class: [48, ...row(5), 48],
  meeting: [48, ...row(6), 48],
  tired: [48, ...row(7), 48],
  away: stand,
  returning: [...stand].reverse().concat(48),
};

// Allocate held frame slots to key poses without changing their timing. Every
// action gets 24 slots, including genuine new poses and intentional holds.
export function authoredClip(state: AnimationState, duration: number) {
  const frames = paths[state];
  const weights =
    state === 'class'
      ? [1800, 1200, 500, 300, 550, 600, 120, 1050]
      : frames.map((_, i) =>
          state === 'idle' && (i === 0 || i === frames.length - 1) ? 8 : 1,
        );
  const total = weights.reduce((a, b) => a + b, 0);
  const slots = frames.map(() => 1);
  for (let left = AUTHORED_FRAME_COUNT - frames.length; left > 0; left--) {
    const best = weights.reduce(
      (best, weight, i) =>
        weight / slots[i] > weights[best] / slots[best] ? i : best,
      0,
    );
    slots[best]++;
  }
  return frames.flatMap((frame, i) =>
    Array.from({ length: slots[i] }, () => ({
      frame,
      duration: (duration * weights[i]) / total / slots[i],
    })),
  );
}

export const AUTHORED_WALK = row(9).flatMap((frame) => [
  frame,
  frame,
  frame,
  frame,
]);

export function authoredRise(frame: number) {
  if (frame >= 102) return 32;
  if (frame >= 96) return [0, 0, 6, 16, 26, 32][frame - 96] ?? 0;
  return frame < 48 ? (frame >= 39 ? 32 : frame === 38 ? 16 : 0) : 0;
}
