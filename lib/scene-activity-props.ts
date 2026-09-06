import type { SpriteRuntime } from './sprite-animation';

// Keep the V3 photo/backup contract intact. Classroom playback uses the existing
// pen-free, complete poses, with a separate page timeline shared by every skin.
export function sampleDeskActivity(
  r: SpriteRuntime,
  now: number,
  reduced = false,
) {
  const classroom = r.current === 'class';
  const meeting = r.current === 'meeting';
  const closing = r.phase === 'join';
  const elapsed =
    r.steps.slice(0, r.index).reduce((sum, step) => sum + step.duration, 0) +
    Math.max(0, now - r.at);
  const duration = r.steps.reduce((sum, step) => sum + step.duration, 0);
  const presence = closing ? Math.max(0, 1 - elapsed / duration) : 1;
  // Read, reach for the corner, turn right to left, then smooth the page.
  const page = reduced ? 0 : Math.max(0, Math.min(1, (elapsed - 3500) / 1450));
  return {
    book: classroom ? presence : 0,
    laptop: meeting ? presence : 0,
    page: closing ? 0 : page,
    frame: classroom
      ? closing || elapsed < 3000 || elapsed >= 5070
        ? 0
        : 19
      : undefined,
  };
}

export function drawClassBook(
  ctx: CanvasRenderingContext2D,
  scale: number,
  page: number,
  presence: number,
  preset: 'female' | 'male',
) {
  ctx.save();
  ctx.translate(0, 369);
  ctx.scale(
    Math.min(scale, 1.5) * (0.62 + 0.38 * presence),
    0.25 + 0.75 * presence,
  );
  const rect = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  };
  rect(-47, -8, 94, 32, '#526a59');
  rect(-45, -10, 90, 30, '#d0bea0');
  rect(-44, -12, 43, 30, '#fff1d2');
  rect(1, -12, 43, 30, '#fffae6');
  rect(-1, -12, 2, 30, '#b3a68b');
  for (let y = -6; y < 15; y += 5) {
    rect(-38, y, 30, 1, '#c2b99e');
    rect(8, y, 29, 1, '#c2b99e');
  }
  if (page > 0 && page < 1 && presence > 0) {
    // Pixel-stepped leaf bends over the spine; its outer corner carries the hand.
    const t = Math.round(page * 16) / 16;
    const x = Math.round(Math.cos(t * Math.PI) * 43);
    const lift = Math.round(Math.sin(t * Math.PI) * 33 * presence);
    ctx.fillStyle = '#554b3433';
    ctx.fillRect(Math.min(0, x), -9, Math.abs(x), 30);
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(x, -12 - lift);
    ctx.lineTo(x, 18 - lift);
    ctx.lineTo(0, 18);
    ctx.closePath();
    ctx.fillStyle = t < 0.5 ? '#fffbe9' : '#e6d8b9';
    ctx.fill();
    ctx.strokeStyle = '#baac8d';
    ctx.lineWidth = 1;
    ctx.stroke();
    // A small gripping hand follows the page edge; the other hand stays on the book.
    rect(x - 4, 10 - lift, 8, 5, '#b88166');
    rect(x - 4, 9 - lift, 7, 4, preset === 'female' ? '#f0c4a3' : '#f4cfb0');
    rect(x - 2, 8 - lift, 2, 3, '#ffe0bf');
  }
  ctx.restore();
}

export function drawMeetingLaptop(
  ctx: CanvasRenderingContext2D,
  scale: number,
  presence: number,
) {
  ctx.save();
  ctx.translate(0, 386);
  ctx.scale(Math.min(scale, 1.4), 1);
  // We see the back of the screen: the display faces the seated character.
  const height = Math.round(57 * presence);
  ctx.fillStyle = '#4c585a';
  ctx.fillRect(-46, -height, 92, height);
  ctx.fillStyle = '#9baeb0';
  ctx.fillRect(-43, -height + 3, 86, Math.max(0, height - 6));
  if (height > 25) {
    ctx.fillStyle = '#dce7df';
    ctx.fillRect(-4, -Math.round(height / 2) - 3, 8, 6);
  }
  ctx.fillStyle = '#728687';
  ctx.fillRect(-50, 0, 100, 5);
  ctx.fillStyle = '#c6d1cb';
  ctx.fillRect(-46, 0, 92, 2);
  ctx.restore();
}
