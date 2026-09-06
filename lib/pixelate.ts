export async function pixelatePhoto(file: File, size = 192): Promise<string> {
  const source = await loadImage(file);
  const pixels = 32;
  const small = document.createElement('canvas');
  small.width = pixels;
  small.height = pixels;
  const smallContext = small.getContext('2d');
  if (!smallContext) throw new Error('无法创建图片画布');

  const side = Math.min(source.naturalWidth, source.naturalHeight);
  const sx = (source.naturalWidth - side) / 2;
  const sy = (source.naturalHeight - side) / 2;
  smallContext.drawImage(source, sx, sy, side, side, 0, 0, pixels, pixels);

  const output = document.createElement('canvas');
  output.width = size;
  output.height = size;
  const context = output.getContext('2d');
  if (!context) throw new Error('无法生成像素头像');
  context.imageSmoothingEnabled = false;
  context.drawImage(small, 0, 0, size, size);
  return output.toDataURL('image/png');
}

export async function resizeGeneratedAvatar(dataUrl: string, size = 256): Promise<string> {
  const source = await loadImageUrl(dataUrl);
  const output = document.createElement('canvas');
  output.width = size;
  output.height = size;
  const context = output.getContext('2d');
  if (!context) throw new Error('无法整理生成的像素头像');
  context.imageSmoothingEnabled = false;
  context.drawImage(source, 0, 0, size, size);
  return output.toDataURL('image/png');
}

export async function analyzeLocalAvatarStyle(file: File): Promise<AvatarStyle> {
  const source = await loadImage(file);
  const canvas = document.createElement('canvas');
  const size = 64;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return defaultAvatarStyle;
  const side = Math.min(source.naturalWidth, source.naturalHeight);
  context.drawImage(
    source,
    (source.naturalWidth - side) / 2,
    (source.naturalHeight - side) / 2,
    side,
    side,
    0,
    0,
    size,
    size,
  );
  const pixels = context.getImageData(0, 0, size, size).data;
  const hairSamples: number[][] = [];
  const skinSamples: number[][] = [];
  const topSamples: number[][] = [];
  const bottomSamples: number[][] = [];
  let sideHair = 0;
  let glassesScore = 0;

  for (let y = 2; y < size - 2; y += 2) {
    for (let x = 2; x < size - 2; x += 2) {
      const index = (y * size + x) * 4;
      const color = [pixels[index], pixels[index + 1], pixels[index + 2]];
      const brightness = (color[0] * 0.299 + color[1] * 0.587 + color[2] * 0.114) / 255;
      const skinLike = color[0] > color[1] * 1.04 && color[1] > color[2] * 0.82 && color[0] > 90;
      if (y < 27 && brightness < 0.62 && !skinLike) hairSamples.push(color);
      if (skinLike && y > 12 && y < 38 && x > 15 && x < 49) skinSamples.push(color);
      if (y > 31 && y < 49 && brightness > 0.12) topSamples.push(color);
      if (y >= 49 && brightness > 0.15) bottomSamples.push(color);
      if (y > 24 && y < 38 && (x < 17 || x > 47) && brightness < 0.5) sideHair += 1;
      if (y > 21 && y < 31 && x > 16 && x < 48 && brightness < 0.25) glassesScore += 1;
    }
  }

  return {
    hairStyleId: sideHair > 24 ? 'long' : sideHair > 13 ? 'medium' : 'short',
    hairColor: averageColor(hairSamples, defaultAvatarStyle.hairColor),
    skinTone: averageColor(skinSamples, defaultAvatarStyle.skinTone),
    topColor: averageColor(topSamples, defaultAvatarStyle.topColor),
    bottomColor: averageColor(bottomSamples, defaultAvatarStyle.bottomColor),
    accessory: glassesScore > 20 ? 'glasses' : 'none',
  };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('无法读取这张照片'));
    };
    image.src = url;
  });
}

function loadImageUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('无法读取生成的像素头像'));
    image.src = url;
  });
}

function averageColor(samples: number[][], fallback: string): string {
  if (!samples.length) return fallback;
  const channels = samples.reduce(
    (sum, color) => [sum[0] + color[0], sum[1] + color[1], sum[2] + color[2]],
    [0, 0, 0],
  );
  const color = channels.map((channel) => Math.round(channel / samples.length));
  return `#${color.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}
import { defaultAvatarStyle, type AvatarStyle } from '@/lib/avatar-style';
