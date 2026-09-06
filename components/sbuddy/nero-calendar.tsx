'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CalendarSearch,
  Plus,
  Trash2,
} from 'lucide-react';
import { useStudy } from './provider';
import { Dialog } from './app';
import { StudySummary } from './study-summary';
import { DatePicker } from './calendar-pickers';
import { CalendarEventEditor, CalendarTodoEditor } from './calendar-editors';
import {
  CoursesPanel,
  ExamsPanel,
} from '@/components/campus-calendar-workspace';
import {
  campusScheduleEvents,
  newCampusId,
  upsertTodo,
  type CampusTodo,
} from '@/lib/campus-data';
import {
  calendarDate,
  academicForDay,
  academicHeading,
  courseBlockColor,
  eventColor,
  eventLabel,
  eventsForDays,
  monthDays,
  moveMonth,
  packEvents,
  slots,
  visualEnd,
  weekday,
  weekDays,
  weekY,
} from '@/lib/calendar-layout';
import { localDate } from '@/lib/sbuddy-state';
import type { ScheduleEvent } from '@/lib/schedule-parser';

type Screen = 'calendar' | 'week' | 'todos' | 'courses' | 'exams';
export function NeroCalendar({
  onImport,
  onFocus,
}: {
  onImport: () => void;
  onFocus: () => void;
}) {
  const { data, setData, startFocus } = useStudy();
  const [screen, setScreen] = useState<Screen>('calendar'),
    [anchor, setAnchor] = useState(() => new Date()),
    [selected, setSelected] = useState(localDate());
  const [settings, setSettings] = useState(false),
    [resetCourses, setResetCourses] = useState(false),
    [resetSource, setResetSource] = useState<'manual' | 'shuzhi'>('shuzhi'),
    [pickMonth, setPickMonth] = useState(false),
    [editing, setEditing] = useState<ScheduleEvent>(),
    [editingTodo, setEditingTodo] = useState<CampusTodo>();
  const [completed, setCompleted] = useState(false),
    [undo, setUndo] = useState<CampusTodo>(),
    [remove, setRemove] = useState<ScheduleEvent>();
  const touch = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  useEffect(() => {
    if (!undo) return;
    const id = setTimeout(() => setUndo(undefined), 3000);
    return () => clearTimeout(id);
  }, [undo]);
  const days = screen === 'week' ? weekDays(anchor) : monthDays(anchor);
  const showAcademic = data.settings.showAcademicCalendar === true;
  const events = useMemo(
    () => [...data.events, ...campusScheduleEvents(data.campus)],
    [data.events, data.campus],
  );
  const rendered = eventsForDays(events, days);
  const agenda = eventsForDays(events, [calendarDate(selected)]).sort((a, b) =>
    a.time.localeCompare(b.time),
  );
  const setCampus = (campus: typeof data.campus) =>
    setData((d) => ({
      ...d,
      campus: {
        ...campus,
        courseSnapshots: [
          ...(campus.courseSnapshots ?? d.campus.courses),
          ...campus.courses.filter(
            (c) =>
              !d.campus.courses.some((old) => old.id === c.id) &&
              !campus.courseSnapshots?.some((old) => old.id === c.id),
          ),
        ],
      },
    }));
  const saveTodo = (todo: CampusTodo) =>
    setData((d) => ({
      ...d,
      campus: upsertTodo(d.campus, {
        ...todo,
        updatedAt: new Date().toISOString(),
      }),
    }));
  const toggleTodo = (todo: CampusTodo) => {
    saveTodo({
      ...todo,
      completedAt: todo.completedAt ? undefined : new Date().toISOString(),
    });
    if (!todo.completedAt) setUndo(todo);
  };
  const makeTodo = () =>
    setEditingTodo({
      id: newCampusId('todo'),
      title: '',
      reminderTimes: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  const makeEvent = () =>
    setEditing({
      id: newCampusId('event'),
      date: selected,
      day: Number(selected.slice(-2)),
      title: '',
      kind: 'personal',
      time: '09:00',
      end: '10:00',
      source: 'material',
    });
  const edit = (event: ScheduleEvent) => {
    if (event.source === 'campus-todo') {
      setEditingTodo(
        data.campus.todos.find((t) => 'campus-todo-' + t.id === event.id),
      );
      return;
    }
    setEditing(data.events.find((e) => e.id === event.id) ?? event);
  };
  const deleteEvent = (event: ScheduleEvent) => {
    setData((d) => {
      if (event.source === 'campus-todo')
        return {
          ...d,
          campus: {
            ...d.campus,
            todos: d.campus.todos.filter(
              (t) => 'campus-todo-' + t.id !== event.id,
            ),
          },
        };
      if (event.source === 'campus-exam')
        return {
          ...d,
          campus: {
            ...d.campus,
            exams: d.campus.exams.filter(
              (e) => 'campus-exam-' + e.id !== event.id,
            ),
          },
        };
      if (event.source === 'campus-course')
        return {
          ...d,
          campus: {
            ...d.campus,
            courseSnapshots: d.campus.courseSnapshots ?? d.campus.courses,
            courses: d.campus.courses.map((c) =>
              event.id.replace(/-\d+$/, '') === `campus-course-${c.id}`
                ? {
                    ...c,
                    excludedDates: [
                      ...new Set([...(c.excludedDates ?? []), event.date!]),
                    ],
                  }
                : c,
            ),
          },
        };
      return { ...d, events: d.events.filter((e) => e.id !== event.id) };
    });
    setRemove(undefined);
    setEditing(undefined);
  };
  const saveEvent = (event: ScheduleEvent) => {
    // Imported occurrences are overridden for that date; other teaching weeks remain intact.
    if (event.source === 'campus-course') deleteEvent(editing!);
    if (event.source === 'campus-exam') {
      setData((d) => ({
        ...d,
        campus: {
          ...d.campus,
          exams: d.campus.exams.map((e) =>
            'campus-exam-' + e.id === event.id
              ? {
                  ...e,
                  courseName: event.title.replace(/考试$/, ''),
                  date: event.date!,
                  time: `${event.time}-${event.end}`,
                  location: event.location,
                }
              : e,
          ),
        },
      }));
    } else
      setData((d) => ({
        ...d,
        events: [
          ...d.events.filter((e) => e.id !== event.id),
          {
            ...event,
            originCourseId:
              event.source === 'campus-course'
                ? d.campus.courses.find(
                    (c) =>
                      event.id.replace(/-\d+$/, '') === `campus-course-${c.id}`,
                  )?.id
                : event.originCourseId,
            id:
              event.source === 'campus-course'
                ? newCampusId('event')
                : event.id,
            source: 'material',
          },
        ],
      }));
    setEditing(undefined);
  };
  const move = (delta: number) => {
    const next =
      screen === 'week'
        ? new Date(
            anchor.getFullYear(),
            anchor.getMonth(),
            anchor.getDate() + delta * 7,
            12,
          )
        : moveMonth(anchor, delta);
    if (next.getFullYear() >= 2000 && next.getFullYear() <= 2100)
      setAnchor(next);
  };
  const goToday = () => {
    const now = new Date();
    setAnchor(now);
    setSelected(localDate(now));
  };
  const heading = (key: string) => {
    const d = calendarDate(key);
    const start = calendarDate(data.campus.semesterStart);
    const week =
      Math.floor(
        (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) -
          Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) /
          604800000,
      ) + 1;
    return (
      `${d.getMonth() + 1}月` +
      `${d.getDate()}日 周${'一二三四五六日'[weekday(d) - 1]}${showAcademic ? ` · ${academicHeading(key)}` : week > 0 && week <= 20 ? ` · 第 ${week} 周` : ''}`
    );
  };
  const todos = data.campus.todos
    .filter((t) => Boolean(t.completedAt) === completed)
    .sort((a, b) =>
      completed
        ? (b.completedAt ?? '').localeCompare(a.completedAt ?? '')
        : (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999') ||
          a.createdAt.localeCompare(b.createdAt),
    );
  return (
    <section className="daily-workspace" aria-label="日常活动">
      <header className="daily-header">
        <h1>日常活动</h1>
        <button className="secondary-button" onClick={onImport}>
          <CalendarSearch size={17} />
          日程识别
        </button>
      </header>
      <div className="daily-columns">
        <section
          className="calendar-panel nero-workspace"
          aria-label="日历与课程"
        >
          <div className="section-tabs">
            {(
              [
                ['calendar', '日历'],
                ['courses', '课程表'],
                ['exams', '考试'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                className={
                  screen === id || (id === 'calendar' && screen === 'week')
                    ? 'active'
                    : ''
                }
                onClick={() => setScreen(id)}
              >
                {label}
              </button>
            ))}
            <button
              className="icon-button daily-settings"
              aria-label="日历设置"
              onClick={() => setSettings(true)}
            >
              <Clock3 size={18} />
            </button>
          </div>
          {(screen === 'calendar' || screen === 'week') && (
            <div className="daily-calendar-controls">
              <div className="segmented">
                <button
                  aria-pressed={screen === 'week'}
                  onClick={() => setScreen('week')}
                >
                  周
                </button>
                <button
                  aria-pressed={screen === 'calendar'}
                  onClick={() => setScreen('calendar')}
                >
                  月
                </button>
              </div>
              <button className="text-button" onClick={goToday}>
                今天
              </button>
              <button className="text-button" onClick={makeEvent}>
                添加日程
              </button>
            </div>
          )}
          {screen === 'calendar' && (
            <>
              <div className="nero-month-heading">
                <button
                  className="icon-button"
                  aria-label="上个月"
                  onClick={() => move(-1)}
                >
                  <ChevronLeft size={23} />
                </button>
                <button onClick={() => setPickMonth(true)}>
                  {anchor.getFullYear()}年{anchor.getMonth() + 1}月
                  <ChevronDown size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label="下个月"
                  onClick={() => move(1)}
                >
                  <ChevronRight size={23} />
                </button>
              </div>
              <div
                className="nero-month"
                onTouchStart={(e) => {
                  touch.current = {
                    x: e.touches[0].clientX,
                    y: e.touches[0].clientY,
                  };
                }}
                onTouchEnd={(e) => {
                  const dx = e.changedTouches[0].clientX - touch.current.x,
                    dy = e.changedTouches[0].clientY - touch.current.y;
                  if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.5)
                    move(dx < 0 ? 1 : -1);
                }}
              >
                {'日一二三四五六'.split('').map((d) => (
                  <span className="nero-weekday" key={d}>
                    {d}
                  </span>
                ))}
                {days.map((date) => {
                  const key = localDate(date),
                    rows = rendered.filter((e) => e.date === key),
                    deadline = rows.some((e) => e.source === 'campus-todo');
                  return (
                    <button
                      className={
                        'nero-day ' +
                        (date.getMonth() !== anchor.getMonth()
                          ? 'outside '
                          : '') +
                        (key === selected
                          ? 'chosen '
                          : key === localDate()
                            ? 'today'
                            : '')
                      }
                      key={key}
                      aria-label={
                        key +
                        '，' +
                        rows.length +
                        '项安排' +
                        (deadline ? '，有待办截止' : '')
                      }
                      aria-pressed={selected === key}
                      onClick={() => {
                        setSelected(key);
                        if (date.getMonth() !== anchor.getMonth())
                          setAnchor(date);
                      }}
                    >
                      <span className="nero-day-number">
                        {deadline && <Clock3 size={9} />}
                        <span>{date.getDate()}</span>
                      </span>
                      <span className="nero-markers">
                        {showAcademic && academicForDay(key).length > 0 && (
                          <i style={{ background: '#0f766e' }} />
                        )}
                        {[
                          ...new Set(
                            rows
                              .filter((e) => e.source !== 'campus-todo')
                              .map(eventColor),
                          ),
                        ]
                          .slice(0, 3)
                          .map((c) => (
                            <i key={c} style={{ background: c }} />
                          ))}
                      </span>
                      <span className="daily-cell-events">
                        {rows.slice(0, 3).map((event) => (
                          <span
                            key={event.id}
                            style={{ borderLeftColor: eventColor(event) }}
                          >
                            {event.time} {event.title}
                          </span>
                        ))}
                        {rows.length > 3 && <small>+{rows.length - 3}</small>}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="nero-date-heading">
                <button
                  onClick={() => {
                    setAnchor(calendarDate(selected));
                    setScreen('week');
                  }}
                >
                  {heading(selected)}
                  <ChevronRight size={18} />
                </button>
                {selected !== localDate() && (
                  <button className="nero-today" onClick={goToday}>
                    今天
                  </button>
                )}
              </div>
              <div className="nero-agenda">
                {showAcademic &&
                  academicForDay(selected).map((item) => (
                    <div className="nero-academic" key={item.id}>
                      <i />
                      <span>
                        {item.title}
                        <small>校历</small>
                      </span>
                    </div>
                  ))}
                {agenda.length ? (
                  agenda.map((event) => {
                    const todo = data.campus.todos.find(
                      (t) => 'campus-todo-' + t.id === event.id,
                    );
                    return (
                      <div
                        className="nero-track-row"
                        key={event.id}
                        onTouchStart={(e) => {
                          touch.current = {
                            x: e.touches[0].clientX,
                            y: e.touches[0].clientY,
                          };
                        }}
                        onTouchEnd={(e) => {
                          if (
                            Math.abs(
                              e.changedTouches[0].clientX - touch.current.x,
                            ) > 85 &&
                            Math.abs(
                              e.changedTouches[0].clientY - touch.current.y,
                            ) < 45
                          )
                            setRemove(event);
                        }}
                      >
                        <div className="nero-track-mark">
                          {todo ? (
                            <button
                              className="todo-check"
                              aria-label={'完成待办 ' + todo.title}
                              onClick={() => toggleTodo(todo)}
                            />
                          ) : (
                            <i
                              className={event.kind === 'class' ? 'square' : ''}
                            />
                          )}
                        </div>
                        <button
                          className="nero-agenda-copy"
                          onClick={() => edit(event)}
                        >
                          <span>
                            <strong>{event.title}</strong>
                            {event.location && <small>{event.location}</small>}
                          </span>
                          <time>
                            {event.time}
                            {!todo && `–${event.end}`}
                          </time>
                          <small>{eventLabel(event)}</small>
                        </button>
                        <button
                          className="nero-row-delete"
                          aria-label={'删除 ' + event.title}
                          onClick={() => setRemove(event)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <p className="nero-empty">暂无日程</p>
                )}
                {!data.campus.courses.length && !data.events.length && (
                  <button className="nero-import" onClick={onImport}>
                    去导入课表
                  </button>
                )}
              </div>
            </>
          )}
          {screen === 'week' && (
            <>
              <div className="nero-week-heading">
                <button
                  className="icon-button"
                  aria-label="上一周"
                  onClick={() => move(-1)}
                >
                  <ChevronLeft size={20} />
                </button>
                <span>{heading(localDate(anchor))}</span>
                <button
                  className="icon-button"
                  aria-label="下一周"
                  onClick={() => move(1)}
                >
                  <ChevronRight size={20} />
                </button>
              </div>
              <div className="nero-week-table">
                <div className="nero-week-days">
                  <span />
                  {days.map((d) => (
                    <button
                      key={localDate(d)}
                      onClick={() => {
                        setSelected(localDate(d));
                        setAnchor(d);
                        setScreen('calendar');
                      }}
                    >
                      <small>周{'一二三四五六日'[weekday(d) - 1]}</small>
                      {d.getMonth() + 1}/{d.getDate()}
                    </button>
                  ))}
                </div>
                <div className="nero-week-body">
                  <div className="nero-week-axis">
                    <span style={{ top: 0 }}>00:00</span>
                    {slots
                      .flatMap((s) => s)
                      .map((m, i) => (
                        <span
                          className={i % 2 === 0 ? 'strong' : ''}
                          style={{ top: `${(weekY(m) / visualEnd) * 100}%` }}
                          key={m}
                        >
                          {String(Math.floor(m / 60)).padStart(2, '0')}:
                          {String(m % 60).padStart(2, '0')}
                        </span>
                      ))}
                    <span style={{ bottom: 0 }}>24:00</span>
                  </div>
                  {days.map((d) => (
                    <div className="nero-week-column" key={localDate(d)}>
                      {slots
                        .flatMap((s) => s)
                        .map((m) => (
                          <i
                            className="nero-week-rule"
                            key={m}
                            style={{ top: `${(weekY(m) / visualEnd) * 100}%` }}
                          />
                        ))}
                      {packEvents(
                        rendered.filter((e) => e.date === localDate(d)),
                      ).map(({ event, start, end, column, columns }) => (
                        <button
                          className="nero-week-event"
                          key={event.id}
                          aria-label={`${event.title} ${event.time} ${event.end}`}
                          style={{
                            top: `${(weekY(start) / visualEnd) * 100}%`,
                            height: `${(Math.max(weekY(end) - weekY(start), 4) / visualEnd) * 100}%`,
                            left: `${(column / columns) * 100}%`,
                            width: `${100 / columns}%`,
                            background:
                              event.kind === 'class'
                                ? courseBlockColor(event.title)
                                : eventColor(event),
                          }}
                          onClick={() => edit(event)}
                        >
                          <strong>{event.title}</strong>
                          <span>{event.location}</span>
                          <small>
                            {event.time}–{event.end}
                          </small>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
          {screen === 'courses' && (
            <CoursesPanel
              data={data.campus}
              onChange={setCampus}
              onSync={onImport}
            />
          )}
          {screen === 'exams' && (
            <ExamsPanel
              data={data.campus}
              onChange={setCampus}
              onSync={onImport}
            />
          )}
        </section>
        <aside className="daily-todos nero-workspace" aria-label="待办">
          <div className="daily-todo-heading">
            <h2>待办</h2>
            <button
              className="icon-button"
              aria-label="添加待办"
              onClick={makeTodo}
            >
              <Plus size={18} />
            </button>
          </div>
          <div className="nero-todo-tabs">
            {[false, true].map((done) => (
              <button
                key={String(done)}
                aria-pressed={completed === done}
                onClick={() => setCompleted(done)}
              >
                {done ? '已完成' : '未完成'}{' '}
                {
                  data.campus.todos.filter(
                    (t) => Boolean(t.completedAt) === done,
                  ).length
                }
              </button>
            ))}
          </div>
          <div className="nero-todos">
            {todos.length ? (
              todos.map((todo) => (
                <div className="nero-todo-row" key={todo.id}>
                  <button
                    className={
                      'todo-check ' + (todo.completedAt ? 'checked' : '')
                    }
                    aria-label={
                      (todo.completedAt ? '恢复待办 ' : '完成待办 ') +
                      todo.title
                    }
                    onClick={() => toggleTodo(todo)}
                  >
                    {todo.completedAt && <Check size={16} />}
                  </button>
                  <button onClick={() => setEditingTodo(todo)}>
                    <strong>{todo.title}</strong>
                    <small
                      className={
                        todo.dueAt &&
                        !todo.completedAt &&
                        new Date(todo.dueAt) < new Date()
                          ? 'overdue'
                          : ''
                      }
                    >
                      {todo.dueAt
                        ? new Date(todo.dueAt).toLocaleString('zh-CN', {
                            month: 'numeric',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '未设置截止时间'}
                      {todo.dueAt &&
                      !todo.completedAt &&
                      new Date(todo.dueAt) < new Date()
                        ? ' · 已逾期'
                        : ''}
                      {todo.location ? ' · ' + todo.location : ''}
                    </small>
                  </button>
                </div>
              ))
            ) : (
              <p className="nero-empty">
                {completed ? '还没有已完成待办' : '还没有待办'}
              </p>
            )}
          </div>
        </aside>
      </div>
      {undo && (
        <output className="nero-undo">
          <span>已完成待办</span>
          <button
            onClick={() => {
              setData((d) => ({
                ...d,
                campus: {
                  ...d.campus,
                  todos: d.campus.todos.map((t) =>
                    t.id === undo.id ? { ...t, completedAt: undefined } : t,
                  ),
                },
              }));
              setUndo(undefined);
            }}
          >
            撤销
          </button>
          <button aria-label="关闭提示" onClick={() => setUndo(undefined)}>
            ×
          </button>
        </output>
      )}
      {pickMonth && (
        <DatePicker
          value={localDate(anchor)}
          monthOnly
          onClose={() => setPickMonth(false)}
          onChange={(v) => {
            setAnchor(calendarDate(v));
            setSelected(v);
          }}
        />
      )}
      {settings && (
        <Dialog
          title="日历设置"
          className="nero-sheet"
          onClose={() => setSettings(false)}
        >
          <div className="nero-editor">
            <label className="nero-select-row">
              校历信息
              <select
                value={showAcademic ? 'show' : 'hide'}
                onChange={(e) =>
                  setData((d) => ({
                    ...d,
                    settings: {
                      ...d.settings,
                      showAcademicCalendar: e.target.value === 'show',
                    },
                  }))
                }
              >
                <option value="hide">关闭</option>
                <option value="show">人大校历</option>
              </select>
            </label>
            {[
              ['courses', '课程表'],
              ['exams', '考试'],
            ].map(([id, label]) => (
              <button
                className="nero-setting-row"
                key={id}
                onClick={() => {
                  setScreen(id as Screen);
                  setSettings(false);
                }}
              >
                {label}
                <ChevronRight size={18} />
              </button>
            ))}
            <button
              className="nero-setting-row"
              onClick={() => {
                setSettings(false);
                onImport();
              }}
            >
              导入课表 / 识别日程
              <ChevronRight size={18} />
            </button>
            <label>
              学期开始日期
              <input
                type="date"
                value={data.campus.semesterStart}
                onChange={(e) => {
                  if (e.target.value)
                    setCampus({
                      ...data.campus,
                      semesterStart: e.target.value,
                    });
                }}
              />
            </label>
            <button
              className="nero-setting-row"
              disabled={!data.campus.courseSnapshots?.length}
              onClick={() => setResetCourses(true)}
            >
              重置课表数据
              <ChevronRight size={18} />
            </button>
            <details className="daily-energy">
              <summary>今日状态与启动建议</summary>
              <StudySummary
                onStart={() => {
                  startFocus(10);
                  setSettings(false);
                  onFocus();
                }}
              />
            </details>
            <p className="muted small">提醒在网页打开期间显示。</p>
          </div>
        </Dialog>
      )}
      {editing && (
        <CalendarEventEditor
          event={editing}
          existing={events.some((e) => e.id === editing.id)}
          onClose={() => setEditing(undefined)}
          onSave={saveEvent}
          onDelete={() => setRemove(editing)}
        />
      )}
      {resetCourses && (
        <Dialog
          title="重置课表数据？"
          className="nero-picker"
          onClose={() => setResetCourses(false)}
        >
          <p>恢复所选来源最近保留的课表，并移除该来源课程的单次修改。</p>
          <div className="nero-editor">
            <label>
              导入来源
              <select
                value={resetSource}
                onChange={(e) =>
                  setResetSource(e.target.value as 'manual' | 'shuzhi')
                }
              >
                <option value="shuzhi">数智人大</option>
                <option value="manual">手动导入</option>
              </select>
            </label>
          </div>
          <div className="nero-picker-actions">
            <button onClick={() => setResetCourses(false)}>取消</button>
            <button
              disabled={
                !data.campus.courseSnapshots?.some(
                  (c) => c.source === resetSource,
                )
              }
              onClick={() => {
                setData((d) => {
                  const restored = d.campus.courseSnapshots!.filter(
                    (c) => c.source === resetSource,
                  );
                  const ids = new Set(
                    [...d.campus.courses, ...restored]
                      .filter((c) => c.source === resetSource)
                      .map((c) => c.id),
                  );
                  return {
                    ...d,
                    campus: {
                      ...d.campus,
                      courses: [
                        ...d.campus.courses.filter(
                          (c) => c.source !== resetSource,
                        ),
                        ...restored,
                      ],
                    },
                    events: d.events.filter(
                      (e) => !e.originCourseId || !ids.has(e.originCourseId),
                    ),
                  };
                });
                setResetCourses(false);
              }}
            >
              重置
            </button>
          </div>
        </Dialog>
      )}
      {editingTodo && (
        <CalendarTodoEditor
          todo={editingTodo}
          existing={data.campus.todos.some((t) => t.id === editingTodo.id)}
          onClose={() => setEditingTodo(undefined)}
          onSave={(v) => {
            saveTodo(v);
            setEditingTodo(undefined);
          }}
          onDelete={() => {
            setData((d) => ({
              ...d,
              campus: {
                ...d.campus,
                todos: d.campus.todos.filter((t) => t.id !== editingTodo.id),
              },
            }));
            setEditingTodo(undefined);
          }}
        />
      )}
      {remove && (
        <Dialog
          title="删除日程"
          className="nero-picker"
          onClose={() => setRemove(undefined)}
        >
          <p>
            删除“{remove.title}”
            {remove.repeat
              ? '的全部重复日程'
              : remove.source === 'campus-course'
                ? '在这一天的课程'
                : ''}
            ？
          </p>
          <div className="nero-picker-actions">
            <button onClick={() => setRemove(undefined)}>取消</button>
            <button onClick={() => deleteEvent(remove)}>删除</button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
