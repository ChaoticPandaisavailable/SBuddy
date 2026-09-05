import type { EventKind, ScheduleEvent } from '@/lib/schedule-parser';

export type CompanionMode = 'idle' | 'class' | 'study' | 'meeting';

export type ScheduleSnapshot = {
  today: number;
  todayEvents: ScheduleEvent[];
  currentEvent?: ScheduleEvent;
  nextEvent?: ScheduleEvent;
  mode: CompanionMode;
};

export const CALENDAR_YEAR = 2026;
export const CALENDAR_MONTH_INDEX = 8;

export function getScheduleSnapshot(
  events: ScheduleEvent[],
  now: Date,
): ScheduleSnapshot {
  const today = now.getDate();
  const todayKey = dateKey(now);
  const nowMinute = now.getHours() * 60 + now.getMinutes();
  const sorted = [...events].sort(compareEvents);
  const todayEvents = sorted.filter((event) => eventDateKey(event) === todayKey);
  const currentEvent = todayEvents.find((event) => {
    const start = timeToMinutes(event.time);
    const end = timeToMinutes(event.end);
    return start <= nowMinute && nowMinute < end;
  });
  const nextEvent = sorted.find((event) => eventStart(event).getTime() > now.getTime());

  return {
    today,
    todayEvents,
    currentEvent,
    nextEvent,
    mode: currentEvent ? kindToMode(currentEvent.kind) : 'idle',
  };
}

export function kindToMode(kind: EventKind): CompanionMode {
  if (kind === 'class' || kind === 'study' || kind === 'meeting') return kind;
  return 'idle';
}

export function formatEventLine(event?: ScheduleEvent): string {
  if (!event) return '今天暂时没有更多安排';
  const location = event.location ? ` · ${event.location}` : '';
  return `${event.title} · ${event.time}–${event.end}${location}`;
}

function compareEvents(a: ScheduleEvent, b: ScheduleEvent): number {
  const byDate = eventDateKey(a).localeCompare(eventDateKey(b));
  if (byDate !== 0) return byDate;
  return a.time.localeCompare(b.time);
}

function eventDateKey(event: ScheduleEvent): string {
  return event.date ?? '';
}

function eventStart(event: ScheduleEvent): Date {
  const [year, month, day] = eventDateKey(event).split('-').map(Number);
  const [hour, minute] = event.time.split(':').map(Number);
  return new Date(year, month - 1, day, hour || 0, minute || 0);
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function timeToMinutes(value: string): number {
  const [hours = '0', minutes = '0'] = value.split(':');
  return Number(hours) * 60 + Number(minutes);
}

