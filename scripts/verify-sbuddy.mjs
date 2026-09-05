import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  resolve: { alias: { '@': process.cwd() } },
});
let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log('PASS ' + name);
};
try {
  const state = await server.ssrLoadModule('/lib/sbuddy-state.ts');
  const parser = await server.ssrLoadModule('/lib/schedule-parser.ts');
  const relationship = await server.ssrLoadModule('/lib/relationship.ts');
  const campus = await server.ssrLoadModule('/lib/campus-data.ts');
  check(
    'fresh state has three independent companions and no fabricated records',
    () => {
      const d = state.createAppData();
      assert.equal(d.buddies.length, 3);
      assert.equal(d.events.length, 0);
      assert.equal(d.focusHistory.length, 0);
      assert.equal(d.note.transcript, '');
      d.buddies[0].relationship.preferences.reminderStyle = 'quiet';
      assert.deepEqual(d.buddies[1].relationship.preferences, {});
    },
  );
  check('tomorrow crosses month end', () =>
    assert.equal(
      parser.resolveDate('明天 14:00-16:00 自习', new Date(2026, 8, 30)),
      '2026-10-01',
    ),
  );
  check('day after tomorrow crosses year end', () =>
    assert.equal(
      parser.resolveDate('后天', new Date(2026, 11, 31)),
      '2027-01-02',
    ),
  );
  check('leap and non-leap February', () => {
    assert.equal(parser.resolveDate('2028年2月29日'), '2028-02-29');
    assert.equal(parser.resolveDate('2026年2月29日'), undefined);
  });
  check('no fabricated date or end time', () => {
    const [e] = parser.parseScheduleMaterial('阅读论文');
    assert.equal(e.date, undefined);
    assert.equal(e.time, '');
    assert.equal(e.end, '');
    assert.equal(state.validEvent(e), false);
  });
  check('next week uses Monday-based dates', () =>
    assert.equal(
      parser.resolveDate('下周一', new Date(2026, 8, 6)),
      '2026-09-07',
    ),
  );
  check('explicit 31st is preserved', () =>
    assert.equal(
      parser.resolveDate('2026-12-31 09:00-10:00 会议'),
      '2026-12-31',
    ),
  );
  check('Chinese date and afternoon times', () => {
    const [e] = parser.parseScheduleMaterial(
      '明天下午2点到4点自习',
      new Date(2026, 11, 31),
    );
    assert.equal(e.time, '14:00');
    assert.equal(e.end, '16:00');
    assert.equal(e.date, '2027-01-01');
    assert.equal(state.validEvent(e), true);
  });
  check('invalid time is rejected', () => {
    const [e] = parser.parseScheduleMaterial('今天25:00-26:00 会议');
    assert.equal(state.validEvent(e), false);
  });
  check('repeated imports are idempotent', () => {
    const [e] = parser.parseScheduleMaterial(
      '明天 14:00–16:00 阅读',
      new Date(2026, 8, 5),
    );
    const merged = state.mergeEvents([e], [{ ...e, id: 'different' }]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].id, e.id);
  });
  check('same title on another day remains separate', () => {
    const [e] = parser.parseScheduleMaterial(
      '明天 14:00–16:00 阅读',
      new Date(2026, 8, 5),
    );
    assert.equal(
      state.mergeEvents([e], [{ ...e, id: 'different', date: '2026-09-07' }])
        .length,
      2,
    );
  });
  check('companion updates are isolated', () => {
    const d = state.createAppData();
    const next = state.updateBuddy(d, 'zhixu', (b) => ({
      ...b,
      relationship: state.earnBond(b.relationship, 25),
    }));
    assert.equal(next.buddies[0].relationship.bond, 0);
    assert.equal(next.buddies[1].relationship.bond, 25);
    assert.equal(next.buddies[1].relationship.unlocked.length, 2);
  });
  check('late asynchronous result retains originating buddy', () => {
    const d = { ...state.createAppData(), activeBuddyId: 'xiangyang' };
    const next = state.updateBuddy(d, 'xiaohe', (b) => ({
      ...b,
      name: 'updated',
    }));
    assert.equal(next.buddies[2].name, '向阳');
    assert.equal(next.buddies[0].name, 'updated');
  });
  check('focus rewards belong to session companion after switch', () => {
    const d = {
      ...state.createAppData(),
      activeBuddyId: 'zhixu',
      focus: {
        id: 'test',
        buddyId: 'xiaohe',
        status: 'running',
        duration: 600,
        remaining: 600,
        endsAt: 1000,
      },
    };
    const next = state.settleFocus(d, 2000);
    assert.equal(next.buddies[0].relationship.bond, 3);
    assert.equal(next.buddies[1].relationship.bond, 0);
    assert.equal(next.focusHistory[0].minutes, 10);
  });
  check('focus settlement occurs exactly once', () => {
    const d = {
      ...state.createAppData(),
      focus: {
        id: 'test',
        buddyId: 'xiaohe',
        status: 'running',
        duration: 600,
        remaining: 600,
        endsAt: 1000,
      },
    };
    const once = state.settleFocus(d, 2000),
      twice = state.settleFocus(once, 99999);
    assert.equal(twice.focusHistory.length, 1);
    assert.equal(twice.buddies[0].relationship.bond, 3);
  });
  check('background time uses deadline instead of tick count', () =>
    assert.equal(
      state.remainingSeconds(
        { status: 'running', endsAt: 100000, remaining: 600 },
        90500,
      ),
      10,
    ),
  );
  check('paused timer is stable', () =>
    assert.equal(
      state.remainingSeconds({ status: 'paused', remaining: 85 }, 900000),
      85,
    ),
  );
  check('early finish records only actual focused duration', () => {
    const d = {
      ...state.createAppData(),
      focus: {
        id: 'early',
        buddyId: 'xiaohe',
        status: 'running',
        duration: 600,
        remaining: 600,
        endsAt: 600000,
      },
    };
    const n = state.settleFocus(d, 120000, true);
    assert.equal(n.focusHistory[0].minutes, 2);
    assert.equal(n.buddies[0].relationship.bond, 1);
  });
  check('zero-time focus does not earn a reward', () => {
    const d = {
      ...state.createAppData(),
      focus: {
        id: 'zero',
        buddyId: 'xiaohe',
        status: 'running',
        duration: 600,
        remaining: 600,
        endsAt: 600000,
      },
    };
    const n = state.settleFocus(d, 0, true);
    assert.equal(n.focusHistory.length, 0);
    assert.equal(n.buddies[0].relationship.bond, 0);
  });
  check('earned rewards never relock', () => {
    const bond = state.earnBond(state.freshRelationship(), 25);
    const lower = state.earnBond(bond, -2);
    assert.equal(lower.unlocked.length, 2);
  });
  check('all six gallery rewards at 75', () =>
    assert.equal(
      state.earnBond(state.freshRelationship(), 75).unlocked.length,
      6,
    ),
  );
  check('dialogue keeps prior unlocks when bond falls', () => {
    const r = state.earnBond(state.freshRelationship(), 25);
    const p = relationship.dialoguePrompts.find((p) =>
      p.choices.some((c) => c.delta < 0),
    );
    const n = relationship.applyDialogueChoice(
      r,
      p,
      p.choices.find((c) => c.delta < 0),
      new Date(),
    ).state;
    assert.equal(n.unlocked.length, 2);
  });
  check('legacy migration retains bond, appearance and study history', () => {
    const map = {
      'study-buddies-relationship': JSON.stringify({
        ...state.freshRelationship(),
        bond: 30,
      }),
      'study-buddies-avatar-style': JSON.stringify({ hairColor: '#123456' }),
      'study-buddies-profile': JSON.stringify({
        energy: 4,
        focusHistory: [{ date: '8/27', minutes: 25, feedback: 'steady' }],
      }),
    };
    const n = state.migrateLegacy((k) => map[k] ?? null);
    assert.equal(n.buddies[0].relationship.bond, 30);
    assert.equal(n.buddies[0].style.hairColor, '#123456');
    assert.equal(n.focusHistory.length, 1);
    assert.equal(n.legacyProfile.energy, 4);
    assert.deepEqual(
      JSON.parse(
        JSON.stringify(state.validateAppData(JSON.parse(JSON.stringify(n)))),
      ),
      JSON.parse(JSON.stringify(n)),
    );
  });
  check('new-format reload does not duplicate migrated history', () => {
    const d = state.createAppData();
    assert.deepEqual(
      JSON.parse(
        JSON.stringify(state.validateAppData(JSON.parse(JSON.stringify(d)))),
      ),
      JSON.parse(JSON.stringify(d)),
    );
  });
  check('corrupt and unsupported backups rejected', () => {
    assert.throws(() => state.validateAppData({ version: 1 }));
    assert.throws(() =>
      state.validateAppData({ ...state.createAppData(), buddies: [] }),
    );
    assert.throws(() =>
      state.validateAppData({
        ...state.createAppData(),
        activeBuddyId: 'missing',
      }),
    );
  });
  check('invalid relationship and campus data rejected', () => {
    const d = state.createAppData();
    d.buddies[0].relationship.bond = NaN;
    assert.throws(() => state.validateAppData(d));
    const c = state.createAppData();
    c.campus.todos = [{ id: 'broken' }];
    assert.throws(() => state.validateAppData(c));
  });
  check('todo completion removes its calendar entry', () => {
    let c = campus.createInitialCampusData();
    c = campus.upsertTodo(c, {
      id: 'todo',
      title: 'task',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      reminderTimes: [],
      dueAt: '2026-09-06T10:00:00+08:00',
    });
    assert.equal(campus.campusScheduleEvents(c).length, 1);
    c = campus.upsertTodo(c, {
      ...c.todos[0],
      completedAt: new Date().toISOString(),
    });
    assert.equal(campus.campusScheduleEvents(c).length, 0);
  });

  const scheduleApi = await server.ssrLoadModule(
    '/app/api/ai/schedule/route.ts',
  );
  const summaryApi = await server.ssrLoadModule('/app/api/ai/summary/route.ts');
  const audioApi = await server.ssrLoadModule(
    '/app/api/ai/transcribe/route.ts',
  );
  const imageApi = await server.ssrLoadModule(
    '/app/api/ai/campus-import/route.ts',
  );
  const storage = await server.ssrLoadModule('/lib/sbuddy-storage.ts');
  const previousKey = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;
  const post = (data) =>
    new Request('http://localhost/api', {
      method: 'POST',
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' },
    });
  try {
    delete process.env.OPENAI_API_KEY;
    const response = await scheduleApi.POST(
      post({
        material: '明天 14:00-16:00 自习',
        referenceDate: '2026-12-31',
        timezone: 'Asia/Shanghai',
      }),
    );
    const result = await response.json();
    check('schedule API preserves supplied year boundary without a key', () => {
      assert.equal(result.source, 'fallback');
      assert.equal(result.events[0].date, '2027-01-01');
    });
    const summary = await (
      await summaryApi.POST(
        post({ transcript: '今天讨论了研究计划。下一步需要完成文献阅读。' }),
      )
    ).json();
    check('text summary works without a key and labels fallback', () => {
      assert.equal(summary.source, 'fallback');
      assert.equal(summary.actionItems.length, 1);
    });
    check('audio without a key is unavailable rather than simulated', () => {});
    assert.equal((await audioApi.POST(post({}))).status, 503);
    check(
      'screenshot without a key is unavailable rather than simulated',
      () => {},
    );
    assert.equal((await imageApi.POST(post({}))).status, 503);
    assert.equal(
      (
        await scheduleApi.POST(
          new Request('http://localhost', { method: 'POST', body: 'broken' }),
        )
      ).status,
      400,
    );
    check('malformed request is rejected', () => {});
    await assert.rejects(storage.assetTransaction());
    check('unavailable IndexedDB rejects instead of reporting saved', () => {});
    process.env.OPENAI_API_KEY = 'test-only-placeholder';
    globalThis.fetch = async () => {
      throw new Error('Simulated offline service');
    };
    const failed = await (
      await scheduleApi.POST(
        post({
          material: '明天 14:00-16:00 自习',
          referenceDate: '2026-12-31',
        }),
      )
    ).json();
    check('failed AI schedule request returns explicit local fallback', () => {
      assert.equal(failed.source, 'fallback');
      assert.equal(failed.events[0].date, '2027-01-01');
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
  console.log('\n' + checks + ' SBuddy domain checks passed.');
} finally {
  await server.close();
}
