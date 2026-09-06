import assert from 'node:assert/strict';

export async function verifyScoring(server, check, state) {
  const score = await server.ssrLoadModule('/lib/bond-scoring.ts');
  const activity = await server.ssrLoadModule('/lib/activity-scoring.ts');
  const behavior = await server.ssrLoadModule('/lib/companion-behavior.ts');
  const dialogue = await server.ssrLoadModule('/lib/relationship.ts');
  const at = new Date('2026-09-06T09:00:00').getTime();
  const event = (kind = 'study', id = 'day') => ({
    id,
    source: 'material',
    date: '2026-09-06',
    day: 6,
    title: '学习',
    time: '09:00',
    end: '10:00',
    kind,
  });
  const withEvent = (kind = 'study') => ({
    ...state.createAppData(),
    events: [event(kind)],
  });
  const points = (data, buddyId = 'xiaohe') =>
    data.buddies.find((b) => b.id === buddyId).relationship.bond;
  const restore = (data) =>
    state.validateAppData(JSON.parse(JSON.stringify(data)));

  check(
    'dialogue now uses +1 +2 -1 with floor zero and no repeat answer rewards',
    () => {
      assert.deepEqual(
        [
          ...new Set(
            dialogue.dialoguePrompts.flatMap((p) =>
              p.choices.map((c) => c.delta),
            ),
          ),
        ].sort(),
        [-1, 1, 2],
      );
      for (const delta of [-1, 1, 2]) {
        const prompt = dialogue.dialoguePrompts.find((p) =>
          p.choices.some((c) => c.delta === delta),
        );
        const choice = prompt.choices.find((c) => c.delta === delta);
        const first = dialogue.applyDialogueChoice(
          state.freshRelationship(),
          prompt,
          choice,
          new Date(at),
        ).state;
        assert.equal(first.bond, Math.max(0, delta));
        const twice = dialogue.applyDialogueChoice(
          first,
          prompt,
          choice,
          new Date(at + 1),
        ).state;
        assert.deepEqual(twice, first);
      }
    },
  );
  check(
    'manual completion requires one minute, switching only cancels, repeated finish cannot replay',
    () => {
      for (const kind of ['study', 'class', 'meeting']) {
        const started = activity.selectManualActivity(
          state.createAppData(),
          'xiaohe',
          kind,
          at,
          'manual',
        );
        assert.equal(
          points(
            activity.selectManualActivity(
              started,
              'xiaohe',
              kind,
              at + 59999,
              'discard',
            ),
          ),
          0,
        );
        const done = activity.selectManualActivity(
          started,
          'xiaohe',
          kind,
          at + 60000,
          'discard',
        );
        assert.equal(points(done), 1);
        assert.equal(
          points(
            activity.selectManualActivity(
              done,
              'xiaohe',
              kind,
              at + 60001,
              'next',
            ),
          ),
          1,
        );
        const switched = activity.selectManualActivity(
          started,
          'xiaohe',
          kind === 'meeting' ? 'class' : 'meeting',
          at + 90000,
          'switch',
        );
        assert.equal(points(switched), 0);
      }
    },
  );
  check(
    'manual effective time excludes focus pauses and survives refresh',
    () => {
      let data = activity.selectManualActivity(
        state.createAppData(),
        'xiaohe',
        'study',
        at,
        'manual',
      );
      data = activity.pauseManualActivity(data, 'xiaohe', true, at + 30000);
      data = restore(data);
      data = activity.pauseManualActivity(data, 'xiaohe', false, at + 300000);
      assert.equal(
        points(
          activity.selectManualActivity(
            data,
            'xiaohe',
            'study',
            at + 329999,
            'discard',
          ),
        ),
        0,
      );
      assert.equal(
        points(
          activity.selectManualActivity(
            data,
            'xiaohe',
            'study',
            at + 330000,
            'discard',
          ),
        ),
        1,
      );
    },
  );
  check(
    'focus early settlement saves time but grants no reward, normal deadline grants one',
    () => {
      const data = activity.beginFocus(state.createAppData(), 2, at, 'focus');
      const early = state.settleFocus(data, at + 60000, true);
      assert.equal(points(early), 0);
      assert.equal(early.focusHistory[0].minutes, 1);
      assert.equal(early.focusHistory[0].completedNormally, false);
      const done = state.settleFocus(data, at + 120000);
      assert.equal(points(done), 1);
      assert.equal(points(state.settleFocus(restore(done), at + 120001)), 1);
      assert.equal(points(state.settleFocus(data, at + 120000, true)), 1);
    },
  );
  check(
    'focus links manual study first, then current study, and never course or meeting',
    () => {
      const scheduled = withEvent();
      assert.equal(
        activity.beginFocus(scheduled, 1, at, 'a').focus.rewardKey,
        score.eventRewardKey(event()),
      );
      const manual = activity.selectManualActivity(
        scheduled,
        'xiaohe',
        'study',
        at,
        'm',
      );
      assert.equal(
        activity.beginFocus(manual, 1, at, 'b').focus.rewardKey,
        manual.buddies[0].behavior.manualSession.rewardKey,
      );
      for (const kind of ['class', 'meeting', 'personal'])
        assert.notEqual(
          activity.beginFocus(withEvent(kind), 1, at, 'c').focus.rewardKey,
          score.eventRewardKey(event(kind)),
        );
    },
  );
  check(
    'linked study yields max(rounds, completion) in either order and after backup',
    () => {
      for (const order of ['activity-first', 'focus-first']) {
        let data = activity.beginFocus(withEvent(), 1, at, 'first');
        const key = data.focus.rewardKey;
        if (order === 'activity-first')
          data = score.creditReward(data, key, 'xiaohe');
        data = restore(data);
        data = state.settleFocus(data, at + 60000);
        data = score.creditReward(data, key, 'xiaohe');
        assert.equal(points(data), 1);
        data = activity.beginFocus(restore(data), 1, at + 61000, 'second');
        assert.equal(data.focus.rewardKey, key);
        data = state.settleFocus(data, at + 121000);
        assert.equal(points(data), 2);
        assert.equal(
          points(score.creditReward(restore(data), key, 'xiaohe')),
          2,
        );
      }
    },
  );
  check(
    'manual study and linked focus also deduplicate in both completion orders',
    () => {
      for (const manualFirst of [false, true]) {
        let data = activity.selectManualActivity(
          state.createAppData(),
          'xiaohe',
          'study',
          at,
          'm',
        );
        data = activity.beginFocus(data, 2, at, 'f');
        if (manualFirst)
          data = activity.selectManualActivity(
            data,
            'xiaohe',
            'study',
            at + 60000,
            'unused',
          );
        data = state.settleFocus(restore(data), at + 120000);
        if (!manualFirst)
          data = activity.selectManualActivity(
            data,
            'xiaohe',
            'study',
            at + 120001,
            'unused',
          );
        assert.equal(points(data), 1);
      }
    },
  );
  check('linked focus owner is fixed despite role and activity changes', () => {
    let data = activity.beginFocus(withEvent(), 1, at, 'f');
    const key = data.focus.rewardKey;
    data = activity.selectManualActivity(
      data,
      'xiaohe',
      'meeting',
      at + 20000,
      'meeting',
    );
    data.activeBuddyId = 'zhixu';
    data = score.creditReward(data, key, data.activeBuddyId);
    assert.equal(points(data), 1);
    assert.equal(points(data, 'zhixu'), 0);
    data = state.settleFocus(data, at + 60000);
    assert.equal(points(data), 1);
    assert.equal(data.focus.rewardKey, key);
    data = activity.beginFocus(data, 1, at + 61000, 'second');
    data = state.settleFocus(data, at + 121000);
    assert.equal(points(data, 'zhixu'), 1);
  });
  check(
    'all four observed calendar kinds award once, with daily recurrence and stable edited identities',
    () => {
      for (const kind of ['study', 'class', 'meeting', 'personal']) {
        let data = withEvent(kind);
        const end = at + 3600000;
        const items = behavior.detectCompletions(
          behavior.completionSnapshot(data, end - 1000),
          behavior.completionSnapshot(data, end),
        );
        assert.equal(items.length, 1);
        data = score.creditReward(data, items[0].rewardKey, 'zhixu');
        assert.equal(points(data, 'zhixu'), 1);
        const edit = {
          ...event(kind),
          title: '改名',
          time: '10:00',
          end: '11:00',
        };
        data = score.creditReward(
          restore(data),
          score.eventRewardKey(edit),
          'xiaohe',
        );
        assert.equal(points(data), 0);
        data = score.creditReward(
          data,
          score.eventRewardKey({ ...edit, date: '2026-09-07' }),
          'xiaohe',
        );
        assert.equal(points(data), 1);
      }
    },
  );
  check('campus occurrence overrides retain the same reward identity', () => {
    const original = {
      ...event('class'),
      source: 'campus-course',
      id: 'campus-course-course-123-2',
    };
    const override = {
      ...original,
      source: 'material',
      originCourseId: 'course-123',
      id: 'new-override',
    };
    assert.equal(
      score.eventRewardKey(original),
      score.eventRewardKey(override),
    );
  });
  check(
    'imported or changed history creates no completion rewards and todos have no reward keys',
    () => {
      const data = withEvent();
      const end = at + 3600000;
      const before = behavior.completionSnapshot(data, end - 1000);
      assert.equal(
        behavior.detectCompletions(
          before,
          behavior.completionSnapshot({ ...data, events: [] }, end),
        ).length,
        0,
      );
      assert.equal(
        behavior.detectCompletions(
          before,
          behavior.completionSnapshot(
            { ...data, events: [{ ...event(), title: 'edited' }] },
            end,
          ),
        ).length,
        0,
      );
      assert.equal(
        behavior.detectCompletions(
          behavior.completionSnapshot(state.createAppData(), end),
          behavior.completionSnapshot(data, end + 1000),
        ).length,
        0,
      );
      data.campus.todos = [
        {
          id: 'todo',
          title: '待办',
          createdAt: new Date(at).toISOString(),
          updatedAt: new Date(at).toISOString(),
        },
      ];
      const todoBefore = behavior.completionSnapshot(data, end);
      data.campus.todos[0].completedAt = new Date(end + 1).toISOString();
      assert.ok(
        behavior
          .detectCompletions(
            todoBefore,
            behavior.completionSnapshot(data, end + 1),
          )
          .every((item) => !item.rewardKey),
      );
    },
  );
  check(
    'legacy score and unlocks remain intact, settled focus does not replay, corrupt ledgers reject',
    () => {
      const legacy = state.createAppData();
      delete legacy.rewardLedger;
      legacy.buddies[0].relationship = state.earnBond(
        state.freshRelationship(),
        200,
      );
      legacy.focusHistory = [
        {
          id: 'old',
          buddyId: 'xiaohe',
          minutes: 1,
          at: new Date(at).toISOString(),
        },
      ];
      const restored = restore(legacy);
      assert.equal(points(restored), 200);
      assert.equal(restored.buddies[0].relationship.unlocked.length, 6);
      assert.deepEqual(restored.rewardLedger, []);
      restored.focus = {
        id: 'old',
        buddyId: 'xiaohe',
        duration: 60,
        remaining: 0,
        status: 'complete',
      };
      assert.equal(points(state.settleFocus(restored, at)), 200);
      for (const rewardLedger of [
        null,
        {},
        [
          {
            id: 'bad',
            buddyId: 'xiaohe',
            activityCompleted: true,
            focusIds: ['a', 'a'],
          },
        ],
      ])
        assert.throws(() => restore({ ...legacy, rewardLedger }), /奖励记录/);
      legacy.buddies[0].behavior.manualSession = {
        id: 'bad',
        rewardKey: 'x',
        elapsedMs: -1,
      };
      assert.throws(() => restore(legacy), /活动计分/);
    },
  );
}
