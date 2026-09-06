// Single-character portrait validation is independent of animation-sheet rules.
export function portraitBounds(
  pixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
) {
  let left = width,
    top = height,
    right = -1,
    bottom = -1,
    clear = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const alpha = pixels[(y * width + x) * 4 + 3];
      if (alpha < 10) clear++;
      if (alpha > 180) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  if (right < left || bottom < top)
    throw new Error('生成图片里没有可显示的人物，请换一张照片。');
  if (clear / (width * height) < 0.05)
    throw new Error('生成图片的背景尚未去除，请先下载预览；当前人物未替换。');
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}
export async function loadPortraitFrame(
  url: string,
): Promise<HTMLCanvasElement> {
  if (
    !/^data:image\/png;base64,[A-Za-z0-9+/=\r\n]+$/.test(url) ||
    url.length > 32 * 1024 * 1024
  )
    throw new Error('静态人物素材格式无效。');
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('静态人物素材无法读取。'));
    im.src = url;
  });
  if (
    image.width < 256 ||
    image.height < 256 ||
    image.width * image.height > 5_000_000
  )
    throw new Error('静态人物图片尺寸不受支持。');
  const source = document.createElement('canvas');
  source.width = image.width;
  source.height = image.height;
  const ctx = source.getContext('2d')!;
  ctx.drawImage(image, 0, 0);
  const bounds = portraitBounds(
    ctx.getImageData(0, 0, source.width, source.height).data,
    source.width,
    source.height,
  );
  const frame = document.createElement('canvas');
  frame.width = 256;
  frame.height = 256;
  const out = frame.getContext('2d')!;
  out.imageSmoothingEnabled = false;
  const scale = Math.min(208 / bounds.width, 212 / bounds.height),
    w = Math.round(bounds.width * scale),
    h = Math.round(bounds.height * scale);
  out.drawImage(
    source,
    bounds.left,
    bounds.top,
    bounds.width,
    bounds.height,
    Math.round((256 - w) / 2),
    232 - h,
    w,
    h,
  );
  return frame;
}
