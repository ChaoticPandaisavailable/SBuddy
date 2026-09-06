import { cleanSpriteEdges } from './sprite-edge-cleanup';
// Reviewed rectangles for the new pose sheets. Generated sheets are not assumed
// to have a perfect grid; row bounds keep every hand and foot inside its cell.
export function extractExtraPoses(
  image: HTMLImageElement,
  preset: 'female' | 'male',
  originals: HTMLCanvasElement[],
) {
  const female = preset === 'female';
  const xs = female
    ? [0, 170, 317, 464, 612, 759, 972]
    : [0, 201, 351, 505, 649, 795, 971];
  const ys = female
    ? [0, 174, 340, 508, 678, 845, 1009, 1170, 1298, 1460, 1619]
    : [0, 158, 307, 455, 606, 754, 902, 1052, 1196, 1385, 1619];
  const rowScales = new Map<number, number>();
  return Array.from({ length: 60 }, (_, index) => {
    const row = Math.floor(index / 6),
      col = index % 6;
    const cell = document.createElement('canvas');
    cell.width = xs[col + 1] - xs[col];
    cell.height = ys[row + 1] - ys[row];
    const ctx = cell.getContext('2d')!;
    ctx.drawImage(
      image,
      xs[col],
      ys[row],
      cell.width,
      cell.height,
      0,
      0,
      cell.width,
      cell.height,
    );
    const pixels = ctx.getImageData(0, 0, cell.width, cell.height);
    // Source files stay intact. Mask only the connected light neutral backdrop
    // during rendering; enclosed shirt, skin and eye highlights stay untouched.
    const seen = new Uint8Array(cell.width * cell.height);
    const queue: number[] = [];
    const add = (i: number) => {
      if (seen[i]) return;
      seen[i] = 1;
      const p = i * 4,
        r = pixels.data[p],
        g = pixels.data[p + 1],
        b = pixels.data[p + 2];
      if (
        pixels.data[p + 3] < 10 ||
        (Math.min(r, g, b) >= 204 && Math.max(r, g, b) - Math.min(r, g, b) < 18)
      )
        queue.push(i);
    };
    for (let x = 0; x < cell.width; x++) {
      add(x);
      add((cell.height - 1) * cell.width + x);
    }
    for (let y = 0; y < cell.height; y++) {
      add(y * cell.width);
      add(y * cell.width + cell.width - 1);
    }
    for (let at = 0; at < queue.length; at++) {
      const i = queue[at],
        x = i % cell.width,
        y = Math.floor(i / cell.width);
      pixels.data[i * 4 + 3] = 0;
      if (x > 0) add(i - 1);
      if (x + 1 < cell.width) add(i + 1);
      if (y > 0) add(i - cell.width);
      if (y + 1 < cell.height) add(i + cell.width);
    }
    cleanSpriteEdges(pixels);
    let top = cell.height,
      bottom = 0;
    for (let y = 0; y < cell.height; y++)
      for (let x = 0; x < cell.width; x++) {
        if (pixels.data[(y * cell.width + x) * 4 + 3] > 128) {
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
      }
    if (bottom <= top) throw new Error('补充动作素材缺失，请刷新后重试。');
    const hair = (data: Uint8ClampedArray, p: number) =>
      data[p + 3] > 128 &&
      (female
        ? data[p] > data[p + 1] * 1.1 &&
          data[p + 1] > data[p + 2] * 1.05 &&
          data[p] < 210
        : data[p + 2] > data[p] * 1.1 &&
          data[p + 2] >= data[p + 1] &&
          data[p + 2] < 190);
    let left = cell.width,
      right = 0;
    // Register the head only, so a waving arm cannot shift the entire character.
    const headHeight = 80;
    for (let y = top; y < Math.min(bottom, top + headHeight); y++)
      for (let x = 0; x < cell.width; x++) {
        if (hair(pixels.data, (y * cell.width + x) * 4)) {
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
      }
    ctx.putImageData(pixels, 0, 0);
    const ref = originals[row === 9 ? 42 : row === 8 && col >= 3 ? 39 : 0];
    const refPixels = ref.getContext('2d')!.getImageData(0, 0, 256, 256).data;
    let refLeft = 256,
      refRight = 0;
    for (let y = 25; y < 100; y++)
      for (let x = 0; x < 256; x++) {
        if (hair(refPixels, (y * 256 + x) * 4)) {
          refLeft = Math.min(refLeft, x);
          refRight = Math.max(refRight, x);
        }
      }
    if (!rowScales.has(row))
      rowScales.set(row, (refRight - refLeft + 1) / (right - left + 1));
    const scale = rowScales.get(row)!;
    let centerLeft = cell.width,
      centerRight = 0;
    for (let y = top; y < Math.min(bottom, top + 40); y++)
      for (let x = 0; x < cell.width; x++) {
        if (hair(pixels.data, (y * cell.width + x) * 4)) {
          centerLeft = Math.min(centerLeft, x);
          centerRight = Math.max(centerRight, x);
        }
      }
    const output = document.createElement('canvas');
    output.width = output.height = 256;
    const out = output.getContext('2d')!;
    out.imageSmoothingEnabled = false;
    const topY =
      row === 9
        ? Math.max(12, 232 - (bottom - top) * scale)
        : row === 8
          ? [25, 33, 27, 22, 17, 17][col]
          : 25;
    out.drawImage(
      cell,
      Math.round(128 - ((centerLeft + centerRight) / 2) * scale),
      Math.round(topY - top * scale),
      Math.round(cell.width * scale),
      Math.round(cell.height * scale),
    );
    return output;
  });
}
