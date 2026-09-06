import assert from 'node:assert/strict';
export async function verifyChibi(server, check, state) {
  const rig = await server.ssrLoadModule('/lib/chibi-rig.ts');
  const states = Object.keys(rig.CHIBI_CLIP_MS);
  check('stance feet stay planted while the hip travels and rises', () => {
    const a = { ...rig.restingPose(), x: 4, rise: 42, turn: 1, gait: 1 };
    const b = { ...a, x: 12 };
    const first = rig.footTarget(a, 1),
      next = rig.footTarget(b, 1);
    assert.ok(Math.abs(a.x + first.x - b.x - next.x) < 0.0001);
    for (const rise of [0, 20, 42]) {
      const p = { ...a, rise, gait: 0 };
      assert.equal(168 - rise - p.breath + rig.footTarget(p, 1).y, 291);
    }
  });
  check('chibi continuous clips close without moving the seated root', () => {
    for (const name of states.filter((s) => !['greet', 'cheer'].includes(s))) {
      const first = rig.chibiLoop(name, 0),
        last = rig.chibiLoop(name, rig.CHIBI_CLIP_MS[name] - 0.01);
      for (const key of Object.keys(first).filter((k) => k !== 'penDown'))
        assert.ok(Math.abs(first[key] - last[key]) < 0.02, `${name}.${key}`);
      for (let t = 0; t < rig.CHIBI_CLIP_MS[name]; t += 31)
        assert.equal(rig.chibiLoop(name, t).x, first.x);
    }
  });
  check(
    'greeting and celebration finish in a live idle loop instead of repeating forever',
    () => {
      for (const s of ['greet', 'cheer'])
        assert.deepEqual(
          rig.chibiLoop(s, rig.CHIBI_CLIP_MS[s] + 500),
          rig.chibiLoop('idle', 500),
        );
    },
  );
  check(
    'all 100 activity transitions stay finite and reach their requested state',
    () => {
      for (const from of states)
        for (const to of states) {
          const r = rig.createChibiRuntime(from);
          r.desired = to;
          let last = r.pose;
          for (let t = 0; t <= 25000; t += 16) {
            const p = rig.sampleChibi(r, t);
            for (const value of Object.values(p))
              assert.ok(Number.isFinite(value));
            assert.ok(
              Math.abs(p.x - last.x) < 5,
              `${from}->${to}: root teleport`,
            );
            assert.ok(
              Math.abs(p.rise - last.rise) < 3,
              `${from}->${to}: rise jump`,
            );
            last = { ...p };
          }
          assert.equal(r.current, to);
          assert.equal(r.segments.length, 0);
        }
    },
  );
  check(
    'fast retargeting preserves continuity and eventually honors the latest choice',
    () => {
      const r = rig.createChibiRuntime('study');
      let last = r.pose;
      for (let t = 0; t < 25000; t += 16) {
        if (t < 2000) r.desired = states[Math.floor(t / 80) % states.length];
        else r.desired = 'meeting';
        const p = rig.sampleChibi(r, t);
        assert.ok(Math.abs(p.x - last.x) < 5);
        last = { ...p };
      }
      assert.equal(r.current, 'meeting');
      assert.equal(r.segments.length, 0);
    },
  );
  check('away stays offscreen and returning settles at the desk', () => {
    const r = rig.createChibiRuntime('idle');
    r.desired = 'away';
    for (let t = 0; t < 15000; t += 16) rig.sampleChibi(r, t);
    assert.equal(r.pose.x, r.exitX);
    for (let t = 15000; t < 45000; t += 250)
      assert.equal(rig.sampleChibi(r, t).x, r.exitX);
    r.desired = 'returning';
    for (let t = 45000; t < 65000; t += 16) rig.sampleChibi(r, t);
    assert.equal(r.pose.x, 0);
    assert.equal(r.pose.rise, 0);
  });
  check(
    'IK keeps fixed bone lengths and finite elbows even for unreachable targets',
    () => {
      const root = { x: 30, y: 184 };
      for (const target of [
        { x: 30, y: 184 },
        { x: 19, y: 231 },
        { x: 300, y: -200 },
        { x: -80, y: 260 },
      ])
        for (const sign of [-1, 1]) {
          const { elbow, hand } = rig.solveArm(root, target, sign);
          assert.ok(
            Math.abs(Math.hypot(elbow.x - root.x, elbow.y - root.y) - 34) <
              0.001,
          );
          assert.ok(
            Math.abs(Math.hypot(hand.x - elbow.x, hand.y - elbow.y) - 34) <
              0.001,
          );
        }
    },
  );
  check(
    'writing keeps the pen attached and provides lifted strokes between written lines',
    () => {
      let down = 0,
        lifted = 0;
      for (let t = 0; t < 8000; t += 20) {
        const p = rig.chibiLoop('study', t);
        assert.equal(p.pen, 1);
        if (p.penDown) down++;
        else lifted++;
        assert.ok(p.rightX >= 19 && p.rightX <= 33);
        assert.ok(p.rightY > 219 && p.rightY < 235);
      }
      assert.ok(down && lifted);
    },
  );
  check(
    'v2 and unversioned legacy appearances survive backup alongside room preference',
    () => {
      const d = state.createAppData();
      d.settings.room = 'classroom';
      d.buddies[0].appearance = {
        preset: 'female',
        atlasKey: 'new-rig',
        rigVersion: 2,
        photoMode: 'head-only',
      };
      d.buddies[1].appearance = { preset: 'male', atlasKey: 'old-rig' };
      const restored = state.validateAppData(d);
      assert.equal(restored.settings.room, 'classroom');
      assert.equal(restored.buddies[0].appearance.rigVersion, 2);
      assert.equal(restored.buddies[1].appearance.rigVersion, 1);
    },
  );
}
