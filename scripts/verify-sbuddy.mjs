import assert from 'node:assert/strict';
import { verifySprites } from './verify-sprites.mjs';
import { verifyScoring } from './verify-scoring.mjs';
import { verifyShowcase } from './verify-showcase.mjs';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { createServer } from 'vite';
import { verifyCourseware } from './verify-courseware.mjs';
import { verifyBehavior } from './verify-behavior.mjs';
import { verifyChibi } from './verify-chibi.mjs';
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
  const workerEvents = {},
    removedCaches = [];
  runInNewContext(await readFile('public/sw.js', 'utf8'), {
    self: {
      addEventListener: (name, fn) => {
        workerEvents[name] = fn;
      },
      clients: { claim() {} },
      skipWaiting() {},
      location: { origin: 'http://localhost:3000' },
    },
    caches: {
      keys: async () => [
        'study-buddies-shell-v10',
        'study-buddies-shell-v25',
        'other-app',
      ],
      delete: async (key) => removedCaches.push(key),
    },
    URL,
  });
  let activated = Promise.resolve();
  workerEvents.activate({
    waitUntil: (promise) => {
      activated = promise;
    },
  });
  await activated;
  check(
    'cache upgrade removes old own cache and preserves unrelated caches',
    () => {
      assert.deepEqual(removedCaches, ['study-buddies-shell-v10']);
      workerEvents.fetch({
        request: { method: 'POST', url: 'http://localhost:3000/api/ai/avatar' },
        respondWith() {
          assert.fail('must not cache API');
        },
      });
      workerEvents.fetch({
        request: {
          method: 'GET',
          url: 'http://localhost:3000/api/ai/schedule',
        },
        respondWith() {
          assert.fail('must not cache API');
        },
      });
    },
  );
  const state = await server.ssrLoadModule('/lib/sbuddy-state.ts');
  await verifyScoring(server, check, state);
  await verifyChibi(server, check, state);
  await verifyCourseware(server, check, state);
  const parser = await server.ssrLoadModule('/lib/schedule-parser.ts');
  const relationship = await server.ssrLoadModule('/lib/relationship.ts');
  const campus = await server.ssrLoadModule('/lib/campus-data.ts');
  const insights = await server.ssrLoadModule('/lib/study-insight.ts');
  const impressions = await server.ssrLoadModule('/lib/impression-summary.ts');
  const calendar = await server.ssrLoadModule('/lib/calendar-layout.ts');
  const navigation = await server.ssrLoadModule('/lib/app-navigation.ts');
  check(
    'preview and interaction guide use hash pages without replacing existing routes',
    () => {
      for (const page of [
        'animation-preview',
        'interaction-guide',
        'home',
        'play',
        'characters',
        'settings',
      ])
        assert.deepEqual(navigation.parseNavigation('#' + page), { page });
      assert.deepEqual(navigation.parseNavigation('#tools/notes'), {
        page: 'tools',
        sub: 'notes',
      });
    },
  );
  const scheduleEngine = await server.ssrLoadModule('/lib/schedule-engine.ts');
  const eventSeed = {
    id: 'calendar-test',
    date: '2026-09-06',
    day: 6,
    title: '阅读',
    time: '14:00',
    end: '15:00',
    kind: 'study',
  };
  check(
    'four calendar categories retain their animation modes through backup',
    () => {
      const data = state.createAppData();
      data.events = ['class', 'study', 'meeting', 'personal'].map((kind) => ({
        ...eventSeed,
        id: `category-${kind}`,
        kind,
      }));
      const restored = state.validateAppData(JSON.parse(JSON.stringify(data)));
      assert.deepEqual(restored.events.map(calendar.eventLabel), [
        '课程',
        '自习',
        '会议',
        '其他',
      ]);
      assert.deepEqual(
        restored.events.map((event) => scheduleEngine.kindToMode(event.kind)),
        ['class', 'study', 'meeting', 'idle'],
      );
      assert.equal(new Set(restored.events.map(calendar.eventColor)).size, 4);
    },
  );
  check(
    'month grid uses Sunday first and handles four, five and six rows',
    () => {
      for (const [key, count] of [
        ['2026-02-01', 28],
        ['2026-09-01', 35],
        ['2026-08-01', 42],
      ]) {
        const days = calendar.monthDays(calendar.calendarDate(key));
        assert.equal(days.length, count);
        assert.equal(days[0].getDay(), 0);
        assert.equal(new Set(days.map(state.localDate)).size, count);
      }
      assert.equal(
        state.localDate(
          calendar.moveMonth(calendar.calendarDate('2026-01-31'), 1),
        ),
        '2026-02-01',
      );
    },
  );
  check('week dates cross year boundaries without losing days', () => {
    assert.deepEqual(
      calendar
        .weekDays(calendar.calendarDate('2027-01-01'))
        .map(state.localDate),
      [
        '2026-12-28',
        '2026-12-29',
        '2026-12-30',
        '2026-12-31',
        '2027-01-01',
        '2027-01-02',
        '2027-01-03',
      ],
    );
  });
  check(
    'weekly and biweekly recurrence is bounded and excludes deleted dates',
    () => {
      const e = {
        ...eventSeed,
        repeat: { kind: 'biweekly', until: '2026-10-04' },
        excludedDates: ['2026-09-20'],
      };
      assert.equal(calendar.occursOn(e, '2026-09-06'), true);
      assert.equal(calendar.occursOn(e, '2026-09-13'), false);
      assert.equal(calendar.occursOn(e, '2026-09-20'), false);
      assert.equal(calendar.occursOn(e, '2026-10-04'), true);
      assert.equal(calendar.occursOn(e, '2026-10-18'), false);
    },
  );
  check(
    'monthly recurrence skips nonexistent dates and yearly leap days',
    () => {
      const e = {
        ...eventSeed,
        date: '2024-01-31',
        repeat: { kind: 'monthly' },
      };
      assert.equal(calendar.occursOn(e, '2024-02-29'), false);
      assert.equal(calendar.occursOn(e, '2024-03-31'), true);
      const leap = { ...e, date: '2024-02-29', repeat: { kind: 'yearly' } };
      assert.equal(calendar.occursOn(leap, '2025-02-28'), false);
      assert.equal(calendar.occursOn(leap, '2028-02-29'), true);
    },
  );
  check('custom weekday interval uses calendar weeks', () => {
    const e = {
      ...eventSeed,
      date: '2026-09-07',
      repeat: {
        kind: 'custom',
        frequency: 'weekly',
        interval: 2,
        weekdays: [1, 3],
      },
    };
    assert.equal(calendar.occursOn(e, '2026-09-09'), true);
    assert.equal(calendar.occursOn(e, '2026-09-16'), false);
    assert.equal(calendar.occursOn(e, '2026-09-23'), true);
  });
  check(
    'custom monthly ordinal supports last workday and second-last weekend',
    () => {
      const e = {
        ...eventSeed,
        date: '2026-09-01',
        repeat: {
          kind: 'custom',
          frequency: 'monthly',
          interval: 1,
          ordinal: -1,
          dayKind: 'workday',
        },
      };
      assert.equal(calendar.occursOn(e, '2026-09-30'), true);
      assert.equal(calendar.occursOn(e, '2026-10-30'), true);
      assert.equal(calendar.occursOn(e, '2026-10-31'), false);
      assert.equal(
        calendar.occursOn(
          { ...e, repeat: { ...e.repeat, ordinal: -2, dayKind: 'weekend' } },
          '2026-09-26',
        ),
        true,
      );
    },
  );
  check(
    'recurrence expansion never mutates stored originals or duplicates on reload',
    () => {
      const e = { ...eventSeed, repeat: { kind: 'daily' } };
      const before = JSON.stringify(e);
      const days = calendar.weekDays(calendar.calendarDate(e.date));
      const expanded = calendar.eventsForDays([e], days);
      assert.equal(JSON.stringify(e), before);
      assert.deepEqual(expanded, calendar.eventsForDays([e], days));
      assert.equal(expanded.length, 1);
    },
  );
  check(
    'overlap packing shares columns and touching boundaries do not conflict',
    () => {
      const rows = calendar.packEvents([
        { ...eventSeed, id: 'a', time: '09:00', end: '11:00' },
        { ...eventSeed, id: 'b', time: '10:00', end: '12:00' },
        { ...eventSeed, id: 'c', time: '11:00', end: '12:00' },
        { ...eventSeed, id: 'd', time: '12:00', end: '13:00' },
      ]);
      assert.deepEqual(
        rows.map((r) => [r.column, r.columns]),
        [
          [0, 2],
          [1, 2],
          [0, 2],
          [0, 1],
        ],
      );
    },
  );
  check(
    'compressed week axis is monotone across all 1441 minute boundaries',
    () => {
      assert.equal(calendar.weekY(0), 0);
      assert.equal(calendar.weekY(1440), calendar.visualEnd);
      for (let m = 1; m <= 1440; m++)
        assert.ok(calendar.weekY(m) >= calendar.weekY(m - 1));
    },
  );
  check(
    'new repeat fields survive backups while malformed rules are rejected',
    () => {
      const d = state.createAppData();
      d.events = [
        {
          ...eventSeed,
          repeat: {
            kind: 'custom',
            frequency: 'weekly',
            interval: 2,
            weekdays: [2, 4],
            until: '2026-12-31',
          },
          remindMinutes: 30,
        },
      ];
      d.settings.showAcademicCalendar = true;
      const round = state.validateAppData(JSON.parse(JSON.stringify(d)));
      assert.deepEqual(round.events, d.events);
      assert.equal(round.settings.showAcademicCalendar, true);
      for (const rule of [
        { kind: 'bad' },
        { kind: 'custom', interval: 0 },
        { kind: 'weekly', weekdays: [8] },
        { kind: 'daily', until: '2026-01-01' },
      ])
        assert.throws(() =>
          state.validateAppData({
            ...d,
            events: [{ ...eventSeed, repeat: rule }],
          }),
        );
    },
  );
  check(
    'course occurrence hiding preserves all other teaching weeks and snapshots',
    () => {
      const d = campus.createInitialCampusData();
      d.semesterStart = '2026-09-07';
      d.courses = [
        {
          id: 'c',
          courseName: '课程',
          semester: '2026-1',
          weekday: 1,
          periods: [1, 2],
          weeks: [1, 2],
          startMinutes: 480,
          endMinutes: 570,
          source: 'manual',
          excludedDates: ['2026-09-07'],
        },
      ];
      d.courseSnapshots = [{ ...d.courses[0], excludedDates: [] }];
      const next = campus.normalizeCampusData(JSON.parse(JSON.stringify(d)));
      assert.equal(campus.campusScheduleEvents(next).length, 1);
      assert.equal(
        campus.campusScheduleEvents({ ...next, courses: next.courseSnapshots })
          .length,
        2,
      );
    },
  );
  check(
    'reminders use explicit configured times and omit completed tasks and legacy events',
    () => {
      const now = new Date('2026-09-06T13:30:00').getTime();
      const t = {
        id: 't',
        title: '作业',
        reminderTimes: [new Date(now).toISOString()],
      };
      const found = calendar.calendarReminders(
        [
          eventSeed,
          { ...eventSeed, id: 'on', remindMinutes: 30 },
          { ...eventSeed, id: 'off', remindMinutes: null },
        ],
        [t, { ...t, id: 'done', completedAt: '2026-09-06' }],
        now,
      );
      assert.deepEqual(found.map((n) => n.id).sort(), [
        `event:on:2026-09-06`,
        `todo:t:${new Date(now).toISOString()}`,
      ]);
    },
  );
  check('reminders before midnight find next-day events', () => {
    const now = new Date('2026-09-06T23:45:00').getTime();
    assert.equal(
      calendar.calendarReminders(
        [
          {
            ...eventSeed,
            date: '2026-09-07',
            time: '00:15',
            end: '01:00',
            remindMinutes: 30,
          },
        ],
        [],
        now,
      ).length,
      1,
    );
  });
  check(
    'impressions combine preferences and habits without echoing answers',
    () => {
      const b = state.createAppData().buddies[0];
      b.relationship.preferences = {
        reminderStyle: 'quiet',
        taskApproach: 'tiny-step',
      };
      b.impressions = ['我喜欢在晚饭后去图书馆。', '我喜欢在晚饭后去图书馆。'];
      const text = impressions.summarizeImpression(b, []);
      assert.match(text, /安静的空间/);
      assert.match(text, /小步骤/);
      assert.match(text, /图书馆/);
      assert.match(text, /晚饭后/);
      assert.ok(!text.includes(b.impressions[0]));
      assert.equal(text.match(/图书馆/g).length, 1);
    },
  );
  check(
    'impressions do not turn negative or deleted notes into positive habits',
    () => {
      const b = state.createAppData().buddies[0];
      b.impressions = [
        '我喜欢晚上看书。',
        '我不再喜欢晚上看书。',
        '我不喜欢去图书馆。',
      ];
      const text = impressions.summarizeImpression(b, []);
      assert.match(text, /避开图书馆/);
      assert.doesNotMatch(text, /习惯把学习安排在晚上|阅读是你的兴趣/);
      b.impressions = [];
      assert.equal(
        impressions.summarizeImpression(b, []),
        '我还在了解你的学习习惯。',
      );
    },
  );
  check(
    'impressions use only this buddy and the latest temporary feedback',
    () => {
      const b = state.createAppData().buddies[0];
      const records = [
        { buddyId: b.id, at: '2026-09-01', feedback: 'tired' },
        { buddyId: b.id, at: '2026-09-02', feedback: 'steady' },
        { buddyId: 'zhixu', at: '2026-09-03', feedback: 'distracted' },
      ];
      const text = impressions.summarizeImpression(b, records);
      assert.match(text, /最近一次.*合适/);
      assert.doesNotMatch(text, /疲惫|分心/);
      assert.equal(records[0].feedback, 'tired');
    },
  );
  const dictation = await server.ssrLoadModule('/lib/live-dictation.ts');
  const rig = await server.ssrLoadModule('/lib/companion-rig.ts');
  check('all ten loops close without root movement or endpoint jumps', () => {
    for (const s of rig.RIG_STATES) {
      const first = rig.loopPose(s, 0),
        last = rig.loopPose(s, rig.CYCLE_MS[s] - 0.001);
      for (const key of Object.keys(first))
        assert.ok(Math.abs(first[key] - last[key]) < 0.001, `${s}.${key}`);
      for (let t = 0; t < rig.CYCLE_MS[s] * 3; t += 137) {
        const p = rig.loopPose(s, t);
        assert.equal(p.x, first.x);
        assert.equal(p.y, first.y);
      }
    }
    assert.equal(rig.loopPose('study', 3000).pen, 1);
    assert.equal(rig.loopPose('study', 3000).laptop, 0);
    assert.ok(rig.loopPose('away', 3000).x > 600);
  });
  check(
    'all 100 ordered activity pairs connect without teleporting or angular jumps',
    () => {
      for (const from of rig.RIG_STATES)
        for (const to of rig.RIG_STATES) {
          const r = rig.createRigRuntime(from);
          let previous = rig.sampleRig(r, 1300);
          rig.requestRigState(r, to);
          for (let t = 1300; t <= 19300; t += 10) {
            const p = rig.sampleRig(r, t);
            for (const k of Object.keys(p)) {
              assert.ok(Number.isFinite(p[k]));
              assert.ok(
                Math.abs(p[k] - previous[k]) <
                  (k === 'x' || k === 'y' ? 4 : k === 'blink' ? 1 : 0.2),
                `${from}->${to}: ${k} at ${t}`,
              );
            }
            previous = { ...p };
          }
          assert.equal(r.current, to);
          assert.equal(r.segments.length, 0);
        }
    },
  );
  check(
    'rapid activity requests finish safely at latest requested activity',
    () => {
      const r = rig.createRigRuntime('study');
      rig.requestRigState(r, 'away');
      rig.sampleRig(r, 10);
      rig.requestRigState(r, 'cheer');
      rig.sampleRig(r, 300);
      rig.requestRigState(r, 'meeting');
      for (let t = 310; t < 30000; t += 10) rig.sampleRig(r, t);
      assert.equal(r.current, 'meeting');
      assert.equal(r.segments.length, 0);
    },
  );
  check(
    'legacy third companion preserves its history outside the two defaults',
    () => {
      const d = state.createAppData();
      const old = state.createBuddy('向阳', '活力陪伴', 'xiangyang', true);
      old.relationship.bond = 37;
      d.buddies.push(old);
      const upgraded = state.validateAppData(d);
      assert.equal(upgraded.buddies.length, 3);
      assert.equal(upgraded.buddies[2].relationship.bond, 37);
      assert.equal(upgraded.buddies[2].legacyPreset, true);
    },
  );
  check(
    'energy is initially unknown and older v2 backups remain readable',
    () => {
      const d = state.createAppData();
      assert.equal(insights.studyInsight(d, []).energyLabel, '尚未记录');
      delete d.studyProfile;
      assert.equal(state.validateAppData(d).studyProfile.energy, null);
      d.legacyProfile = { energy: 2 };
      assert.equal(state.validateAppData(d).studyProfile.energy, 2);
    },
  );
  check(
    'legacy energy and pending photo survive migration and backup roundtrip',
    () => {
      const d = state.migrateLegacy(
        (key) =>
          ({
            'study-buddies-profile': '{"energy":4}',
            'study-buddies-avatar': 'data:image/png;base64,fixture',
          })[key] ?? null,
      );
      const restored = state.validateAppData(JSON.parse(JSON.stringify(d)));
      assert.equal(restored.studyProfile.energy, 4);
      assert.equal(restored.legacyPhotoPending, true);
      restored.activeBuddyId = 'zhixu';
      assert.equal(insights.studyInsight(restored, []).energy, 4);
    },
  );
  check(
    'seven-day totals cross the year and exclude future records and zero minutes',
    () => {
      const d = state.createAppData();
      d.focusHistory = [
        ['2025-12-27T12:00:00', 90],
        ['2025-12-28T12:00:00', 10],
        ['2026-01-02T12:00:00', 25],
        ['2026-01-02T18:00:00', 5],
        ['2026-01-03T12:00:00', 0],
        ['2026-01-04T12:00:00', 60],
      ].map(([at, minutes], i) => ({
        id: String(i),
        buddyId: 'xiaohe',
        at,
        minutes,
      }));
      const result = insights.studyInsight(d, [], new Date(2026, 0, 3, 15));
      assert.equal(result.recentMinutes, 40);
      assert.equal(result.recentCount, 3);
      assert.equal(result.recentDays, 2);
      assert.equal(result.streak, 1);
    },
  );
  check('suggestions use actual next task and explicit fatigue', () => {
    const d = state.createAppData();
    const events = [
      {
        id: 'e',
        date: '2026-09-05',
        day: 5,
        title: '项目讨论',
        kind: 'meeting',
        time: '14:00',
        end: '15:00',
      },
    ];
    const result = insights.studyInsight(d, events, new Date(2026, 8, 5, 13));
    assert.equal(result.scheduledMinutes, 60);
    assert.match(result.suggestion, /项目讨论.*3 个讨论点/);
    d.studyProfile = { energy: 1 };
    assert.match(insights.studyInsight(d, events).suggestion, /先休息/);
  });
  check(
    'dictation appends finals once and ignores late callbacks after stop',
    () => {
      let recognition;
      class FakeSpeech {
        constructor() {
          recognition = this;
        }
        start() {}
        abort() {
          this.aborted = true;
        }
      }
      const finals = [],
        interim = [],
        ended = [];
      const stop = dictation.beginDictation(FakeSpeech, {
        onFinal: (t) => finals.push(t),
        onInterim: (t) => interim.push(t),
        onEnd: (t) => ended.push(t),
      });
      const emit = recognition.onresult;
      emit({
        resultIndex: 0,
        results: [{ isFinal: false, 0: { transcript: '识别中' } }],
      });
      assert.equal(finals.length, 0);
      const event = {
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: '完成文字' } }],
      };
      emit(event);
      emit(event);
      assert.deepEqual(finals, ['完成文字']);
      stop();
      emit({
        resultIndex: 1,
        results: [
          event.results[0],
          { isFinal: true, 0: { transcript: '离开后的文字' } },
        ],
      });
      assert.deepEqual(finals, ['完成文字']);
      assert.equal(ended.length, 1);
      assert.equal(interim.at(-1), '');
      assert.equal(recognition.aborted, true);
    },
  );
  check(
    'dictation permission rejection stops recognition and offers text',
    () => {
      let recognition;
      class FakeSpeech {
        constructor() {
          recognition = this;
        }
        start() {}
        abort() {
          this.aborted = true;
        }
      }
      let message = '';
      dictation.beginDictation(FakeSpeech, {
        onFinal() {},
        onInterim() {},
        onEnd(t) {
          message = t;
        },
      });
      recognition.onerror({ error: 'not-allowed' });
      assert.match(message, /权限被拒绝.*文字/);
      assert.equal(recognition.aborted, true);
    },
  );
  check(
    'fresh state has two distinct independent companions and no fabricated records',
    () => {
      const d = state.createAppData();
      assert.equal(d.buddies.length, 2);
      assert.deepEqual(
        d.buddies.map((b) => b.appearance.preset),
        ['female', 'male'],
      );
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
  check('time ranges do not leave date-like fragments in titles', () => {
    for (const dash of ['-', '–', '到'])
      assert.equal(
        parser.parseScheduleMaterial(`明天 14:00${dash}16:00 图书馆自习`)[0]
          .title,
        '图书馆自习',
      );
  });
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
    assert.equal(next.buddies[1].relationship.unlocked.length, 1);
  });
  check('late asynchronous result retains originating buddy', () => {
    const d = { ...state.createAppData(), activeBuddyId: 'zhixu' };
    const next = state.updateBuddy(d, 'xiaohe', (b) => ({
      ...b,
      name: 'updated',
    }));
    assert.equal(next.buddies[1].name, '知序');
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
    assert.equal(next.buddies[0].relationship.bond, 1);
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
    assert.equal(twice.buddies[0].relationship.bond, 1);
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
    assert.equal(n.buddies[0].relationship.bond, 0);
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
    assert.equal(lower.unlocked.length, 1);
  });
  check(
    'gallery rewards unlock every 25 points through both focus and dialogue',
    () => {
      assert.deepEqual(
        state.rewards.map((reward) => reward.threshold),
        [25, 50, 75, 100, 125, 150],
      );
      for (let i = 0; i < 6; i++) {
        const threshold = (i + 1) * 25;
        const before = state.earnBond(state.freshRelationship(), threshold - 1);
        assert.equal(before.unlocked.length, i);
        assert.equal(state.earnBond(before, 1).unlocked.length, i + 1);
        const prompt = relationship.dialoguePrompts[0];
        const choice = prompt.choices.find((item) => item.delta === 1);
        assert.equal(
          relationship.applyDialogueChoice(before, prompt, choice, new Date())
            .state.unlocked.length,
          i + 1,
        );
      }
    },
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
    assert.equal(n.unlocked.length, 1);
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
  const avatarApi = await server.ssrLoadModule('/app/api/ai/avatar/route.ts');
  const dialogueApi = await server.ssrLoadModule(
    '/app/api/ai/dialogue/route.ts',
  );
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
    assert.equal((await avatarApi.POST(post({}))).status, 503);
    check('unconfigured photo generation explicitly unavailable', () => {});
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
    let dialogueInput;
    globalThis.fetch = async (_url, options) => {
      dialogueInput = JSON.parse(options.body);
      return Response.json({
        output_text: JSON.stringify({ text: '好，我会轻轻提醒。' }),
      });
    };
    const flexible = await (
      await dialogueApi.POST(
        post({
          text: '收到，我会提醒你。',
          personality: '未知',
          preferences: {
            reminderStyle: 'gentle',
            irrelevant: 'should-not-forward',
          },
        }),
      )
    ).json();
    check(
      'unknown personality uses saved preferences without forwarding arbitrary fields',
      () => {
        assert.equal(flexible.source, 'ai');
        assert.ok(dialogueInput.instructions.includes('性格尚未定型'));
        assert.ok(dialogueInput.input.includes('gentle'));
        assert.ok(!dialogueInput.input.includes('should-not-forward'));
        const data = state.createAppData();
        data.buddies[0].personality = '未知';
        assert.equal(
          state.validateAppData(JSON.parse(JSON.stringify(data))).buddies[0]
            .personality,
          '未知',
        );
      },
    );
    const upload = () => {
      const form = new FormData();
      form.set(
        'image',
        new File(['fixture'], 'person.png', { type: 'image/png' }),
      );
      form.set('preset', 'male');
      return new Request('http://localhost/api/ai/avatar', {
        method: 'POST',
        body: form,
      });
    };
    for (const scenario of [
      'full-body',
      'head-only',
      'none',
      'group',
      'invalid',
      'offline',
    ]) {
      let images = 0;
      globalThis.fetch = async (url, options) => {
        if (scenario === 'offline')
          throw new Error('Simulated unavailable service');
        if (
          url instanceof URL &&
          url.pathname === '/characters/male-sprite-v3.png'
        )
          return new Response(new Uint8Array([137, 80, 78, 71]), {
            headers: { 'content-type': 'image/png' },
          });
        if (typeof url === 'string' && url.endsWith('/images/edits')) {
          images++;
          assert.equal(options.body.get('background'), 'transparent');
          assert.equal(options.body.get('size'), '1536x2048');
          assert.equal(options.body.getAll('image[]').length, 2);
          assert.match(
            options.body.get('prompt'),
            /six columns and eight rows/,
          );
          return Response.json({ data: [{ b64_json: 'fixture' }] });
        }
        const name = JSON.parse(options.body).text.format.name;
        const result =
          name === 'study_buddy_sprite_check'
            ? { valid: scenario !== 'invalid' }
            : {
                personCount:
                  scenario === 'none' ? 0 : scenario === 'group' ? 2 : 1,
                usable: !['none', 'group'].includes(scenario),
                framing:
                  scenario === 'none'
                    ? 'none'
                    : scenario === 'head-only'
                      ? 'head-only'
                      : 'full-body',
                appearance: '短发，衬衫',
                reason: '',
              };
        return Response.json({ output_text: JSON.stringify(result) });
      };
      const response = await avatarApi.POST(upload()),
        body = await response.json();
      check(`photo service contract: ${scenario}`, () => {
        assert.equal(
          response.status,
          ['full-body', 'head-only'].includes(scenario)
            ? 200
            : scenario === 'offline'
              ? 502
              : 422,
        );
        assert.equal(
          images,
          ['none', 'group', 'offline'].includes(scenario) ? 0 : 1,
        );
        if (response.ok) {
          assert.equal(body.rigVersion, 3);
          assert.equal(body.spriteManifest.version, 3);
          assert.equal(body.photoMode, scenario);
        } else assert.ok(body.error.startsWith('无法生成'));
      });
    }
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
  await verifyBehavior(server, check, state);
  await verifySprites(server, check, state);
  await verifyShowcase(server, check, state);
  console.log('\n' + checks + ' SBuddy domain checks passed.');
} finally {
  await server.close();
}
