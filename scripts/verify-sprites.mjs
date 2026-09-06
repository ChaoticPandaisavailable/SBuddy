import assert from 'node:assert/strict';
export async function verifySprites(server, check, state) {
  const sprite = await server.ssrLoadModule('/lib/sprite-animation.ts');
  const states = Object.keys(sprite.SPRITE_MANIFEST.clips);
  const authored = await server.ssrLoadModule('/lib/sprite-authored-clips.ts');
  const layout = await server.ssrLoadModule('/lib/desk-object-layout.ts');
  check(
    'desk entry objects stay on either side, in bounds and separately clickable',
    () => {
      for (const width of [240, 320, 400, 519, 520, 800, 1200]) {
        const points = Object.values(layout.deskObjectLayout(width));
        for (const point of points) {
          assert.ok(Math.abs(point.x) + 36 <= width / 2);
          assert.ok(point.y - 24 >= 350 && point.y + 24 <= 480);
        }
        assert.ok(points[0].x < 0 && points[1].x < 0 && points[2].x > 0);
        for (let i = 0; i < points.length; i++)
          for (let j = i + 1; j < points.length; j++)
            assert.ok(
              Math.abs(points[i].x - points[j].x) >= 72 ||
                Math.abs(points[i].y - points[j].y) >= 48,
            );
      }
    },
  );
  const desk = await server.ssrLoadModule('/lib/scene-activity-props.ts');
  check(
    'classroom turns pages without writing poses and respects reduced motion',
    () => {
      const r = sprite.createSpriteRuntime();
      r.desired = 'class';
      let turns = 0,
        previous = 0;
      for (let t = 0; t < 18000; t += 20) {
        sprite.sampleSprite(r, t);
        const props = desk.sampleDeskActivity(r, t);
        if (r.current !== 'class') continue;
        assert.equal(props.laptop, 0);
        assert.ok(![6, 7, 8, 9, 10].includes(props.frame));
        if (props.page > 0 && previous === 0) turns++;
        previous = props.page;
        assert.equal(desk.sampleDeskActivity(r, t, true).page, 0);
      }
      assert.ok(turns >= 2);
    },
  );
  check(
    'meeting laptop follows actual action, closes on transition, and stays absent while away',
    () => {
      const r = sprite.createSpriteRuntime();
      r.desired = 'meeting';
      let opened = false,
        closing = false;
      for (let t = 0; t < 22000; t += 20) {
        if (t === 5000) r.desired = 'away';
        sprite.sampleSprite(r, t);
        const props = desk.sampleDeskActivity(r, t);
        if (props.laptop === 1) opened = true;
        if (props.laptop > 0 && props.laptop < 1) closing = true;
        if (r.current !== 'meeting') assert.equal(props.laptop, 0);
      }
      assert.ok(opened && closing);
      assert.equal(r.phase, 'away');
      assert.equal(desk.sampleDeskActivity(r, 22000).book, 0);
    },
  );
  check(
    'authored actions have 24 crisp slots and retain their duration',
    () => {
      for (const [name, clip] of Object.entries(sprite.SPRITE_MANIFEST.clips)) {
        const duration = clip.durations.reduce((a, b) => a + b, 0);
        const steps = authored.authoredClip(name, duration);
        assert.equal(steps.length, 24);
        assert.ok(
          Math.abs(steps.reduce((n, s) => n + s.duration, 0) - duration) <
            0.00001,
        );
        assert.ok(
          steps.every(
            (s) =>
              s.duration > 0 &&
              s.frame >= 0 &&
              s.frame < 108 &&
              !('tweenTo' in s),
          ),
        );
        assert.ok(steps.some((s) => s.frame >= 48));
      }
      assert.equal(authored.AUTHORED_WALK.length, 24);
      for (const preset of ['female', 'male']) {
        assert.equal(sprite.createSpriteRuntime(0, preset).steps.length, 24);
        for (const activity of ['greet', 'cheer']) {
          const r = sprite.createSpriteRuntime(0, preset);
          r.desired = activity;
          r.token = 9;
          for (let t = 0; t < 8000; t += 20) sprite.sampleSprite(r, t);
          assert.equal(r.completed, 1);
          assert.equal(r.current, 'idle');
        }
      }
    },
  );
  check('authored walking preserves velocity and retargets safely', () => {
    for (const preset of ['female', 'male']) {
      for (const from of states)
        for (const target of states) {
          const r = sprite.createSpriteRuntime(0, preset);
          r.desired = from;
          let x = 0;
          for (let t = 0; t < 40000; t += 20) {
            if (t >= 16000) r.desired = target;
            const p = sprite.sampleSprite(r, t);
            assert.ok(Math.abs(p.x - x) < 10);
            x = p.x;
            assert.ok(p.frame >= 0 && p.frame < (r.preset ? 108 : 48));
          }
          assert.equal(
            r.current,
            ['greet', 'cheer', 'returning'].includes(target) ? 'idle' : target,
          );
        }
    }
  });
  check(
    'sprite manifests cover all activities with bounded positive frame durations',
    () => {
      for (const c of Object.values(sprite.SPRITE_MANIFEST.clips)) {
        assert.equal(c.frames.length, c.durations.length);
        assert.ok(
          c.frames.every((n) => Number.isInteger(n) && n >= 0 && n < 48),
        );
        assert.ok(c.durations.every((n) => n > 0));
      }
    },
  );
  check(
    'all 100 sprite transitions settle at the latest instruction without root teleport',
    () => {
      for (const from of states)
        for (const target of states) {
          const r = sprite.createSpriteRuntime();
          r.desired = from;
          let p = { x: 0 };
          for (let t = 0; t < 40000; t += 33) {
            if (t >= 16000) r.desired = target;
            const next = sprite.sampleSprite(r, t);
            assert.ok(Math.abs(next.x - p.x) < 10, `${from} to ${target}`);
            assert.ok(Number.isFinite(next.frame));
            p = next;
          }
          assert.ok(r.phase === 'loop' || r.phase === 'away');
          assert.equal(
            r.current,
            ['greet', 'cheer', 'returning'].includes(target) ? 'idle' : target,
          );
        }
    },
  );
  check('short sprite actions complete once and finish at neutral', () => {
    for (const s of ['greet', 'cheer']) {
      const r = sprite.createSpriteRuntime();
      r.desired = s;
      r.token = 7;
      for (let t = 0; t < 18000; t += 20) sprite.sampleSprite(r, t);
      assert.equal(r.completed, 1);
      assert.equal(r.lastCompletedToken, 7);
      assert.equal(r.current, 'idle');
    }
  });
  check('sprite exit is committed even if focus resumes during rising', () => {
    const r = sprite.createSpriteRuntime();
    r.desired = 'away';
    let outside = false,
      previous = 0;
    for (let t = 0; t < 22000; t += 20) {
      if (t === 600) r.desired = 'study';
      const p = sprite.sampleSprite(r, t);
      if (!p.visible) outside = true;
      assert.ok(Math.abs(p.x - previous) < 10);
      previous = p.x;
    }
    assert.ok(outside);
    assert.equal(r.current, 'study');
    assert.equal(r.x, 0);
  });
  check('paused sprite holds an empty seat through scene changes', () => {
    const r = sprite.createSpriteRuntime();
    r.desired = 'away';
    for (let t = 0; t < 20000; t += 20) sprite.sampleSprite(r, t);
    for (let t = 20000; t < 80000; t += 1000) {
      const p = sprite.sampleSprite(r, t);
      assert.equal(p.visible, false);
      assert.equal(r.phase, 'away');
    }
  });
  check(
    'rapid sprite retargeting keeps the latest request and connected frame ranges',
    () => {
      const r = sprite.createSpriteRuntime();
      for (let t = 0; t < 22000; t += 20) {
        r.desired =
          t < 1800 ? states[Math.floor(t / 120) % states.length] : 'class';
        const p = sprite.sampleSprite(r, t);
        assert.ok(p.frame >= 0 && p.frame < (r.preset ? 108 : 48));
      }
      assert.equal(r.current, 'class');
      assert.equal(r.phase, 'loop');
    },
  );
  check(
    'V3 backup retains exact motion template and existing V1 V2 appearances',
    () => {
      const d = state.createAppData();
      d.buddies[0].appearance = {
        preset: 'female',
        rigVersion: 3,
        atlasKey: 'mock-v3',
        spriteManifest: structuredClone(sprite.SPRITE_MANIFEST),
        photoMode: 'full-body',
      };
      d.buddies[1].appearance = {
        preset: 'male',
        rigVersion: 2,
        atlasKey: 'old-v2',
      };
      const restored = state.validateAppData(JSON.parse(JSON.stringify(d)));
      assert.deepEqual(restored.buddies[0].appearance, d.buddies[0].appearance);
      assert.equal(restored.buddies[1].appearance.rigVersion, 2);
      d.buddies[0].appearance.spriteManifest.clips.study.frames[0] = 99;
      assert.throws(() => state.validateAppData(d), /序列帧/);
    },
  );
  check(
    'unsupported or missing sprite timelines reject before replacing data',
    () => {
      assert.throws(() => sprite.validateSpriteManifest(undefined));
      const invalid = structuredClone(sprite.SPRITE_MANIFEST);
      invalid.clips.away.loop = true;
      assert.throws(() => sprite.validateSpriteManifest(invalid));
      assert.deepEqual(
        sprite.validateSpriteManifest(structuredClone(sprite.SPRITE_MANIFEST)),
        sprite.SPRITE_MANIFEST,
      );
    },
  );
}
