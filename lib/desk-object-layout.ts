export function deskObjectLayout(width: number) {
  const edge = width / 2 - 40;
  if (width < 520) {
    return {
      study: { x: -edge, y: 399 },
      class: { x: -edge, y: 452 },
      meeting: { x: edge, y: 399 },
    };
  }
  const inner = Math.min(200, edge - 80);
  return {
    study: { x: -inner - 80, y: 379 },
    class: { x: -inner, y: 379 },
    meeting: { x: inner + 20, y: 377 },
  };
}
