// Pixel-painted scene objects share one coordinate grid and warm, muted palette.
type Context = CanvasRenderingContext2D;
function rect(
  ctx: Context,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
const desktops = new Map<number, HTMLCanvasElement>();
export function drawPixelDesk(ctx: Context, width: number) {
  let desk = desktops.get(width);
  if (!desk) {
    desk = document.createElement('canvas');
    desk.width = width;
    desk.height = 120;
    const p = desk.getContext('2d')!;
    rect(p, 0, 0, width, 120, '#aa865a');
    // Broad boards, narrow end joints, and broken grain avoid a tiled wallpaper look.
    const rows = [0, 28, 66, 105];
    const shades = ['#b49264', '#bc9b6e', '#c2a375'];
    for (let row = 0; row < 3; row++) {
      const top = rows[row],
        height = rows[row + 1] - top;
      rect(p, 0, top, width, height, shades[row]);
      rect(p, 0, top, width, 1, '#8f704b');
      rect(p, 0, top + 1, width, 1, '#d1b786');
      for (let x = 35 + row * 127; x < width; x += 340) {
        rect(p, x, top + 2, 1, height - 2, '#a8885c');
        rect(p, x + 1, top + 2, 1, height - 2, '#caae7c');
      }
      for (let y = top + 6; y < top + height - 3; y += 6) {
        for (let x = -80 + ((y * 23) % 137); x < width; x += 146) {
          const length = 24 + (((x + 500) * 7 + y * 3) % 61);
          rect(p, x, y, length, 1, y % 12 ? '#ad8c61' : '#cbb07e');
          rect(p, x + length, y + 1, 12, 1, '#b4976a');
        }
      }
    }
    // A small back lip sits immediately under the wrists; front edge has real depth.
    rect(p, 0, 0, width, 2, '#69553e');
    rect(p, 0, 2, width, 2, '#dfc597');
    rect(p, 0, 4, width, 1, '#ad8d62');
    rect(p, 0, 105, width, 2, '#e0c79b');
    rect(p, 0, 107, width, 2, '#8a6846');
    rect(p, 0, 109, width, 11, '#795b40');
    rect(p, 0, 110, width, 2, '#ab8255');
    rect(p, 0, 119, width, 1, '#5a4633');
    // Keep only the most recent sizes when resizing a window.
    if (desktops.size > 5) desktops.clear();
    desktops.set(width, desk);
  }
  ctx.drawImage(desk, -width / 2, 360);
}
export function drawContactShadow(
  ctx: Context,
  x: number,
  y: number,
  half: number,
) {
  rect(ctx, x - half + 3, y - 1, half * 2 - 6, 5, '#59452b19');
  rect(ctx, x - half, y, half * 2, 3, '#59452b24');
  rect(ctx, x - half + 5, y, half * 2 - 10, 1, '#493b2938');
}
const segments = [
  'abcedf',
  'bc',
  'abged',
  'abgcd',
  'fgbc',
  'afgcd',
  'afgecd',
  'abc',
  'abcdefg',
  'abfgcd',
];
function digit(ctx: Context, number: string, x: number, y: number) {
  const boxes: Record<string, number[]> = {
    a: [1, 0, 4, 1],
    b: [5, 1, 1, 4],
    c: [5, 6, 1, 4],
    d: [1, 10, 4, 1],
    e: [0, 6, 1, 4],
    f: [0, 1, 1, 4],
    g: [1, 5, 4, 1],
  };
  for (const [key, b] of Object.entries(boxes))
    rect(
      ctx,
      x + b[0],
      y + b[1],
      b[2],
      b[3],
      segments[Number(number)].includes(key) ? '#374b42' : '#aebba2',
    );
}
export function drawDeskClock(
  ctx: Context,
  x: number,
  y: number,
  time: string,
) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  drawContactShadow(ctx, 2, 17, 34);
  rect(ctx, -27, 12, 7, 5, '#504d3e');
  rect(ctx, 20, 12, 7, 5, '#504d3e');
  rect(ctx, -32, -15, 64, 29, '#424d42');
  rect(ctx, -30, -16, 60, 2, '#a5a88a');
  rect(ctx, -30, -13, 60, 24, '#7b8971');
  rect(ctx, -27, -10, 54, 18, '#303f36');
  rect(ctx, -26, -9, 52, 16, '#c0cbb0');
  rect(ctx, -26, -9, 52, 2, '#9cac93');
  rect(ctx, -31, 11, 62, 2, '#c5c7a2');
  rect(ctx, -21, -18, 10, 2, '#535e50');
  rect(ctx, 14, -18, 6, 2, '#535e50');
  const chars = time.replace(':', '').slice(0, 4).padStart(4, '0');
  chars.split('').forEach((char, i) =>
    digit(ctx, char, -19 + i * 9 + (i > 1 ? 3 : 0), -6),
  );
  rect(ctx, 0, -3, 1, 2, '#374b42');
  rect(ctx, 0, 2, 1, 2, '#374b42');
  ctx.restore();
}
export function drawDeskBooks(ctx: Context, x: number, y: number) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  drawContactShadow(ctx, 2, 15, 35);
  const book = (
    left: number,
    top: number,
    width: number,
    color: string,
    shade: string,
  ) => {
    rect(ctx, left, top, width, 9, shade);
    rect(ctx, left, top, width, 2, color);
    rect(ctx, left + 4, top + 2, width - 6, 5, '#e9ddbc');
    rect(ctx, left + 5, top + 4, width - 8, 1, '#c6b894');
    rect(ctx, left + 5, top + 6, width - 8, 1, '#d1c5a4');
    rect(ctx, left, top, 4, 9, color);
    rect(ctx, left + 1, top + 2, 1, 4, '#e5cf9c');
  };
  book(-32, 5, 64, '#68765a', '#3f5547');
  book(-27, -3, 58, '#ac7857', '#76513e');
  book(-30, -11, 57, '#7d8b72', '#506354');
  rect(ctx, -27, -14, 51, 3, '#8d9d80');
  rect(ctx, -20, -13, 31, 1, '#b3b897');
  rect(ctx, 16, -1, 4, 13, '#ad604b');
  rect(ctx, 17, 12, 2, 2, '#ad604b');
  ctx.restore();
}
export function drawDeskLaptop(
  ctx: Context,
  x: number,
  y: number,
  active: boolean,
) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  drawContactShadow(ctx, 2, 21, 38);
  rect(ctx, -30, -22, 60, 35, '#354847');
  rect(ctx, -28, -23, 56, 1, '#c0c9b6');
  rect(ctx, -28, -20, 56, 31, '#7e9390');
  rect(ctx, -25, -17, 50, 25, '#c2d2c5');
  rect(ctx, -24, -16, 48, 3, '#77948c');
  rect(ctx, -1, -20, 2, 1, '#263b38');
  for (let i = 0; i < 2; i++) {
    const left = -21 + i * 23;
    rect(ctx, left, -10, 20, 15, active ? '#8caa92' : '#a0b6a3');
    rect(ctx, left + 7, -8, 5, 5, '#dcd2ad');
    rect(ctx, left + 4, -3, 11, 6, i ? '#677c80' : '#778b68');
  }
  rect(ctx, -32, 12, 64, 3, '#91a39a');
  rect(ctx, -35, 15, 70, 3, '#b9c2aa');
  rect(ctx, -37, 18, 74, 2, '#526964');
  for (let row = 0; row < 2; row++)
    for (let col = 0; col < 10; col++)
      rect(ctx, -26 + col * 5, 12 + row * 2, 4, 1, '#657b73');
  rect(ctx, -8, 17, 16, 1, '#e0e1c9');
  ctx.restore();
}
