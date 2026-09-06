import { loadPortraitFrame } from './portrait-image';
import type { RigAppearance } from './companion-rig';
import { readAsset } from './sbuddy-storage';

export function spriteImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('序列帧素材无法读取，原人物已保留。'));
    im.src = url;
  });
}
export async function validateSpriteImage(url: string) {
  const im = await spriteImage(url),
    c = document.createElement('canvas');
  if (
    im.width < 600 ||
    im.width > 3072 ||
    im.height > 4096 ||
    im.height < 800 ||
    Math.abs(im.width / im.height - 0.75) > 0.015
  )
    throw new Error('序列帧必须是完整的六列八行动作图。');
  c.width = im.width;
  c.height = im.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(im, 0, 0);
  const p = ctx.getImageData(0, 0, c.width, c.height).data;
  for (let row = 0; row < 8; row++)
    for (let col = 0; col < 6; col++) {
      let opaque = 0,
        clear = 0,
        total = 0,
        edge = 0,
        edgeSolid = 0;
      const x0 = Math.floor((col * c.width) / 6),
        x1 = Math.floor(((col + 1) * c.width) / 6),
        y0 = Math.floor((row * c.height) / 8),
        y1 = Math.floor(((row + 1) * c.height) / 8);
      for (let y = y0; y < y1; y += 2)
        for (let x = x0; x < x1; x += 2) {
          const a = p[(y * c.width + x) * 4 + 3];
          total++;
          if (a > 200) opaque++;
          if (a < 10) clear++;
          if (x < x0 + 3 || x > x1 - 4 || y < y0 + 3 || y > y1 - 4) {
            edge++;
            if (a > 100) edgeSolid++;
          }
        }
      if (
        opaque / total < 0.03 ||
        opaque / total > 0.8 ||
        clear / total < 0.18 ||
        edgeSolid / Math.max(1, edge) > 0.05
      )
        throw new Error(
          '序列帧缺帧、背景不透明或人物越过帧边界，未替换原人物。',
        );
    }
}
const loaded = new Map<string, Promise<HTMLCanvasElement[]>>();
export async function loadSpriteFrames(
  appearance: RigAppearance,
): Promise<HTMLCanvasElement[]> {
  const key = appearance.atlasKey ?? appearance.preset;
  if (!loaded.has(key))
    loaded.set(
      key,
      (async () => {
        const custom = !!appearance.atlasKey;
        const url = custom
          ? await readAsset(appearance.atlasKey!)
          : `/characters/${appearance.preset}-sprite-v3.png`;
        if (!url) throw new Error('人物序列帧缺失，请恢复包含素材的备份。');
        if (appearance.rigVersion === 4) return [await loadPortraitFrame(url)];
        const im = await spriteImage(url),
          female = appearance.preset === 'female';
        // Default sheets use reviewed, authored frame rectangles. Uploaded V3 uses the fixed grid contract.
        const xs = female
          ? [50, 210, 385, 560, 735, 910, 1086]
          : [130, 290, 455, 620, 785, 950, 1120];
        const ys = female
          ? [0, 185, 370, 555, 740, 925, 1070, 1265, 1448]
          : [0, 155, 308, 458, 608, 758, 908, 1085, 1295];
        return Array.from({ length: 48 }, (_, i) => {
          const row = Math.floor(i / 6),
            col = i % 6;
          const x0 = custom ? (col * im.width) / 6 : xs[col],
            x1 = custom ? ((col + 1) * im.width) / 6 : xs[col + 1];
          let y0 = custom ? (row * im.height) / 8 : ys[row],
            y1 = custom ? ((row + 1) * im.height) / 8 : ys[row + 1];
          if (!custom && female && col === 0 && row === 5) y1 = 1110;
          if (!custom && female && col === 0 && row === 6) y0 = 1110;
          const source = document.createElement('canvas');
          source.width = Math.ceil(x1 - x0);
          source.height = Math.ceil(y1 - y0);
          const ctx = source.getContext('2d')!;
          ctx.drawImage(
            im,
            x0,
            y0,
            x1 - x0,
            y1 - y0,
            0,
            0,
            source.width,
            source.height,
          );
          const pixels = ctx.getImageData(0, 0, source.width, source.height);
          let left = source.width,
            right = 0,
            top = source.height,
            bottom = 0;
          // Remove only low-alpha fringe. Never delete pale RGB colors or attempt to key out a background.
          for (let y = 0; y < source.height; y++)
            for (let x = 0; x < source.width; x++) {
              const at = (y * source.width + x) * 4;
              if (pixels.data[at + 3] < 200) pixels.data[at + 3] = 0;
              else {
                pixels.data[at + 3] = 255;
                left = Math.min(left, x);
                right = Math.max(right, x);
                top = Math.min(top, y);
                bottom = Math.max(bottom, y);
              }
            }
          ctx.putImageData(pixels, 0, 0);
          const output = document.createElement('canvas');
          output.width = 256;
          output.height = 256;
          const out = output.getContext('2d')!;
          out.imageSmoothingEnabled = false;
          if (custom) out.drawImage(source, 0, 0, 256, 256);
          else {
            const standing = row === 7 || (row === 6 && col >= 3);
            const scale = standing
              ? female
                ? 1.16
                : 1.18
              : female
                ? 1.15
                : 1.02;
            // Register by the head silhouette, not waving hands or independently cropped limbs.
            let hl = source.width,
              hr = 0;
            for (
              let y = top;
              y < Math.min(bottom, top + (standing ? 65 : 75));
              y++
            )
              for (let x = left; x <= right; x++)
                if (pixels.data[(y * source.width + x) * 4 + 3] > 0) {
                  hl = Math.min(hl, x);
                  hr = Math.max(hr, x);
                }
            const headX = (hl + hr) / 2;
            const registeredY =
              row === 7
                ? Math.max(12, 232 - (bottom - top) * scale)
                : row === 6
                  ? [20, 28, 18, 12, 12, 12][col]
                  : 20;
            const dy =
              registeredY + 5 + (i >= 6 && i <= 9 ? 6 : i === 10 ? 3 : 0);
            out.drawImage(
              source,
              Math.round(128 - headX * scale),
              Math.round(dy - top * scale),
              Math.round(source.width * scale),
              Math.round(source.height * scale),
            );
          }
          return output;
        });
      })().catch((error) => {
        loaded.delete(key);
        throw error;
      }),
    );
  return loaded.get(key)!;
}
