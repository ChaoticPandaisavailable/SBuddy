import assert from 'node:assert/strict';
export async function verifySprites(server, check, state) {
  const sprite = await server.ssrLoadModule('/lib/sprite-animation.ts');
  const states = Object.keys(sprite.SPRITE_MANIFEST.clips);
  check(
    'all preset activities receive one in-between per step without changing order or duration',
    () => {
      for (const clip of Object.values(sprite.SPRITE_MANIFEST.clips)) {
        const original = clip.frames.map((frame, i) => ({
          frame,
          duration: clip.durations[i],
        }));
        const steps = sprite.interpolateSpriteSteps(original, clip.loop);
        assert.equal(steps.length, original.length * 2);
        assert.equal(
          steps.reduce((n, s) => n + s.duration, 0),
          clip.durations.reduce((a, b) => a + b, 0),
        );
        original.forEach((step, i) => {
          assert.equal(steps[i * 2].frame, step.frame);
          assert.equal(steps[i * 2 + 1].frame, step.frame);
          assert.equal(
            steps[i * 2 + 1].tweenTo,
            original[i + 1]?.frame ??
              (clip.loop ? original[0].frame : step.frame),
          );
          assert.ok(steps[i * 2 + 1].duration <= 70);
        });
      }
      const legacy = sprite.createSpriteRuntime();
      assert.deepEqual(
        legacy.steps.map((s) => s.frame),
        sprite.SPRITE_MANIFEST.clips.idle.frames,
      );
      for (const preset of ['female', 'male']) {
        const r = sprite.createSpriteRuntime(0, preset);
        assert.equal(
          r.steps.length,
          sprite.SPRITE_MANIFEST.clips.idle.frames.length * 2,
        );
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
  check(
    'uniform in-betweens preserve walking velocity and retarget safely',
    () => {
      const input = [
        { frame: 42, duration: 110, from: 0, to: 9, flip: false },
        { frame: 43, duration: 110, from: 9, to: 18, flip: false },
      ];
      const steps = sprite.interpolateSpriteSteps(input);
      for (const step of steps)
        assert.ok(
          Math.abs((step.to - step.from) / step.duration - 9 / 110) < 1e-10,
        );
      assert.equal(steps[0].to, steps[1].from);
      assert.equal(steps[1].to, 9);
      assert.equal(steps.at(-1).to, 18);
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
              assert.ok(p.frame >= 0 && p.frame < 48);
              if (p.tweenTo !== undefined)
                assert.ok(p.tweenTo >= 0 && p.tweenTo < 48);
            }
            assert.equal(
              r.current,
              ['greet', 'cheer', 'returning'].includes(target)
                ? 'idle'
                : target,
            );
          }
      }
    },
  );
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
        assert.ok(p.frame >= 0 && p.frame < 48);
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
