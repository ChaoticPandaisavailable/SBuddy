// Remove pale matte pixels only at an already transparent silhouette boundary.
// Interior shirt fabric and eye highlights never participate in this operation.
export function cleanSpriteEdges(pixels: ImageData, preset: 'female' | 'male') {
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

  // A generated matte also contaminates darker, colored antialias pixels.
  // Restore a solid pixel-art contour instead of merely deleting white pixels.
  const snapshot = new Uint8ClampedArray(data);
  const contour = preset === 'female' ? [73, 44, 32] : [29, 36, 49];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      if (!snapshot[p + 3]) continue;
      const exposed = [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
      ].some(([dx, dy]) => {
        const nx = x + dx,
          ny = y + dy;
        return (
          nx < 0 ||
          ny < 0 ||
          nx >= width ||
          ny >= height ||
          snapshot[(ny * width + nx) * 4 + 3] === 0
        );
      });
      if (!exposed) continue;
      const brightness = (snapshot[p] + snapshot[p + 1] + snapshot[p + 2]) / 3;
      if (brightness <= 75) continue;
      let color = contour;
      let nearest = Infinity;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx,
            ny = y + dy,
            distance = dx * dx + dy * dy;
          if (
            !distance ||
            distance >= nearest ||
            nx < 0 ||
            ny < 0 ||
            nx >= width ||
            ny >= height
          )
            continue;
          const q = (ny * width + nx) * 4;
          if (
            snapshot[q + 3] &&
            (snapshot[q] + snapshot[q + 1] + snapshot[q + 2]) / 3 < 75
          ) {
            nearest = distance;
            color = [snapshot[q], snapshot[q + 1], snapshot[q + 2]];
          }
        }
      }
      data[p] = color[0];
      data[p + 1] = color[1];
      data[p + 2] = color[2];
      data[p + 3] = 255;
    }
  }
}
