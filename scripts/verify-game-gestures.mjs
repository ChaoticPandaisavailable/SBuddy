import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  resolve: { alias: { '@': process.cwd() } },
});
try {
  const { gameGestureAction: act } = await server.ssrLoadModule(
    '/lib/game-gestures.ts',
  );
  const focus = {
    id: 'f',
    buddyId: 'a',
    duration: 600,
    remaining: 500,
    endsAt: Date.now() + 500000,
    status: 'running',
  };
  assert.equal(act('open_palm', 'a', undefined).action, 'greet');
  assert.equal(act('victory', 'a', undefined).action, 'start');
  assert.equal(act('victory', 'a', focus).action, 'none');
  assert.equal(act('closed_fist', 'a', focus).action, 'toggle');
  assert.match(
    act('closed_fist', 'a', { ...focus, status: 'paused' }).message,
    /继续/,
  );
  assert.equal(act('thumb_down', 'a', focus).action, 'toggle');
  assert.equal(
    act('thumb_down', 'a', { ...focus, status: 'paused' }).action,
    'none',
  );
  assert.equal(act('thumb_up', 'a', focus).action, 'finish');
  for (const gesture of ['thumb_up', 'closed_fist'])
    assert.equal(act(gesture, 'a', undefined).action, 'none');
  for (const gesture of ['victory', 'closed_fist', 'thumb_down', 'thumb_up'])
    assert.equal(act(gesture, 'b', focus).action, 'none');
  assert.equal(
    act('victory', 'b', { ...focus, status: 'complete' }).action,
    'start',
  );
  console.log(
    'PASS game gestures: greeting, start, pause, resume, rest, finish, inactive sessions and companion isolation',
  );
} finally {
  await server.close();
}
