import type { AnimationState } from './companion-animation';
import type { ScheduleEvent } from './schedule-parser';
import type { AppData } from './sbuddy-state';
import { eventsForDays } from './calendar-layout';
import { campusScheduleEvents } from './campus-data';
import { eventRewardKey, type ManualSession } from './bond-scoring';

export type DeskActivity = 'study' | 'class' | 'meeting';
export type BuddyBehavior = {
  mode: 'schedule' | 'manual';
  activity?: DeskActivity;
  lastInteractionAt?: number;
  manualSession?: ManualSession;
};
export const GREETING_GAP_MS = 60 * 60 * 1000;
export function normalizeBehavior(
  value?: Partial<BuddyBehavior>,
): BuddyBehavior {
  return {
    ...(value?.manualSession ? { manualSession: value.manualSession } : {}),
    mode: value?.mode === 'manual' ? 'manual' : 'schedule',
    activity: ['study', 'class', 'meeting'].includes(value?.activity ?? '')
      ? value?.activity
      : undefined,
    lastInteractionAt:
      Number.isFinite(value?.lastInteractionAt) &&
      value!.lastInteractionAt! >= 0
        ? value?.lastInteractionAt
        : undefined,
  };
}
export function needsGreeting(last: number | undefined, now: number) {
  return last === undefined || now - last >= GREETING_GAP_MS || last > now;
}
export function clickDesk(behavior: BuddyBehavior, activity: DeskActivity) {
  const completed =
    behavior.mode === 'manual' && behavior.activity === activity;
  return {
    completed,
    behavior: {
      ...behavior,
      mode: 'manual' as const,
      activity: completed ? undefined : activity,
    },
  };
}
export function scheduleLoadMinutes(
  events: ScheduleEvent[],
  now: Date,
): number {
  const date = localDay(now);
  const spans = events
    .filter(
      (e) => e.date === date && ['study', 'class', 'meeting'].includes(e.kind),
    )
    .map((e) => [minutes(e.time), minutes(e.end)])
    .filter(([start, end]) => Number.isFinite(start) && end > start)
    .sort((a, b) => a[0] - b[0]);
  let total = 0,
    end = 0;
  for (const [start, next] of spans) {
    total += Math.max(0, next - Math.max(start, end));
    end = Math.max(end, next);
  }
  return total;
}
function minutes(value: string) {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}
function localDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function resolveBehavior(input: {
  behavior: BuddyBehavior;
  schedule: AnimationState;
  tired: boolean;
  paused: boolean;
  question: boolean;
  short?: 'greet' | 'cheer';
}): AnimationState {
  if (input.paused) return 'away';
  if (input.short === 'greet') return 'greet';
  if (input.question) return 'think';
  if (input.short) return input.short;
  const target =
    input.behavior.mode === 'manual'
      ? (input.behavior.activity ?? 'idle')
      : input.schedule;
  return target === 'idle' && input.tired ? 'tired' : target;
}

export type Completion = { id: string; buddyId?: string; rewardKey?: string };
export type CompletionSnapshot = {
  at: number;
  todos: Map<string, string | undefined>;
  events: Map<string, number>;
  focus?: AppData['focus'];
  records: Set<string>;
};
/** Watch unchanged records crossing an end boundary, never infer completion from removal. */
export function completionSnapshot(
  data: AppData,
  at: number,
): CompletionSnapshot {
  const today = new Date(at),
    yesterday = new Date(at);
  yesterday.setDate(yesterday.getDate() - 1);
  const events = [
    ...eventsForDays(data.events, [yesterday, today]),
    ...campusScheduleEvents(data.campus),
  ];
  return {
    at,
    todos: new Map(
      data.campus.todos.map((t) => [
        JSON.stringify([t.id, t.title, t.dueAt]),
        t.completedAt,
      ]),
    ),
    events: new Map(
      events
        .filter((e) => e.source !== 'campus-todo')
        .map((e) => [
          JSON.stringify(e),
          new Date(`${e.date}T${e.end}:00`).getTime(),
        ]),
    ),
    focus: data.focus,
    records: new Set(data.focusHistory.map((r) => r.id)),
  };
}
export function detectCompletions(
  before: CompletionSnapshot,
  after: CompletionSnapshot,
): Completion[] {
  const result: Completion[] = [];
  for (const [key, ended] of after.todos)
    if (
      before.todos.has(key) &&
      !before.todos.get(key) &&
      ended &&
      new Date(ended).getTime() >= before.at - 1000
    )
      result.push({ id: `todo:${key}` });
  for (const [key, end] of before.events)
    if (after.events.has(key) && before.at < end && end <= after.at) {
      const event = JSON.parse(key) as ScheduleEvent;
      const rewardKey = eventRewardKey(event);
      result.push({
        id: rewardKey,
        ...(event.source !== 'campus-exam' ? { rewardKey } : {}),
      });
    }
  const focus = before.focus;
  if (
    focus &&
    focus.status !== 'complete' &&
    !before.records.has(focus.id) &&
    after.records.has(focus.id)
  )
    result.push({ id: `focus:${focus.id}`, buddyId: focus.buddyId });
  return result;
}

export const DESK_OBJECTS: {
  activity: DeskActivity;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}[] = [
  { activity: 'study', label: '电子钟：自习', x: -92, y: 379, w: 68, h: 44 },
  { activity: 'class', label: '书本与纸笔：上课', x: 0, y: 379, w: 68, h: 44 },
  { activity: 'meeting', label: '电脑：开会', x: 92, y: 377, w: 72, h: 48 },
];
