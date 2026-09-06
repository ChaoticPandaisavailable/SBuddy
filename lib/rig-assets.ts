import type { BodyPreset, RigAppearance } from './companion-rig';
import { readAsset } from './sbuddy-storage';
import { validateSpriteImage } from './sprite-assets';
type Rect = [number, number, number, number];
const DEFAULT_RECTS: Record<BodyPreset, Rect[]> = {
  female: [
    [55, 21, 345, 296],
    [505, 8, 675, 327],
    [906, 31, 1014, 282],
    [1293, 28, 1385, 323],
    [138, 363, 249, 618],
    [535, 359, 631, 651],
    [896, 345, 1025, 633],
    [1296, 352, 1376, 651],
    [127, 672, 260, 969],
    [541, 680, 621, 981],
    [915, 682, 1011, 980],
    [1196, 682, 1486, 957],
  ],
  male: [
    [65, 30, 333, 322],
    [495, 14, 675, 332],
    [917, 28, 1011, 306],
    [1298, 17, 1375, 329],
    [140, 368, 237, 644],
    [544, 364, 623, 661],
    [908, 341, 1026, 661],
    [1294, 342, 1383, 669],
    [119, 680, 248, 997],
    [531, 675, 629, 1010],
    [912, 691, 991, 997],
    [1216, 687, 1485, 982],
  ],
};
const PROP_RECTS: Rect[] = [
  [34, 122, 638, 577],
  [790, 75, 1092, 599],
  [44, 729, 626, 1141],
  [684, 786, 1206, 1081],
];
const cache = new Map<string, Promise<HTMLCanvasElement[]>>();
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error('人物素材无法读取，请重新生成或恢复有效备份。'));
    image.src = src;
  });
}
function extract(
  image: HTMLImageElement,
  rect: Rect,
  validate = false,
  neutralMatte = false,
): HTMLCanvasElement {
  const [left, top, right, bottom] = rect;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(right - left);
  canvas.height = Math.ceil(bottom - top);
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(
    image,
    left,
    top,
    right - left,
    bottom - top,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  if (neutralMatte) {
    // Some authored atlases carry an opaque neutral preview matte. Only remove
    // near-white pixels connected to this cell's exterior; enclosed eye/shirt
    // highlights are deliberately preserved. Uploaded alpha atlases never use this.
    const visited = new Uint8Array(canvas.width * canvas.height),
      queue: number[] = [];
    const enqueue = (n: number) => {
      if (visited[n]) return;
      visited[n] = 1;
      const i = n * 4,
        r = pixels.data[i],
        g = pixels.data[i + 1],
        b = pixels.data[i + 2];
      if (Math.min(r, g, b) > 218 && Math.max(r, g, b) - Math.min(r, g, b) < 17)
        queue.push(n);
    };
    for (let x = 0; x < canvas.width; x++) {
      enqueue(x);
      enqueue((canvas.height - 1) * canvas.width + x);
    }
    for (let y = 0; y < canvas.height; y++) {
      enqueue(y * canvas.width);
      enqueue(y * canvas.width + canvas.width - 1);
    }
    for (let at = 0; at < queue.length; at++) {
      const n = queue[at],
        x = n % canvas.width,
        y = Math.floor(n / canvas.width);
      pixels.data[n * 4 + 3] = 0;
      if (x) enqueue(n - 1);
      if (x < canvas.width - 1) enqueue(n + 1);
      if (y) enqueue(n - canvas.width);
      if (y < canvas.height - 1) enqueue(n + canvas.width);
    }
  }
  let minX = canvas.width,
    minY = canvas.height,
    maxX = 0,
    maxY = 0,
    count = 0;
  for (let y = 0; y < canvas.height; y++)
    for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      if (pixels.data[i + 3] > 160) {
        count++;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        pixels.data[i + 3] = 255;
      } else pixels.data[i + 3] = 0;
    }
  if (
    !count ||
    (validate &&
      (count / (canvas.width * canvas.height) > 0.9 ||
        maxY - minY < 15 ||
        maxX - minX < 8))
  )
    throw new Error(
      '生成的人物部件不完整或背景不透明，未替换原人物，请重新生成。',
    );
  context.putImageData(pixels, 0, 0);
  const output = document.createElement('canvas');
  output.width = maxX - minX + 1;
  output.height = maxY - minY + 1;
  output
    .getContext('2d')!
    .drawImage(
      canvas,
      minX,
      minY,
      output.width,
      output.height,
      0,
      0,
      output.width,
      output.height,
    );
  return output;
}
export async function validateGeneratedRig(
  dataUrl: string,
  version: 1 | 2 | 3 = 1,
): Promise<void> {
  if (version === 3) return validateSpriteImage(dataUrl);
  await generatedParts(dataUrl, version);
}
async function generatedParts(dataUrl: string, version: 1 | 2 = 1) {
  const image = await loadImage(dataUrl);
  if (image.naturalWidth < 512 || image.naturalHeight < 384)
    throw new Error('生成人物的分辨率不足。');
  const w = image.naturalWidth / 4,
    h = image.naturalHeight / (version === 2 ? 4 : 3);
  return Array.from({ length: version === 2 ? 16 : 12 }, (_, i) =>
    extract(
      image,
      [
        (i % 4) * w,
        Math.floor(i / 4) * h,
        ((i % 4) + 1) * w,
        (Math.floor(i / 4) + 1) * h,
      ],
      true,
    ),
  );
}
export function loadChibi(
  appearance: RigAppearance,
): Promise<HTMLCanvasElement[]> {
  const key = 'v2:' + (appearance.atlasKey ?? appearance.preset);
  if (!cache.has(key)) {
    const promise = appearance.atlasKey
      ? readAsset(appearance.atlasKey).then((asset) => {
          if (!asset)
            throw new Error('人物素材缺失，请恢复包含人物素材的备份。');
          return generatedParts(asset, 2);
        })
      : generatedPartsFromUrl(`/characters/${appearance.preset}-chibi-v2.png`);
    cache.set(key, promise);
    void promise.catch(() => cache.delete(key));
  }
  return cache.get(key)!;
}
async function generatedPartsFromUrl(url: string) {
  const image = await loadImage(url),
    w = image.width / 4,
    h = image.height / 4;
  return Array.from({ length: 16 }, (_, i) =>
    extract(
      image,
      [
        (i % 4) * w,
        Math.floor(i / 4) * h,
        ((i % 4) + 1) * w,
        (Math.floor(i / 4) + 1) * h,
      ],
      true,
      true,
    ),
  );
}
export function loadRig(
  appearance: RigAppearance,
): Promise<HTMLCanvasElement[]> {
  const key = appearance.atlasKey ?? appearance.preset;
  if (!cache.has(key)) {
    const promise = appearance.atlasKey
      ? readAsset(appearance.atlasKey).then((asset) => {
          if (!asset)
            throw new Error('人物素材缺失，请恢复包含人物素材的备份。');
          return generatedParts(asset);
        })
      : loadImage(`/characters/${appearance.preset}-rig.png`).then((image) =>
          DEFAULT_RECTS[appearance.preset].map((rect) => extract(image, rect)),
        );
    cache.set(key, promise);
    void promise.catch(() => cache.delete(key));
    if (cache.size > 24) cache.delete(cache.keys().next().value!);
  }
  return cache.get(key)!;
}
export function loadProps(): Promise<HTMLCanvasElement[]> {
  if (!cache.has('props'))
    cache.set(
      'props',
      loadImage('/characters/study-props.png').then((image) =>
        PROP_RECTS.map((rect) => extract(image, rect)),
      ),
    );
  return cache.get('props')!;
}
