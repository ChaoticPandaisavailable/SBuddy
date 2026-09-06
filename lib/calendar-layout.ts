import {
  dateString,
  type ScheduleEvent,
  type EventRepeat,
} from './schedule-parser';
import type { CampusTodo } from './campus-data';
import academicCalendar from './academic-calendar.json';

export function academicForDay(date: string) {
  return academicCalendar.events.filter(
    (e) => date >= e.date && date <= (e.end_date ?? e.date),
  );
}
export function academicHeading(date: string) {
  const semester = academicCalendar.semesters.find(
    (s) => date >= s.start && date <= s.end,
  );
  return semester
    ? `第 ${Math.floor((dayIndex(calendarDate(date)) - dayIndex(calendarDate(semester.week1_monday))) / 7) + 1} 周`
    : '学期外';
}
export function courseBlockColor(title: string) {
  const palette = [
    '#5f6f52',
    '#6b5a67',
    '#4f6272',
    '#6a5344',
    '#3f5e5a',
    '#5a4e72',
  ];
  let hash = 0;
  for (const char of title) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}

export function calendarReminders(
  events: ScheduleEvent[],
  todos: CampusTodo[],
  now: number,
) {
  const days = Array.from(
    { length: 3 },
    (_, i) => new Date(now + i * 86400000),
  );
  const notices: { id: string; title: string; at: number }[] = [];
  for (const todo of todos)
    if (!todo.completedAt) {
      for (const time of todo.reminderTimes)
        notices.push({
          id: `todo:${todo.id}:${time}`,
          title: todo.title,
          at: new Date(time).getTime(),
        });
    }
  for (const event of eventsForDays(events, days)) {
    // An absent field in old data never silently schedules a new reminder.
    if (event.remindMinutes === null || event.remindMinutes === undefined)
      continue;
    const at =
      new Date(`${event.date}T${event.time}:00`).getTime() -
      event.remindMinutes * 60000;
    notices.push({
      id: `event:${event.id}:${event.date}`,
      title: event.title,
      at,
    });
  }
  return notices.filter((n) => n.at <= now && n.at > now - 60000);
}

export const calendarDate = (key: string) => new Date(key + 'T12:00:00');
const dayIndex = (date: Date) =>
  Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
export const weekday = (date: Date) => date.getDay() || 7;
export function monthDays(anchor: Date) {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12);
  start.setDate(start.getDate() - start.getDay());
  const count =
    Math.ceil(
      (new Date(anchor.getFullYear(), anchor.getMonth(), 1).getDay() +
        new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate()) /
        7,
    ) * 7;
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}
export function weekDays(anchor: Date) {
  const start = new Date(anchor);
  start.setDate(start.getDate() - weekday(start) + 1);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}
export function moveMonth(anchor: Date, delta: number) {
  return new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1, 12);
}
function matchesMonthDay(d: Date, origin: Date, rule: EventRepeat) {
  if (rule.ordinal !== undefined) {
    const matches = Array.from(
      { length: new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() },
      (_, i) => new Date(d.getFullYear(), d.getMonth(), i + 1, 12),
    ).filter((day) =>
      rule.dayKind === 'workday'
        ? weekday(day) <= 5
        : rule.dayKind === 'weekend'
          ? weekday(day) >= 6
          : typeof rule.dayKind === 'number'
            ? weekday(day) === rule.dayKind
            : true,
    );
    return (
      matches[
        rule.ordinal < 0 ? matches.length + rule.ordinal : rule.ordinal - 1
      ]?.getDate() === d.getDate()
    );
  }
  return (
    rule.monthDays?.length ? rule.monthDays : [origin.getDate()]
  ).includes(d.getDate());
}
export function occursOn(event: ScheduleEvent, key: string): boolean {
  if (!event.date || key < event.date || event.excludedDates?.includes(key))
    return false;
  const rule = event.repeat;
  if (!rule) return key === event.date;
  if (rule.until && key > rule.until) return false;
  const origin = calendarDate(event.date),
    d = calendarDate(key);
  const delta = dayIndex(d) - dayIndex(origin);
  const frequency =
    rule.kind === 'custom'
      ? (rule.frequency ?? 'weekly')
      : rule.kind === 'biweekly'
        ? 'weekly'
        : rule.kind;
  const interval =
    rule.kind === 'biweekly'
      ? 2
      : rule.kind === 'custom'
        ? (rule.interval ?? 1)
        : 1;
  if (frequency === 'daily') return delta % interval === 0;
  if (frequency === 'weekly') {
    const weeks = Math.floor((delta + weekday(origin) - 1) / 7);
    return (
      weeks % interval === 0 &&
      (rule.weekdays?.length ? rule.weekdays : [weekday(origin)]).includes(
        weekday(d),
      )
    );
  }
  const months =
    (d.getFullYear() - origin.getFullYear()) * 12 +
    d.getMonth() -
    origin.getMonth();
  if (frequency === 'monthly')
    return months % interval === 0 && matchesMonthDay(d, origin, rule);
  return (
    (d.getFullYear() - origin.getFullYear()) % interval === 0 &&
    (rule.months?.length ? rule.months : [origin.getMonth() + 1]).includes(
      d.getMonth() + 1,
    ) &&
    matchesMonthDay(d, origin, rule)
  );
}
export function eventsForDays(events: ScheduleEvent[], days: Date[]) {
  return days.flatMap((d) => {
    const date = dateString(d);
    return events
      .filter((e) => occursOn(e, date))
      .map((e) => ({ ...e, date, day: d.getDate() }));
  });
}
export const minutes = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
export const slots = [
  [480, 570],
  [600, 690],
  [720, 810],
  [840, 930],
  [960, 1050],
  [1080, 1170],
  [1180, 1270],
];
// The reference compresses each lesson to 60 units and the two off-hours bands to 16.
export const visualEnd = 612;
export function weekY(time: number) {
  if (time <= 480) return (Math.max(0, time) / 480) * 16;
  let y = 16;
  for (let i = 0; i < slots.length; i++) {
    const [start, end] = slots[i];
    if (time <= end) return y + ((time - start) / (end - start)) * 60;
    y += 60;
    const next = slots[i + 1]?.[0];
    if (next) {
      if (time < next) return y + time - end;
      y += next - end;
    }
  }
  return y + (Math.min(170, time - 1270) / 170) * 16;
}
export function packEvents(events: ScheduleEvent[]) {
  const sorted = events
    .filter((e) => e.source !== 'campus-todo')
    .map((event) => ({
      event,
      start: minutes(event.time),
      end: minutes(event.end),
      column: 0,
      columns: 1,
    }))
    .sort((a, b) => a.start - b.start || b.end - a.end);
  let group: typeof sorted = [],
    end = -1;
  const flush = () => {
    const count = Math.max(1, ...group.map((e) => e.column + 1));
    group.forEach((e) => (e.columns = count));
    group = [];
  };
  for (const item of sorted) {
    if (item.start >= end) {
      flush();
      end = -1;
    }
    const used = new Set(
      group.filter((e) => e.end > item.start).map((e) => e.column),
    );
    while (used.has(item.column)) item.column++;
    group.push(item);
    end = Math.max(end, item.end);
  }
  flush();
  return sorted;
}
export const eventLabel = (event: ScheduleEvent) =>
  event.source === 'campus-todo'
    ? '待办'
    : event.source === 'campus-exam'
      ? '考试'
      : event.kind === 'class'
        ? '课程'
        : '活动';
export const eventColor = (event: ScheduleEvent) =>
  ({ 待办: '#7c3aed', 考试: '#b45309', 课程: '#1d4ed8', 活动: '#d0a600' })[
    eventLabel(event)
  ];
