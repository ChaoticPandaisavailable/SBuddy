import { solveArm, footTarget, type ChibiPose, type Point } from './chibi-rig';
import type { DeskActivity } from './companion-behavior';
type Context = CanvasRenderingContext2D;
function image(
  ctx: Context,
  part: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
  rotation = 0,
  anchor = 0,
) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(rotation);
  ctx.drawImage(part, -w / 2, -anchor, w, h);
  ctx.restore();
}
function bone(
  ctx: Context,
  part: HTMLCanvasElement,
  a: Point,
  b: Point,
  width: number,
) {
  image(
    ctx,
    part,
    a.x,
    a.y,
    width,
    Math.hypot(b.x - a.x, b.y - a.y) + 12,
    Math.atan2(b.y - a.y, b.x - a.x) - Math.PI / 2,
    6,
  );
}
function bodyOrigin(p: ChibiPose) {
  return { x: p.x, y: 168 - p.rise - p.breath };
}
function view(p: ChibiPose) {
  return Math.abs(p.turn) > 0.72 ? 2 : Math.abs(p.turn) > 0.25 ? 1 : 0;
}
export function drawChibiBody(
  ctx: Context,
  parts: HTMLCanvasElement[],
  p: ChibiPose,
) {
  const origin = bodyOrigin(p),
    side = view(p),
    flip = p.turn > 0 ? -1 : 1;
  ctx.save();
  ctx.translate(origin.x, origin.y);
  // Legs share the pelvis hierarchy. Their bend direction stays fixed.
  for (const sign of [-1, 1]) {
    const hip = { x: sign * (side === 2 ? 9 : 17), y: 67 };
    const target = footTarget(p, sign);
    const { elbow: knee, hand: foot } = solveArm(
      hip,
      target,
      (side === 2 ? -Math.sign(p.turn) : -sign) as -1 | 1,
      49,
      52,
    );
    bone(ctx, parts[14], hip, knee, 24);
    bone(ctx, parts[15], knee, foot, 27);
  }
  ctx.save();
  ctx.scale(flip, 1);
  image(ctx, parts[7], 0, 57, side === 2 ? 44 : 66, 39);
  image(
    ctx,
    parts[4 + side],
    0,
    -3,
    side === 2 ? 47 : side === 1 ? 66 : 76,
    78,
  );
  ctx.restore();
  ctx.restore();
}
export function drawChibiHead(
  ctx: Context,
  parts: HTMLCanvasElement[],
  p: ChibiPose,
) {
  const origin = bodyOrigin(p),
    side = view(p),
    flip = p.turn > 0 ? -1 : 1;
  ctx.save();
  ctx.translate(origin.x, origin.y + p.nod);
  ctx.scale(flip, 1);
  image(
    ctx,
    parts[side === 0 && p.blink > 0.5 ? 3 : side],
    side === 2 ? -3 : 0,
    4,
    side === 2 ? 96 : 112,
    99,
    p.headTilt,
    96,
  );
  ctx.restore();
}
export function drawChibiHands(
  ctx: Context,
  parts: HTMLCanvasElement[],
  p: ChibiPose,
) {
  const origin = bodyOrigin(p),
    side = view(p);
  for (const sign of [-1, 1]) {
    const left = sign === -1;
    if (side === 2 && sign !== (p.turn > 0 ? 1 : -1)) continue;
    const shoulder = {
      x: origin.x + sign * (side === 2 ? 15 : 30),
      y: origin.y + 16,
    };
    const target = {
      x: origin.x + (left ? p.leftX : p.rightX),
      y: (left ? p.leftY : p.rightY) - p.rise,
    };
    if (side === 2) {
      shoulder.x = origin.x + sign * 4;
      target.x = origin.x + p.stride * sign * 12;
    }
    const { elbow, hand } = solveArm(
      shoulder,
      target,
      (left ? p.leftBend : p.rightBend) >= 0 ? 1 : -1,
    );
    bone(ctx, parts[left ? 8 : 10], shoulder, elbow, 27);
    bone(ctx, parts[left ? 9 : 11], elbow, hand, 24);
    // Separate authored grip/open palms avoid stretching fingers with the forearm.
    const angle =
      !left && p.pen > 0.5
        ? 0.18
        : Math.atan2(hand.y - elbow.y, hand.x - elbow.x) - Math.PI / 2;
    image(
      ctx,
      parts[!left && p.pen > 0.5 ? 13 : 12],
      hand.x,
      hand.y - 3,
      21,
      24,
      angle,
      4,
    );
    if (!left && p.pen > 0.5) {
      ctx.save();
      ctx.translate(hand.x + 3, hand.y + 9);
      ctx.rotate(0.38);
      ctx.fillStyle = '#302c28';
      ctx.fillRect(-1, -13, 3, 25);
      ctx.fillStyle = '#d5b56c';
      ctx.fillRect(0, -10, 1, 19);
      ctx.fillStyle = '#eee2bd';
      ctx.fillRect(-1, 12, 3, 3);
      ctx.fillStyle = '#292b29';
      ctx.fillRect(0, 15, 1, 2);
      ctx.restore();
    }
  }
}
export function drawTableItems(
  ctx: Context,
  objects: HTMLCanvasElement[] | undefined,
  p: ChibiPose,
) {
  if (objects) image(ctx, objects[2], 8, 250, 117, 45);
  // Pen rests at a fixed pickup anchor. It only changes owner when the hand arrives.
  if (p.pen <= 0.5) {
    ctx.save();
    ctx.translate(61, 261);
    ctx.rotate(-0.4);
    ctx.fillStyle = '#332c24';
    ctx.fillRect(-1, -9, 3, 26);
    ctx.fillStyle = '#dab86d';
    ctx.fillRect(0, -6, 1, 17);
    ctx.restore();
  }
}
/** Pixel-built desk props use the same fixed scene coordinates as their hit areas. */
export function drawDeskObjects(
  ctx: Context,
  active?: DeskActivity,
  spread = 92,
) {
  const rect = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };
  // Clock: stepped silhouette, warm casing and a recessed luminous display.
  ctx.save();
  ctx.translate(92 - spread, 0);
  rect(-126, 306, 70, 6, '#52351f55');
  rect(-123, 266, 64, 40, '#302e29');
  rect(-125, 272, 68, 28, '#302e29');
  rect(-121, 267, 60, 35, '#d8bc85');
  rect(-119, 269, 56, 30, '#aa8b59');
  rect(-116, 273, 50, 22, '#273b35');
  rect(-115, 274, 48, 2, '#172d29');
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = active === 'study' ? '#e6edb0' : '#b3cfaa';
  const date = new Date();
  ctx.fillText(
    `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
    -91,
    290,
  );
  rect(-115, 303, 8, 4, '#302e29');
  rect(-74, 303, 8, 4, '#302e29');
  ctx.restore();
  // Bound volumes sit below the working notebook, clear of the writing hand.
  rect(-36, 311, 73, 5, '#52351f55');
  for (const [x, y, w, c] of [
    [-35, 302, 68, '#4d635b'],
    [-30, 291, 66, '#975e49'],
    [-35, 280, 65, '#b79a59'],
  ] as const) {
    rect(x, y, w, 12, '#3c322a');
    rect(x + 2, y + 2, w - 4, 8, c);
    rect(x + 8, y + 3, w - 12, 5, '#eee0b9');
    rect(x + 9, y + 5, w - 13, 1, '#baa981');
    rect(x + 2, y + 1, 5, 10, c);
    rect(x + 1, y, w - 2, 2, c);
  }
  rect(-17, 278, 23, 2, '#e2cb95');
  // Laptop is angled away from the face and notebook; the screen remains readable.
  ctx.save();
  ctx.translate(spread - 92, 0);
  rect(53, 316, 82, 5, '#52351f55');
  rect(60, 251, 66, 47, '#343d3c');
  rect(63, 254, 60, 39, '#819c94');
  rect(66, 257, 54, 32, '#d0d9b5');
  rect(68, 259, 50, 4, '#526e69');
  rect(70, 267, 17, 16, active === 'meeting' ? '#879e73' : '#adc1a1');
  rect(90, 268, 23, 2, '#6d8774');
  rect(90, 274, 19, 2, '#91a486');
  rect(90, 280, 21, 2, '#91a486');
  rect(61, 297, 64, 3, '#b8c1ae');
  rect(57, 300, 72, 5, '#a0afa2');
  rect(53, 305, 80, 8, '#647a72');
  rect(55, 305, 76, 5, '#b5c1ad');
  for (let row = 0; row < 2; row++)
    for (let col = 0; col < 10; col++)
      rect(62 + col * 6, 299 + row * 4, 4, 2, '#546b63');
  rect(84, 308, 17, 2, '#82988b');
  ctx.restore();
}
export function cover(
  ctx: Context,
  source: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const scale = Math.max(w / source.width, h / source.height);
  const sw = w / scale,
    sh = h / scale;
  ctx.drawImage(
    source,
    (source.width - sw) / 2,
    (source.height - sh) / 2,
    sw,
    sh,
    x,
    y,
    w,
    h,
  );
}
