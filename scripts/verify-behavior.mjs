import assert from 'node:assert/strict';
export async function verifyBehavior(server, check, state) {
  const b = await server.ssrLoadModule('/lib/companion-behavior.ts');
  const relationship = await server.ssrLoadModule('/lib/relationship.ts');
  const today = new Date(2026, 8, 6, 12);
  const event = (id, time, end, date = '2026-09-06') => ({
    id,
    title: id,
    date,
    day: 6,
    time,
    end,
    kind: 'study',
  });
  check('character opening uses an exact sliding one-hour boundary', () => {
    assert.equal(b.needsGreeting(undefined, 4000000), true);
    assert.equal(b.needsGreeting(400001, 4000000), false);
    assert.equal(b.needsGreeting(400000, 4000000), true);
    assert.equal(b.needsGreeting(4000000, 4100000), false);
    assert.equal(b.needsGreeting(4100001, 4100000), true);
  });
  check(
    'desk clicks enter manual mode, toggle completion, and switch without completing',
    () => {
      const first = b.clickDesk({ mode: 'schedule' }, 'study');
      assert.equal(first.completed, false);
      assert.equal(first.behavior.mode, 'manual');
      const second = b.clickDesk(first.behavior, 'class');
      assert.equal(second.completed, false);
      const third = b.clickDesk(second.behavior, 'class');
      assert.equal(third.completed, true);
      assert.equal(third.behavior.activity, undefined);
    },
  );
  check(
    'fatigue uses the union of today’s study, class, and meeting intervals',
    () => {
      const events = [
        event('a', '08:00', '12:00'),
        event('b', '10:00', '14:00'),
        event('c', '08:00', '12:00'),
        event('d', '14:00', '20:00', '2026-09-07'),
        { ...event('e', '18:00', '20:00'), kind: 'other' },
      ];
      assert.equal(b.scheduleLoadMinutes(events, today), 360);
      assert.equal(b.scheduleLoadMinutes(events, new Date(2026, 8, 8, 12)), 0);
    },
  );
  check(
    'fatigue never replaces an activity or a question; pause overrides all actions',
    () => {
      const input = {
        behavior: { mode: 'schedule' },
        schedule: 'idle',
        tired: true,
        paused: false,
        question: false,
      };
      assert.equal(b.resolveBehavior(input), 'tired');
      assert.equal(b.resolveBehavior({ ...input, schedule: 'class' }), 'class');
      assert.equal(b.resolveBehavior({ ...input, question: true }), 'think');
      assert.equal(
        b.resolveBehavior({ ...input, question: true, short: 'cheer' }),
        'think',
      );
      assert.equal(
        b.resolveBehavior({ ...input, paused: true, short: 'greet' }),
        'away',
      );
      assert.equal(
        b.resolveBehavior({
          ...input,
          behavior: { mode: 'manual', activity: 'meeting' },
          schedule: 'study',
        }),
        'meeting',
      );
    },
  );
  check(
    'unlimited bond survives rewards, dialogue, and backup round trip',
    () => {
      const d = state.createAppData();
      d.buddies[0].relationship.bond = 999;
      d.buddies[0].relationship = state.earnBond(d.buddies[0].relationship, 3);
      const prompt = relationship.dialoguePrompts[0];
      d.buddies[0].relationship = relationship.applyDialogueChoice(
        d.buddies[0].relationship,
        prompt,
        prompt.choices[0],
        today,
      ).state;
      assert.equal(
        state.validateAppData(JSON.parse(JSON.stringify(d))).buddies[0]
          .relationship.bond,
        1002 + prompt.choices[0].delta,
      );
    },
  );
  check(
    'per-buddy interaction and commands survive backup independently, with legacy defaults',
    () => {
      const d = state.createAppData();
      d.buddies[0].behavior = {
        mode: 'manual',
        activity: 'meeting',
        lastInteractionAt: 123456,
      };
      d.settings.fatigueHours = 4.5;
      const next = state.validateAppData(JSON.parse(JSON.stringify(d)));
      assert.deepEqual(next.buddies[0].behavior, d.buddies[0].behavior);
      assert.equal(next.buddies[1].behavior.mode, 'schedule');
      assert.equal(next.buddies[1].behavior.lastInteractionAt, undefined);
      assert.equal(next.settings.fatigueHours, 4.5);
      delete d.settings.fatigueHours;
      assert.equal(state.validateAppData(d).settings.fatigueHours, 6);
    },
  );
  check(
    'only unchanged observed schedules crossing an end time complete',
    () => {
      const d = state.createAppData();
      d.events = [event('a', '11:00', '12:00')];
      const at = today.getTime();
      const before = b.completionSnapshot(d, at - 1000),
        after = b.completionSnapshot(d, at);
      assert.equal(b.detectCompletions(before, after).length, 1);
      assert.equal(
        b.detectCompletions(after, b.completionSnapshot(d, at + 1000)).length,
        0,
      );
      assert.equal(
        b.detectCompletions(
          before,
          b.completionSnapshot({ ...d, events: [] }, at),
        ).length,
        0,
      );
      assert.equal(
        b.detectCompletions(
          before,
          b.completionSnapshot(
            { ...d, events: [{ ...d.events[0], title: 'changed' }] },
            at,
          ),
        ).length,
        0,
      );
      assert.equal(
        b.detectCompletions(
          b.completionSnapshot({ ...d, events: [] }, at - 1000),
          after,
        ).length,
        0,
      );
    },
  );
  check(
    'todo completion is explicit; deletion and historical imports do not celebrate',
    () => {
      const d = state.createAppData();
      const at = today.getTime();
      d.campus.todos = [
        {
          id: 'todo',
          title: 'Read',
          priority: 'normal',
          createdAt: new Date(at - 10000).toISOString(),
        },
      ];
      const before = b.completionSnapshot(d, at - 500);
      d.campus.todos[0].completedAt = new Date(at).toISOString();
      assert.equal(
        b.detectCompletions(before, b.completionSnapshot(d, at)).length,
        1,
      );
      d.campus.todos[0].completedAt = new Date(at - 1000000).toISOString();
      assert.equal(
        b.detectCompletions(before, b.completionSnapshot(d, at)).length,
        0,
      );
      d.campus.todos = [];
      assert.equal(
        b.detectCompletions(before, b.completionSnapshot(d, at)).length,
        0,
      );
    },
  );
  check(
    'focus pauses do not complete; settlement targets its owner and deduplicates',
    () => {
      const d = state.createAppData();
      const at = today.getTime();
      d.focus = {
        id: 'f',
        buddyId: d.buddies[1].id,
        status: 'running',
        duration: 60,
        remaining: 60,
        endsAt: at,
      };
      const before = b.completionSnapshot(d, at - 1000);
      const paused = { ...d, focus: { ...d.focus, status: 'paused' } };
      assert.equal(
        b.detectCompletions(before, b.completionSnapshot(paused, at)).length,
        0,
      );
      const settled = state.settleFocus(d, at),
        after = b.completionSnapshot(settled, at);
      assert.deepEqual(b.detectCompletions(before, after), [
        { id: 'focus:f', buddyId: d.buddies[1].id },
      ]);
      assert.equal(
        b.detectCompletions(
          after,
          b.completionSnapshot(
            state.settleFocus(settled, at + 1000),
            at + 1000,
          ),
        ).length,
        0,
      );
    },
  );
}
