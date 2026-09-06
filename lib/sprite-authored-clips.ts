import type { AnimationState } from './companion-animation';

// The original 48-cell backup contract remains unchanged. These extra drawings
// belong only to the two bundled characters, in a six-column, ten-row sheet.
export const AUTHORED_FRAME_COUNT = 24;
export const EXTRA_POSE_COUNT = 60;
const pose = (row: number, col: number) => 48 + row * 6 + col;
const row = (index: number) =>
  Array.from({ length: 6 }, (_, col) => pose(index, col));
const stand = [36, ...row(8), 39, 40, 41];
const paths: Record<AnimationState, number[]> = {
  idle: [0, 48, 49, 1, 50, 2, 51, 3, 52, 4, 53, 0],
  study: [0, 54, 6, 55, 7, 56, 8, 57, 9, 56, 8, 57, 9, 58, 10, 59, 11, 0],
  greet: [0, 60, 61, 62, 63, 64, 63, 64, 62, 61, 65, 0],
  think: [0, 66, 67, 19, 68, 20, 69, 21, 20, 70, 71, 22, 0],
  cheer: [0, 72, 25, 73, 26, 74, 27, 75, 27, 76, 28, 77, 0],
  class: [0, ...row(5), 0],
  meeting: [0, 84, 85, 86, 85, 86, 87, 88, 89, 84, 0],
  tired: [31, 90, 91, 32, 92, 33, 93, 34, 94, 33, 95, 32, 31],
  away: stand,
  returning: [...stand].reverse().concat(0),
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

export const AUTHORED_WALK = [
  42, 102, 43, 103, 44, 104, 45, 105, 46, 106, 47, 107,
].flatMap((frame) => [frame, frame]);

export function authoredRise(frame: number) {
  if (frame >= 102) return 32;
  if (frame >= 96) return [0, 0, 6, 16, 26, 32][frame - 96] ?? 0;
  return frame < 48 ? (frame >= 39 ? 32 : frame === 38 ? 16 : 0) : 0;
}
