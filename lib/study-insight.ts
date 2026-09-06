import type { AppData } from './sbuddy-state';
import type { ScheduleEvent } from './schedule-parser';

export type StudyProfile = { energy: number | null; updatedAt?: string };

export function normalizeStudyProfile(value: unknown): StudyProfile {
  const profile = value as Partial<StudyProfile> | undefined;
  return {
    energy:
      typeof profile?.energy === 'number' && Number.isFinite(profile.energy)
        ? Math.max(1, Math.min(5, Math.round(profile.energy)))
        : null,
    ...(typeof profile?.updatedAt === 'string' &&
    Number.isFinite(Date.parse(profile.updatedAt))
      ? { updatedAt: profile.updatedAt }
      : {}),
  };
}

const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export function studyInsight(
  data: AppData,
  events: ScheduleEvent[],
  now = new Date(),
) {
  const today = dateKey(now);
  const todayEvents = events.filter((event) => event.date === today);
  const toMinutes = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };
  const scheduledMinutes = todayEvents.reduce(
    (sum, event) =>
      sum + Math.max(0, toMinutes(event.end) - toMinutes(event.time)),
    0,
  );
  const pressureScore = Math.min(
    100,
    todayEvents.length * 14 + Math.round(scheduledMinutes / 30),
  );
  const energy = normalizeStudyProfile(data.studyProfile).energy;
  const next = todayEvents
    .slice()
    .sort((a, b) => a.time.localeCompare(b.time))
    .find(
      (event) => toMinutes(event.end) > now.getHours() * 60 + now.getMinutes(),
    );
  const target = next?.title;
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const recent = data.focusHistory.filter((record) => {
    const date = new Date(record.at);
    return record.minutes > 0 && date >= cutoff && date < end;
  });
  const days = new Set(
    data.focusHistory
      .filter((r) => r.minutes > 0 && Number.isFinite(Date.parse(r.at)))
      .map((r) => dateKey(new Date(r.at))),
  );
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!days.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(dateKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return {
    energy,
    energyLabel:
      energy === null
        ? '尚未记录'
        : energy <= 2
          ? '有些疲惫'
          : energy === 3
            ? '状态平稳'
            : '精力充足',
    pressure:
      pressureScore >= 72 ? '偏高' : pressureScore >= 48 ? '中等' : '轻松',
    count: todayEvents.length,
    scheduledMinutes,
    suggestion:
      energy !== null && energy <= 2
        ? '先休息一下，再用 10 分钟开始眼前的一小步。'
        : target
          ? next.kind === 'meeting'
            ? `先花 10 分钟写下「${target}」的 3 个讨论点。`
            : next.kind === 'class'
              ? `先用 10 分钟预览「${target}」的目录或课件。`
              : `先用 10 分钟开始「${target}」，不用一次做完。`
          : '选一件现在想做的小事，先陪你专注 10 分钟。',
    recentMinutes:
      Math.round(recent.reduce((sum, r) => sum + r.minutes, 0) * 10) / 10,
    recentCount: recent.length,
    recentDays: new Set(recent.map((r) => dateKey(new Date(r.at)))).size,
    streak,
  };
}
