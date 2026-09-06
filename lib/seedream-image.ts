import { decode, encode } from 'fast-png';

// Seedream returns RGB PNG. Only its explicitly requested magenta matte is keyed;
// pale clothing, skin and enclosed colored details are never treated as background.
export function removeSeedreamMatte(dataUrl: string): string {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=\r\n]+)$/.exec(dataUrl);
  if (!match || match[1].length > 32 * 1024 * 1024)
    throw new Error('Invalid generated PNG');
  const raw = atob(match[1]);
  const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
  if (bytes.length < 33) throw new Error('Invalid generated PNG');
  const view = new DataView(bytes.buffer);
  const width = view.getUint32(16),
    height = view.getUint32(20);
  if (
    !width ||
    !height ||
    width > 3072 ||
    height > 4096 ||
    width * height > 5_000_000
  )
    throw new Error('Generated PNG dimensions are unsupported');
  const decoded = decode(bytes, { checkCrc: true });
  if (decoded.depth !== 8 || ![3, 4].includes(decoded.channels))
    throw new Error('Generated PNG color format is unsupported');
  const pixels = width * height;
  const rgba =
    decoded.channels === 4
      ? new Uint8Array(decoded.data)
      : new Uint8Array(pixels * 4);
  if (decoded.channels === 3) {
    for (let i = 0; i < pixels; i++) {
      rgba[i * 4] = decoded.data[i * 3];
      rgba[i * 4 + 1] = decoded.data[i * 3 + 1];
      rgba[i * 4 + 2] = decoded.data[i * 3 + 2];
      rgba[i * 4 + 3] = 255;
    }
  }
  const queue = new Int32Array(pixels);
  let read = 0,
    written = 0;
  const add = (i: number) => {
    const p = i * 4,
      r = rgba[p],
      g = rgba[p + 1],
      b = rgba[p + 2];
    if (
      rgba[p + 3] &&
      r > 160 &&
      b > 100 &&
      g < 110 &&
      r - g > 90 &&
      b - g > 40
    ) {
      rgba[p + 3] = 0;
      queue[written++] = i;
    }
  };
  for (let x = 0; x < width; x++) {
    add(x);
    add((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    add(y * width);
    add(y * width + width - 1);
  }
  while (read < written) {
    const i = queue[read++],
      x = i % width;
    if (x > 0) add(i - 1);
    if (x < width - 1) add(i + 1);
    if (i >= width) add(i - width);
    if (i < pixels - width) add(i + width);
  }
  if (!written) return dataUrl;
  const png = encode({ width, height, data: rgba, depth: 8, channels: 4 });
  let binary = '';
  for (let i = 0; i < png.length; i += 0x8000)
    binary += String.fromCharCode(...png.subarray(i, i + 0x8000));
  return 'data:image/png;base64,' + btoa(binary);
}
