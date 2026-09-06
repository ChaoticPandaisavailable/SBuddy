// Remove pale matte pixels only at an already transparent silhouette boundary.
// Interior shirt fabric and eye highlights never participate in this operation.
export function cleanSpriteEdges(pixels: ImageData) {
  const { data, width, height } = pixels;
  for (let pass = 0; pass < 2; pass++) {
    const remove: number[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = (y * width + x) * 4;
        if (!data[p + 3]) continue;
        const low = Math.min(data[p], data[p + 1], data[p + 2]);
        const high = Math.max(data[p], data[p + 1], data[p + 2]);
        if (low < 125 || high - low > 65) continue;
        let exposed = false;
        for (let dy = -1; dy <= 1 && !exposed; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx,
              ny = y + dy;
            if (
              nx < 0 ||
              ny < 0 ||
              nx >= width ||
              ny >= height ||
              data[(ny * width + nx) * 4 + 3] === 0
            ) {
              exposed = true;
              break;
            }
          }
        }
        if (exposed) remove.push(p);
      }
    }
    for (const p of remove) data[p + 3] = 0;
  }
}
