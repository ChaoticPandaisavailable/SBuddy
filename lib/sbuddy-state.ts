import { validateSpriteManifest } from './sprite-animation';
import {
  defaultAvatarStyle,
  normalizeAvatarStyle,
  type AvatarStyle,
} from './avatar-style';
import {
  createInitialCampusData,
  normalizeCampusData,
  type CampusDataState,
} from './campus-data';
import {
  initialRelationship,
  normalizeRelationship,
  getBondLevel,
  type RelationshipState,
} from './relationship';
import type { ScheduleEvent } from './schedule-parser';
import { validCoursewareResult, type Courseware } from './courseware';
import { normalizeStudyProfile, type StudyProfile } from './study-insight';
import type { RigAppearance } from './companion-rig';
import { normalizeBehavior, type BuddyBehavior } from './companion-behavior';

export const STORAGE_KEY = 'sbuddy-state-v2';
export type Buddy = {
  id: string;
  name: string;
  personality: string;
  preset: boolean;
  style: AvatarStyle;
  relationship: RelationshipState;
  impressions: string[];
  photoKey?: string;
  appearance?: RigAppearance;
  legacyPreset?: boolean;
  behavior?: BuddyBehavior;
};
export type FocusSession = {
  id: string;
  buddyId: string;
  duration: number;
  remaining: number;
  endsAt?: number;
  status: 'running' | 'paused' | 'complete';
};
export type FocusRecord = {
  id: string;
  buddyId: string;
  minutes: number;
  at: string;
  feedback?: string;
};
export type Note = {
  id: string;
  title: string;
  transcript: string;
  summary: string;
  highlights: string[];
  actionItems: string[];
  addedActions: number[];
  source?: string;
};
export type AppData = {
  version: 2;
  studyProfile?: StudyProfile;
  legacyPhotoPending?: boolean;
  legacyProfile?: unknown;
  buddies: Buddy[];
  activeBuddyId: string;
  events: ScheduleEvent[];
  campus: CampusDataState;
  settings: {
    muted: boolean;
    reducedMotion: boolean;
    focusMinutes: number;
    showAcademicCalendar?: boolean;
    room?: 'library' | 'classroom';
    fatigueHours?: number;
  };
  focus?: FocusSession;
  focusHistory: FocusRecord[];
  note: Note;
  material: string;
  courseware?: Courseware;
  demo: boolean;
};
export const rewards = [
  {
    id: '昵称「小搭子」',
    threshold: 25,
    title: '专属昵称',
    text: '从今天开始，就叫我「小搭子」吧。',
    animation: 'greet',
  },
  {
    id: '新回应「轻轻敲门」',
    threshold: 25,
    title: '轻轻敲门',
    text: '叩叩，我可以陪你开始今天的第一小步吗？',
    animation: 'think',
  },
  {
    id: '庆祝动作「像素击掌」',
    threshold: 50,
    title: '像素击掌',
    text: '又完成了一小步！伸出手，和我击个掌。',
    animation: 'cheer',
  },
  {
    id: '隐藏问题',
    threshold: 50,
    title: '课间悄悄话',
    text: '如果今天只留一件让自己开心的小事，你想做什么？',
    animation: 'idle',
  },
  {
    id: '特殊欢迎动画',
    threshold: 75,
    title: '等你回来',
    text: '你回来啦。我把旁边的位置一直留着。',
    animation: 'greet',
  },
  {
    id: '知心完成语',
    threshold: 75,
    title: '一起走过的路',
    text: '我记得你每一次开始的勇气。今天也辛苦啦。',
    animation: 'cheer',
  },
] as const;
export function freshRelationship(): RelationshipState {
  return {
    ...initialRelationship,
    bond: 0,
    bondLevel: '初识',
    answeredPromptIds: [],
    dialogueHistory: [],
    preferences: {},
    unlocked: [],
  };
}
export function createBuddy(
  name: string,
  personality: string,
  id = crypto.randomUUID(),
  preset = false,
  style = defaultAvatarStyle,
): Buddy {
  return {
    id,
    name,
    personality,
    preset,
    style: { ...style },
    appearance: { preset: id === 'xiaohe' ? 'female' : 'male', rigVersion: 3 },
    relationship: freshRelationship(),
    behavior: { mode: 'schedule' },
    impressions: [],
  };
}
export function createAppData(): AppData {
  const buddies = [
    createBuddy('小禾', '温柔鼓励', 'xiaohe', true, {
      ...defaultAvatarStyle,
      hairColor: '#554330',
      topColor: '#748b64',
      bottomColor: '#e7ddc7',
      hairStyleId: 'medium',
    }),
    createBuddy('知序', '理性规划', 'zhixu', true, {
      ...defaultAvatarStyle,
      hairColor: '#323b40',
      topColor: '#667f8c',
      bottomColor: '#d8d4c9',
      accessory: 'glasses',
    }),
  ];
  return {
    version: 2,
    studyProfile: { energy: null },
    buddies,
    activeBuddyId: 'xiaohe',
    events: [],
    campus: createInitialCampusData(),
    settings: {
      muted: false,
      room: 'library',
      reducedMotion: false,
      focusMinutes: 25,
      fatigueHours: 6,
      showAcademicCalendar: false,
    },
    focusHistory: [],
    note: {
      id: 'current-note',
      title: '',
      transcript: '',
      summary: '',
      highlights: [],
      actionItems: [],
      addedActions: [],
    },
    material: '',
    demo: false,
  };
}
export function updateBuddy(
  data: AppData,
  id: string,
  update: (buddy: Buddy) => Buddy,
): AppData {
  return {
    ...data,
    buddies: data.buddies.map((buddy) =>
      buddy.id === id ? update(buddy) : buddy,
    ),
  };
}
export function earnBond(
  relationship: RelationshipState,
  delta: number,
): RelationshipState {
  const bond = Math.max(0, Math.round(relationship.bond + delta));
  return {
    ...relationship,
    bond,
    bondLevel: getBondLevel(bond),
    unlocked: [
      ...new Set([
        ...relationship.unlocked,
        ...rewards.filter((r) => bond >= r.threshold).map((r) => r.id),
      ]),
    ],
  };
}
export function remainingSeconds(
  focus: FocusSession,
  now = Date.now(),
): number {
  return focus.status === 'running' && focus.endsAt
    ? Math.max(0, Math.ceil((focus.endsAt - now) / 1000))
    : focus.remaining;
}
export function settleFocus(
  data: AppData,
  now = Date.now(),
  early = false,
): AppData {
  const focus = data.focus;
  if (
    !focus ||
    focus.status === 'complete' ||
    (!early && remainingSeconds(focus, now) > 0)
  )
    return data;
  const seconds = early
    ? focus.duration - remainingSeconds(focus, now)
    : focus.duration;
  if (seconds < 1) return { ...data, focus: undefined };
  const record = {
    id: focus.id,
    buddyId: focus.buddyId,
    minutes: Math.round((seconds / 60) * 10) / 10,
    at: new Date(now).toISOString(),
  };
  const next = {
    ...data,
    focus: {
      ...focus,
      status: 'complete' as const,
      remaining: 0,
      endsAt: undefined,
    },
    focusHistory: data.focusHistory.some((r) => r.id === focus.id)
      ? data.focusHistory
      : [...data.focusHistory, record],
  };
  return data.focusHistory.some((r) => r.id === focus.id)
    ? next
    : updateBuddy(next, focus.buddyId, (b) => ({
        ...b,
        relationship: earnBond(b.relationship, early ? 1 : 3),
      }));
}
export function mergeEvents(
  current: ScheduleEvent[],
  incoming: ScheduleEvent[],
): ScheduleEvent[] {
  const identity = (e: ScheduleEvent) =>
    [
      e.date,
      e.time,
      e.end,
      e.title.trim(),
      e.kind,
      e.location?.trim() ?? '',
    ].join('|');
  const map = new Map(current.map((e) => [identity(e), e]));
  incoming.forEach((e) => {
    if (!map.has(identity(e))) map.set(identity(e), e);
  });
  return [...map.values()];
}
export function validEvent(e: ScheduleEvent): boolean {
  return Boolean(
    e &&
    typeof e.title === 'string' &&
    e.title.trim() &&
    validDate(e.date) &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(e.time) &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(e.end) &&
    e.end > e.time &&
    (e.remindMinutes === undefined ||
      e.remindMinutes === null ||
      (Number.isInteger(e.remindMinutes) &&
        e.remindMinutes >= 0 &&
        e.remindMinutes <= 1440)) &&
    (!e.excludedDates ||
      (Array.isArray(e.excludedDates) && e.excludedDates.every(validDate))) &&
    (!e.repeat ||
      (['daily', 'weekly', 'biweekly', 'monthly', 'yearly', 'custom'].includes(
        e.repeat.kind,
      ) &&
        (!e.repeat.frequency ||
          ['daily', 'weekly', 'monthly', 'yearly'].includes(
            e.repeat.frequency,
          )) &&
        (e.repeat.interval === undefined ||
          (Number.isInteger(e.repeat.interval) &&
            e.repeat.interval >= 1 &&
            e.repeat.interval <= 99)) &&
        (!e.repeat.until ||
          (validDate(e.repeat.until) && e.repeat.until >= e.date!)) &&
        [
          ['weekdays', 7],
          ['monthDays', 31],
          ['months', 12],
        ].every(([key, max]) => {
          const values = e.repeat![key as 'weekdays' | 'monthDays' | 'months'];
          return (
            values === undefined ||
            (Array.isArray(values) &&
              values.length > 0 &&
              values.every(
                (n) => Number.isInteger(n) && n >= 1 && n <= Number(max),
              ))
          );
        }) &&
        (e.repeat.ordinal === undefined ||
          [1, 2, 3, 4, 5, -1, -2].includes(e.repeat.ordinal)) &&
        (e.repeat.dayKind === undefined ||
          ['natural', 'workday', 'weekend', 1, 2, 3, 4, 5, 6, 7].includes(
            e.repeat.dayKind,
          )))) &&
    ['class', 'study', 'meeting', 'personal'].includes(e.kind),
  );
}
export function validDate(value?: string): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && localDate(date) === value;
}
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function validateAppData(value: unknown): AppData {
  if (!value || typeof value !== 'object')
    throw new Error('不是有效的 SBuddy 数据。');
  const data = value as AppData;
  if (data.courseware !== undefined) {
    const c = data.courseware;
    if (
      !c ||
      typeof c.title !== 'string' ||
      c.title.length > 120 ||
      typeof c.material !== 'string' ||
      c.material.length > 50000 ||
      (c.result !== undefined && !validCoursewareResult(c.result)) ||
      (c.source !== undefined && typeof c.source !== 'string') ||
      (c.resultMaterial !== undefined &&
        (typeof c.resultMaterial !== 'string' ||
          c.resultMaterial.length > 50000))
    )
      throw new Error('课件记录无效，未修改现有数据。');
  }
  if (
    data.version !== 2 ||
    !Array.isArray(data.buddies) ||
    !data.buddies.length ||
    data.buddies.length > 100 ||
    !data.settings ||
    !data.campus ||
    !Array.isArray(data.events) ||
    !data.events.every(validEvent) ||
    !Array.isArray(data.focusHistory) ||
    !data.note ||
    typeof data.note.transcript !== 'string' ||
    typeof data.note.title !== 'string' ||
    typeof data.note.summary !== 'string' ||
    !Array.isArray(data.note.highlights) ||
    !data.note.highlights.every((x) => typeof x === 'string') ||
    !Array.isArray(data.note.actionItems) ||
    !data.note.actionItems.every((x) => typeof x === 'string') ||
    !Array.isArray(data.note.addedActions) ||
    typeof data.material !== 'string'
  )
    throw new Error('数据格式不完整或版本不支持，未修改现有记录。');
  const campus = normalizeCampusData(data.campus);
  if (
    data.campus.schemaVersion !== 1 ||
    !validDate(data.campus.semesterStart) ||
    !Array.isArray(data.campus.courses) ||
    !Array.isArray(data.campus.exams) ||
    !Array.isArray(data.campus.todos) ||
    campus.courses.length !== data.campus.courses.length ||
    campus.exams.length !== data.campus.exams.length ||
    campus.todos.length !== data.campus.todos.length ||
    (data.campus.courseSnapshots !== undefined &&
      (!Array.isArray(data.campus.courseSnapshots) ||
        campus.courseSnapshots?.length !==
          data.campus.courseSnapshots.length)) ||
    [...data.campus.courses, ...(data.campus.courseSnapshots ?? [])].some(
      (c) =>
        c.excludedDates !== undefined &&
        (!Array.isArray(c.excludedDates) || !c.excludedDates.every(validDate)),
    ) ||
    data.campus.exams.some((e) => !validDate(e.date)) ||
    data.campus.todos.some(
      (todo) => todo.dueAt && !Number.isFinite(new Date(todo.dueAt).getTime()),
    )
  )
    throw new Error('校园记录不完整或日期无效。');
  if (
    !data.buddies.every(
      (b) =>
        b &&
        typeof b.id === 'string' &&
        typeof b.name === 'string' &&
        b.name.trim() &&
        typeof b.personality === 'string' &&
        b.style &&
        b.relationship &&
        Number.isFinite(b.relationship.bond) &&
        b.relationship.bond >= 0 &&
        b.relationship.preferences &&
        Object.values(b.relationship.preferences).every(
          (v) => typeof v === 'string',
        ) &&
        Array.isArray(b.relationship.dialogueHistory) &&
        b.relationship.dialogueHistory.every(
          (r) =>
            r &&
            typeof r.promptId === 'string' &&
            typeof r.choiceId === 'string' &&
            typeof r.answeredAt === 'string' &&
            Number.isFinite(r.delta),
        ) &&
        Array.isArray(b.impressions) &&
        b.impressions.every((x) => typeof x === 'string'),
    ) ||
    new Set(data.buddies.map((b) => b.id)).size !== data.buddies.length ||
    !data.buddies.some((b) => b.id === data.activeBuddyId)
  )
    throw new Error('搭子记录无效。');
  if (
    data.focus &&
    (!data.buddies.some((b) => b.id === data.focus?.buddyId) ||
      !['running', 'paused', 'complete'].includes(data.focus.status) ||
      !Number.isFinite(data.focus.duration) ||
      data.focus.duration <= 0 ||
      !Number.isFinite(data.focus.remaining) ||
      data.focus.remaining < 0 ||
      data.focus.remaining > data.focus.duration ||
      typeof data.focus.id !== 'string' ||
      (data.focus.status === 'running' && !Number.isFinite(data.focus.endsAt)))
  )
    throw new Error('专注会话无效。');
  if (
    !data.focusHistory.every(
      (r) =>
        r &&
        typeof r.id === 'string' &&
        typeof r.buddyId === 'string' &&
        Number.isFinite(r.minutes) &&
        r.minutes >= 0 &&
        typeof r.at === 'string',
    )
  )
    throw new Error('专注记录无效。');
  if (
    data.buddies.some(
      (b) =>
        b.appearance?.rigVersion !== undefined &&
        b.appearance.rigVersion !== 1 &&
        b.appearance.rigVersion !== 2 &&
        b.appearance.rigVersion !== 3 &&
        b.appearance.rigVersion !== 4,
    )
  )
    throw new Error('人物素材版本不受支持，原数据已保留。');
  if (
    data.buddies.some(
      (b) =>
        b.appearance?.rigVersion === 4 &&
        (typeof b.appearance.atlasKey !== 'string' ||
          !b.appearance.atlasKey.trim()),
    )
  )
    throw new Error('静态人物素材引用缺失，原数据已保留。');
  return {
    ...data,
    campus: normalizeCampusData(data.campus),
    studyProfile: normalizeStudyProfile(
      data.studyProfile ?? data.legacyProfile,
    ),
    settings: {
      muted: !!data.settings.muted,
      showAcademicCalendar: data.settings.showAcademicCalendar === true,
      room: data.settings.room === 'classroom' ? 'classroom' : 'library',
      fatigueHours: Number.isFinite(data.settings.fatigueHours)
        ? Math.max(1, Math.min(24, data.settings.fatigueHours!))
        : 6,
      reducedMotion: !!data.settings.reducedMotion,
      focusMinutes: Math.max(
        1,
        Math.min(180, Number(data.settings.focusMinutes) || 25),
      ),
    },
    buddies: data.buddies.map((b) => ({
      ...b,
      ...(b.id === 'xiangyang' && b.preset
        ? { preset: false, legacyPreset: true }
        : {}),
      appearance: {
        rigVersion: !b.appearance?.atlasKey
          ? 3
          : b.appearance.rigVersion === 4
            ? 4
            : b.appearance.rigVersion === 3
              ? 3
              : b.appearance.rigVersion === 2
                ? 2
                : 1,
        ...(b.appearance?.rigVersion === 3 && b.appearance.atlasKey
          ? {
              spriteManifest: validateSpriteManifest(
                b.appearance.spriteManifest,
              ),
            }
          : {}),
        preset:
          b.appearance?.preset === 'female' ||
          (!b.appearance && b.id === 'xiaohe')
            ? 'female'
            : 'male',
        ...(typeof b.appearance?.atlasKey === 'string'
          ? { atlasKey: b.appearance.atlasKey }
          : {}),
        ...(b.appearance?.photoMode === 'full-body' ||
        b.appearance?.photoMode === 'head-only'
          ? { photoMode: b.appearance.photoMode }
          : {}),
      },
      name: b.name.slice(0, 24),
      style: normalizeAvatarStyle(b.style),
      relationship: normalizeRelationship(b.relationship),
      behavior: normalizeBehavior(b.behavior),
    })),
  };
}
export function migrateLegacy(read: (key: string) => string | null): AppData {
  const data = createAppData();
  const json = (key: string) => {
    const value = read(key);
    return value ? JSON.parse(value) : undefined;
  };
  const relationship = json('study-buddies-relationship');
  const style = json('study-buddies-avatar-style');
  data.legacyPhotoPending = Boolean(read('study-buddies-avatar'));
  if (relationship)
    data.buddies[0].relationship = normalizeRelationship(relationship);
  if (style) data.buddies[0].style = normalizeAvatarStyle(style);
  const campus = json('study-buddies-campus-data');
  if (campus) data.campus = normalizeCampusData(campus);
  const events = json('study-buddies-events');
  if (Array.isArray(events))
    data.events = events
      .map((e) => ({
        ...e,
        date: e.date ?? `2026-09-${String(e.day).padStart(2, '0')}`,
      }))
      .filter(validEvent);
  const profile = json('study-buddies-profile');
  if (profile) {
    data.legacyProfile = profile;
    data.studyProfile = normalizeStudyProfile(profile);
    if (Array.isArray(profile.focusHistory))
      data.focusHistory = profile.focusHistory
        .filter(
          (record: { minutes?: number }) =>
            typeof record.minutes === 'number' && record.minutes > 0,
        )
        .map(
          (
            record: { date: string; minutes: number; feedback?: string },
            index: number,
          ) => {
            const parts = record.date?.match(/^(\d{1,2})\/(\d{1,2})$/);
            const at = parts
              ? new Date(2026, Number(parts[1]) - 1, Number(parts[2]), 12)
              : new Date();
            return {
              id: 'legacy-focus-' + index,
              buddyId: 'xiaohe',
              minutes: record.minutes,
              at: at.toISOString(),
              feedback: record.feedback,
            };
          },
        );
  }
  data.settings.muted = read('study-buddies-sound-muted') === 'true';
  return data;
}
