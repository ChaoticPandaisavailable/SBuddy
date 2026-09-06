import type { ScheduleEvent } from '@/lib/schedule-parser';

export type CampusDataSource = 'shuzhi' | 'manual';

export type CampusCourse = {
  excludedDates?: string[];
  id: string;
  semester: string;
  courseName: string;
  teacher?: string;
  location?: string;
  weekday: number;
  periods: number[];
  weeks: number[];
  startMinutes: number;
  endMinutes: number;
  raw?: string;
  source: CampusDataSource;
};

export type CampusExam = {
  id: string;
  courseName: string;
  date: string;
  time: string;
  location?: string;
  source: CampusDataSource;
};

export type CampusTodo = {
  id: string;
  title: string;
  location?: string;
  dueAt?: string;
  reminderTimes: string[];
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type CampusDataState = {
  schemaVersion: 1;
  semesterStart: string;
  activeSemester: string;
  courses: CampusCourse[];
  courseSnapshots?: CampusCourse[];
  exams: CampusExam[];
  todos: CampusTodo[];
  lastSyncAt?: string;
};

export const CAMPUS_STORAGE_KEY = 'study-buddies-campus-data';

const periodStarts: Record<number, number> = {
  1: 8 * 60,
  2: 8 * 60 + 45,
  3: 10 * 60,
  4: 10 * 60 + 45,
  5: 12 * 60,
  6: 12 * 60 + 45,
  7: 14 * 60,
  8: 14 * 60 + 45,
  9: 16 * 60,
  10: 16 * 60 + 45,
  11: 18 * 60,
  12: 18 * 60 + 45,
  13: 19 * 60 + 40,
  14: 20 * 60 + 25,
};

export function createInitialCampusData(now = new Date()): CampusDataState {
  const monday = startOfWeek(now);
  return {
    schemaVersion: 1,
    semesterStart: dateKey(monday),
    activeSemester: semesterCode(now),
    courses: [],
    exams: [],
    todos: [],
  };
}

export function normalizeCampusData(
  value: Partial<CampusDataState> | undefined,
): CampusDataState {
  const fallback = createInitialCampusData();
  if (!value || value.schemaVersion !== 1) return fallback;
  return {
    schemaVersion: 1,
    semesterStart: validDateKey(value.semesterStart)
      ? value.semesterStart!
      : fallback.semesterStart,
    activeSemester: value.activeSemester?.trim() || fallback.activeSemester,
    courses: Array.isArray(value.courses)
      ? value.courses.filter(validCourse).map(normalizeCourse)
      : [],
    courseSnapshots: Array.isArray(value.courseSnapshots)
      ? value.courseSnapshots.filter(validCourse).map(normalizeCourse)
      : undefined,
    exams: Array.isArray(value.exams)
      ? value.exams.filter(validExam).map(normalizeExam)
      : [],
    todos: Array.isArray(value.todos)
      ? value.todos.filter(validTodo).map(normalizeTodo)
      : [],
    lastSyncAt:
      typeof value.lastSyncAt === 'string' ? value.lastSyncAt : undefined,
  };
}

export function mergeCampusCapture(
  state: CampusDataState,
  capture: {
    courses?: CampusCourse[];
    exams?: CampusExam[];
    semester?: string;
  },
): CampusDataState {
  const incomingSemester = capture.semester?.trim() || state.activeSemester;
  const incomingCourses = capture.courses?.map((course) => ({
    ...course,
    semester: course.semester.trim() || incomingSemester,
  }));
  const nextCourses = incomingCourses?.length
    ? [
        ...state.courses.filter(
          (course) =>
            course.source !== incomingCourses[0].source ||
            course.semester !== incomingSemester,
        ),
        ...uniqueRows(incomingCourses, courseIdentity),
      ]
    : state.courses;
  const nextExams = capture.exams?.length
    ? replaceSourceRows(
        state.exams,
        capture.exams,
        capture.exams[0].source,
        examIdentity,
      )
    : state.exams;
  return {
    ...state,
    activeSemester: incomingSemester,
    courses: nextCourses,
    courseSnapshots: incomingCourses?.length
      ? [
          ...(state.courseSnapshots ?? state.courses).filter(
            (c) =>
              c.source !== incomingCourses[0].source ||
              c.semester !== incomingSemester,
          ),
          ...uniqueRows(incomingCourses, courseIdentity),
        ]
      : state.courseSnapshots,
    exams: nextExams,
    lastSyncAt: new Date().toISOString(),
  };
}

export function upsertCourse(
  state: CampusDataState,
  course: CampusCourse,
): CampusDataState {
  return {
    ...state,
    courses: upsert(state.courses, course, (item) => item.id),
  };
}

export function upsertExam(
  state: CampusDataState,
  exam: CampusExam,
): CampusDataState {
  return { ...state, exams: upsert(state.exams, exam, (item) => item.id) };
}

export function upsertTodo(
  state: CampusDataState,
  todo: CampusTodo,
): CampusDataState {
  return { ...state, todos: upsert(state.todos, todo, (item) => item.id) };
}

export function removeCampusItem(
  state: CampusDataState,
  kind: 'course' | 'exam' | 'todo',
  id: string,
): CampusDataState {
  if (kind === 'course')
    return {
      ...state,
      courses: state.courses.filter((item) => item.id !== id),
    };
  if (kind === 'exam')
    return { ...state, exams: state.exams.filter((item) => item.id !== id) };
  return { ...state, todos: state.todos.filter((item) => item.id !== id) };
}

export function campusScheduleEvents(state: CampusDataState): ScheduleEvent[] {
  const events: ScheduleEvent[] = [];
  const semesterStart = parseLocalDate(state.semesterStart);
  if (semesterStart) {
    for (const course of state.courses) {
      for (const week of course.weeks.length
        ? course.weeks
        : Array.from({ length: 20 }, (_, index) => index + 1)) {
        const date = addDays(
          semesterStart,
          (week - 1) * 7 + clamp(course.weekday, 1, 7) - 1,
        );
        if (course.excludedDates?.includes(dateKey(date))) continue;
        events.push({
          id: `campus-course-${course.id}-${week}`,
          day: date.getDate(),
          date: dateKey(date),
          time: minutesLabel(course.startMinutes),
          end: minutesLabel(course.endMinutes),
          title: course.courseName,
          kind: 'class',
          location: course.location,
          source: 'campus-course',
        });
      }
    }
  }
  for (const exam of state.exams) {
    const [start = '09:00', end = addHour(start)] = exam.time.split(
      /\s*[-–—~至到]\s*/,
    );
    const parsed = parseLocalDate(exam.date);
    if (!parsed) continue;
    events.push({
      id: `campus-exam-${exam.id}`,
      day: parsed.getDate(),
      date: exam.date,
      time: normalizeClock(start),
      end: normalizeClock(end),
      title: `${exam.courseName}考试`,
      kind: 'study',
      location: exam.location,
      source: 'campus-exam',
    });
  }
  for (const todo of state.todos) {
    if (todo.completedAt || !todo.dueAt) continue;
    const due = new Date(todo.dueAt);
    if (Number.isNaN(due.getTime())) continue;
    const start = `${two(due.getHours())}:${two(due.getMinutes())}`;
    events.push({
      id: `campus-todo-${todo.id}`,
      day: due.getDate(),
      date: dateKey(due),
      time: start,
      end: addHour(start),
      title: todo.title,
      kind: 'study',
      location: todo.location,
      source: 'campus-todo',
    });
  }
  return events;
}

export function periodSpan(periods: number[]): [number, number] {
  const ordered = [
    ...new Set(periods.filter((period) => period >= 1 && period <= 14)),
  ].sort((a, b) => a - b);
  if (!ordered.length) return [8 * 60, 9 * 60 + 30];
  const start = periodStarts[ordered[0]] ?? 8 * 60;
  if (
    ordered.length >= 3 &&
    ordered.every(
      (value, index) => index === 0 || value === ordered[index - 1] + 1,
    )
  ) {
    return [start, start + (ordered.length >= 4 ? 190 : 145)];
  }
  const lastStart = periodStarts[ordered.at(-1)!] ?? start;
  return [start, lastStart + 45];
}

export function newCampusId(prefix: string): string {
  const suffix =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${suffix}`;
}

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

export function minutesLabel(value: number): string {
  const normalized = clamp(Math.round(value), 0, 24 * 60 - 1);
  return `${two(Math.floor(normalized / 60))}:${two(normalized % 60)}`;
}

export function parseLocalDate(value: string | undefined): Date | undefined {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function semesterCode(date: Date): string {
  const year =
    date.getMonth() >= 7 ? date.getFullYear() : date.getFullYear() - 1;
  const term = date.getMonth() >= 7 || date.getMonth() === 0 ? 1 : 2;
  return `${year}-${year + 1}-${term}`;
}

function startOfWeek(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = result.getDay() || 7;
  result.setDate(result.getDate() - weekday + 1);
  return result;
}

function addDays(date: Date, amount: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function addHour(value: string): string {
  const match = value.match(/(\d{1,2}):(\d{2})/);
  if (!match) return '10:00';
  return minutesLabel(Number(match[1]) * 60 + Number(match[2]) + 60);
}

function normalizeClock(value: string): string {
  const match = value.match(/(\d{1,2})[:：](\d{1,2})/);
  return match ? `${two(Number(match[1]))}:${two(Number(match[2]))}` : '09:00';
}

function replaceSourceRows<T extends { source: CampusDataSource }>(
  current: T[],
  incoming: T[],
  source: CampusDataSource,
  identity: (item: T) => string,
): T[] {
  const retained = current.filter((item) => item.source !== source);
  const seen = new Set<string>();
  return [
    ...retained,
    ...incoming.filter((item) => {
      const key = identity(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  ];
}

function uniqueRows<T>(items: T[], identity: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = identity(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function upsert<T>(items: T[], next: T, key: (item: T) => string): T[] {
  const index = items.findIndex((item) => key(item) === key(next));
  if (index < 0) return [...items, next];
  const result = [...items];
  result[index] = next;
  return result;
}

function courseIdentity(course: CampusCourse): string {
  return `${course.semester}|${course.courseName}|${course.weekday}|${course.periods.join(',')}|${course.weeks.join(',')}`;
}

function examIdentity(exam: CampusExam): string {
  return `${exam.courseName}|${exam.date}|${exam.time}`;
}

function validCourse(value: unknown): value is CampusCourse {
  if (!value || typeof value !== 'object') return false;
  const course = value as Partial<CampusCourse>;
  return (
    typeof course.id === 'string' &&
    typeof course.courseName === 'string' &&
    Number.isFinite(course.weekday)
  );
}

function validExam(value: unknown): value is CampusExam {
  if (!value || typeof value !== 'object') return false;
  const exam = value as Partial<CampusExam>;
  return (
    typeof exam.id === 'string' &&
    typeof exam.courseName === 'string' &&
    validDateKey(exam.date)
  );
}

function validTodo(value: unknown): value is CampusTodo {
  if (!value || typeof value !== 'object') return false;
  const todo = value as Partial<CampusTodo>;
  return typeof todo.id === 'string' && typeof todo.title === 'string';
}

function normalizeCourse(course: CampusCourse): CampusCourse {
  const periods = Array.isArray(course.periods)
    ? course.periods.map(Number).filter(Number.isFinite)
    : [];
  const [start, end] = periodSpan(periods);
  return {
    ...course,
    excludedDates: Array.isArray(course.excludedDates)
      ? course.excludedDates.filter(validDateKey)
      : undefined,
    weekday: clamp(Number(course.weekday), 1, 7),
    periods,
    weeks: Array.isArray(course.weeks)
      ? course.weeks.map(Number).filter((week) => week >= 1 && week <= 30)
      : [],
    startMinutes: Number.isFinite(course.startMinutes)
      ? course.startMinutes
      : start,
    endMinutes: Number.isFinite(course.endMinutes) ? course.endMinutes : end,
    source: course.source === 'shuzhi' ? 'shuzhi' : 'manual',
  };
}

function normalizeExam(exam: CampusExam): CampusExam {
  return { ...exam, source: exam.source === 'shuzhi' ? 'shuzhi' : 'manual' };
}

function normalizeTodo(todo: CampusTodo): CampusTodo {
  const now = new Date().toISOString();
  return {
    ...todo,
    reminderTimes: Array.isArray(todo.reminderTimes)
      ? todo.reminderTimes.filter((item) => typeof item === 'string')
      : [],
    createdAt: todo.createdAt || now,
    updatedAt: todo.updatedAt || now,
  };
}

function validDateKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function two(value: number): string {
  return Math.round(value).toString().padStart(2, '0');
}
