const cache = new WeakMap<
  HTMLCanvasElement[],
  Map<string, HTMLCanvasElement>
>();

// Premultiplied RGBA averaging: two source-over half-opacity draws would dim
// unchanged pixels to 75% opacity. Add the two halves on a transparent canvas.
export function interpolatedSpriteFrame(
  frames: HTMLCanvasElement[],
  from: number,
  to?: number,
): HTMLCanvasElement {
  if (to === undefined || to === from) return frames[from];
  let pairs = cache.get(frames);
  if (!pairs) {
    pairs = new Map();
    cache.set(frames, pairs);
  }
  const key = Math.min(from, to) + ':' + Math.max(from, to);
  const saved = pairs.get(key);
  if (saved) return saved;
  const result = document.createElement('canvas');
  result.width = frames[from].width;
  result.height = frames[from].height;
  const ctx = result.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 0.5;
  ctx.drawImage(frames[from], 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(frames[to], 0, 0);
  pairs.set(key, result);
  return result;
}

export const spriteRise = (frame: number) =>
  frame >= 39 ? 32 : frame === 38 ? 16 : 0;
