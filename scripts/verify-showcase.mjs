import assert from 'node:assert/strict';

export async function verifyShowcase(server, check, state) {
  const demo = await server.ssrLoadModule('/lib/showcase.ts');
  const parser = await server.ssrLoadModule('/lib/schedule-parser.ts');
  const courseware = await server.ssrLoadModule('/lib/courseware.ts');
  const now = new Date(2026, 11, 31, 23, 30);
  const data = demo.createShowcaseData(now);
  check('showcase uses explicit query and separate persistence key', () => {
    assert.notEqual(demo.SHOWCASE_STORAGE_KEY, state.STORAGE_KEY);
    assert.equal(demo.isShowcase('?demo=1'), true);
    for (const q of ['', '?demo=0', '?demonstration=1'])
      assert.equal(demo.isShowcase(q), false);
  });
  check('showcase round-trips through existing backup validation', () => {
    const restored = state.validateAppData(JSON.parse(JSON.stringify(data)));
    assert.equal(restored.buddies.length, 2);
    assert.equal(restored.events.length, 3);
    assert.equal(restored.campus.todos.length, 3);
    assert.equal(restored.campus.courses.length, 1);
    assert.equal(restored.campus.exams.length, 1);
    assert.equal(restored.settings.focusMinutes, 1);
    assert.equal(restored.buddies[0].relationship.bond, 48);
  });
  check('showcase sample dates follow local day and year rollover', () => {
    assert.ok(data.events.every((e) => e.date === '2026-12-31'));
    assert.equal(data.campus.exams[0].date, '2027-01-01');
    assert.match(data.material, /2027-01-01/);
    const parsed = parser.parseScheduleMaterial(data.material, now);
    assert.equal(parsed.length, 2);
    assert.ok(parsed.every((e) => e.date === '2027-01-01'));
    assert.equal(state.mergeEvents(parsed, parsed).length, 2);
  });
  check('showcase starts with no fabricated learning history', () => {
    assert.equal(data.focusHistory.length, 0);
    assert.equal(data.focus, undefined);
    assert.equal(data.note.summary, '');
    assert.equal(data.courseware.result, undefined);
  });
  check('real one-minute focus unlocks growth exactly once', () => {
    const end = now.getTime() + 60000;
    const running = {
      ...data,
      focus: {
        id: 'demo-real-minute',
        buddyId: 'xiaohe',
        duration: 60,
        remaining: 60,
        endsAt: end,
        status: 'running',
      },
    };
    assert.equal(state.settleFocus(running, end - 1).focusHistory.length, 0);
    const done = state.settleFocus(running, end);
    assert.equal(done.focusHistory[0].minutes, 1);
    assert.equal(done.buddies[0].relationship.bond, 51);
    assert.ok(
      done.buddies[0].relationship.unlocked.includes('庆祝动作「像素击掌」'),
    );
    assert.equal(state.settleFocus(done, end + 1000).focusHistory.length, 1);
  });
  check('showcase local tools extract supplied content honestly', () => {
    const note = demo.localNoteSummary(data.note.transcript);
    assert.equal(note.source, 'fallback');
    assert.ok(note.actionItems.length > 0);
    assert.ok(note.actionItems.every((s) => data.note.transcript.includes(s)));
    const result = courseware.localCourseware(data.courseware.material);
    assert.ok(courseware.validCoursewareResult(result));
    assert.equal(result.outline.length, 3);
    assert.deepEqual(result.questions, []);
  });
  check('reset creates fresh independent demo state', () => {
    data.buddies[0].relationship.bond = 999;
    data.campus.todos[0].completedAt = now.toISOString();
    const fresh = demo.createShowcaseData(now);
    assert.equal(fresh.buddies[0].relationship.bond, 48);
    assert.equal(fresh.campus.todos[0].completedAt, undefined);
    assert.equal(fresh.buddies[1].relationship.bond, 12);
  });
}
