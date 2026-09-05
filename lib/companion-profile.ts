import type { ScheduleEvent } from '@/lib/schedule-parser';

export type FocusFeedback = 'tired' | 'steady' | 'ready';

export type FocusRecord = {
  date: string;
  minutes: number;
  feedback: FocusFeedback;
};

export type CompanionProfile = {
  energy: number;
  focusStreak: number;
  focusHistory: FocusRecord[];
};

export type DailyInsight = {
  pressure: '轻松' | '中等' | '偏高';
  pressureScore: number;
  parallelTasks: number;
  energyLabel: '低电量' | '状态一般' | '精力充足';
  energyScore: number;
  reason: string;
  tinyStep: string;
};

export const initialProfile: CompanionProfile = {
  energy: 2,
  focusStreak: 3,
  focusHistory: [
    { date: '8/27', minutes: 25, feedback: 'steady' },
    { date: '8/28', minutes: 15, feedback: 'tired' },
    { date: '8/29', minutes: 30, feedback: 'ready' },
    { date: '8/30', minutes: 0, feedback: 'tired' },
    { date: '8/31', minutes: 20, feedback: 'steady' },
    { date: '9/1', minutes: 35, feedback: 'steady' },
    { date: '今天', minutes: 10, feedback: 'tired' },
  ],
};

export function getDailyInsight(
  events: ScheduleEvent[],
  today: Date,
  profile: CompanionProfile,
  nextEvent?: ScheduleEvent,
): DailyInsight {
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const todayEvents = events.filter((event) => event.date ? event.date === todayKey : event.day === today.getDate());
  const scheduledMinutes = todayEvents.reduce(
    (sum, event) => sum + Math.max(0, toMinutes(event.end) - toMinutes(event.time)),
    0,
  );
  const parallelTasks = todayEvents.length;
  const pressureScore = Math.min(100, 28 + parallelTasks * 14 + Math.round(scheduledMinutes / 30));
  const pressure = pressureScore >= 72 ? '偏高' : pressureScore >= 48 ? '中等' : '轻松';
  const energyScore = Math.min(5, Math.max(1, profile.energy));
  const energyLabel = energyScore <= 2 ? '低电量' : energyScore === 3 ? '状态一般' : '精力充足';
  const target = nextEvent?.title ?? todayEvents[0]?.title ?? '今天最重要的任务';
  const tinyStep = nextEvent?.kind === 'meeting'
    ? `先用 10 分钟写下「${target}」的 3 个讨论点`
    : nextEvent?.kind === 'class'
      ? `先用 10 分钟预览「${target}」的标题与目录`
      : `先用 10 分钟只做「${target}」的第一小步`;

  return {
    pressure,
    pressureScore,
    parallelTasks,
    energyLabel,
    energyScore,
    reason: `今天有 ${parallelTasks} 项并行安排，预计占用 ${formatDuration(scheduledMinutes)}；结合近 7 天反馈，你通常在低电量时更适合短启动。`,
    tinyStep,
  };
}

export function recordFocusFeedback(
  profile: CompanionProfile,
  feedback: FocusFeedback,
  minutes = 10,
): CompanionProfile {
  const energyDelta = feedback === 'tired' ? -1 : feedback === 'ready' ? 1 : 0;
  const nextHistory = [
    ...profile.focusHistory.filter((record) => record.date !== '今天'),
    { date: '今天', minutes, feedback },
  ].slice(-7);
  return {
    energy: Math.min(5, Math.max(1, profile.energy + energyDelta)),
    focusStreak: profile.focusStreak + 1,
    focusHistory: nextHistory,
  };
}

function toMinutes(value: string): number {
  const [hours = '0', minutes = '0'] = value.split(':');
  return Number(hours) * 60 + Number(minutes);
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}
