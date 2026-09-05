'use client';
import { useMemo, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useStudy } from './provider';
import { Dialog, PageTitle } from './app';
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
import { localDate, validEvent } from '@/lib/sbuddy-state';
import type { ScheduleEvent } from '@/lib/schedule-parser';

const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
export const kindNames = {
  class: '课程',
  study: '自习',
  meeting: '会议',
  personal: '日常',
};
export function DailyActivities({ onImport }: { onImport: () => void }) {
  const { data, setData } = useStudy();
  const [view, setView] = useState<'month' | 'week'>('month');
  const [tab, setTab] = useState('calendar');
  const [anchor, setAnchor] = useState(() => new Date());
  const [selected, setSelected] = useState(localDate());
  const [editing, setEditing] = useState<ScheduleEvent>();
  const [showDetails, setShowDetails] = useState(false);
  const events = useMemo(
    () => [...data.events, ...campusScheduleEvents(data.campus)],
    [data.events, data.campus],
  );
  const visible = events
    .filter((e) => e.date === selected)
    .sort((a, b) => a.time.localeCompare(b.time));
  const start =
    view === 'month'
      ? new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12)
      : new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate(), 12);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const days = Array.from({ length: view === 'month' ? 42 : 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
  const move = (delta: number) => {
    const d = new Date(anchor);
    if (view === 'month') {
      d.setDate(1);
      d.setMonth(d.getMonth() + delta);
    } else d.setDate(d.getDate() + 7 * delta);
    setAnchor(d);
  };
  const setCampus = (campus: typeof data.campus) =>
    setData((d) => ({ ...d, campus }));
  return (
    <>
      <PageTitle
        title="把日子安排成喜欢的样子"
        description="课程、考试和小小的待办，都放在这里。"
      >
        <button className="secondary-button" onClick={onImport}>
          识别日程
          <ChevronRight size={16} />
        </button>
      </PageTitle>
      <div className="daily-columns">
        <section className="calendar-panel">
          <div className="section-tabs">
            {[
              ['calendar', '日历'],
              ['courses', '课程表'],
              ['exams', '考试'],
            ].map(([id, label]) => (
              <button
                key={id}
                className={tab === id ? 'active' : ''}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === 'calendar' && (
            <>
              <div className="calendar-toolbar">
                <h2>
                  {anchor.getFullYear()} 年 {anchor.getMonth() + 1} 月
                </h2>
                <div className="segmented">
                  <button
                    aria-pressed={view === 'week'}
                    onClick={() => setView('week')}
                  >
                    周
                  </button>
                  <button
                    aria-pressed={view === 'month'}
                    onClick={() => setView('month')}
                  >
                    月
                  </button>
                </div>
                <div className="button-row compact">
                  <button
                    className="icon-button"
                    aria-label="上一页日历"
                    onClick={() => move(-1)}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      setAnchor(new Date());
                      setSelected(localDate());
                    }}
                  >
                    今天
                  </button>
                  <button
                    className="icon-button"
                    aria-label="下一页日历"
                    onClick={() => move(1)}
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
              <div className={'s-calendar ' + view}>
                <div className="s-calendar-head">
                  {weekdays.map((d) => (
                    <span key={d}>{d}</span>
                  ))}
                </div>
                <div className="s-calendar-grid">
                  {days.map((date) => {
                    const key = localDate(date);
                    const rows = events
                      .filter((e) => e.date === key)
                      .sort((a, b) => a.time.localeCompare(b.time));
                    return (
                      <button
                        key={key}
                        className={
                          's-calendar-day ' +
                          (date.getMonth() !== anchor.getMonth()
                            ? 'outside '
                            : '') +
                          (key === selected ? 'chosen ' : '') +
                          (key === localDate() ? 'today' : '')
                        }
                        aria-label={key + '，' + rows.length + '项安排'}
                        aria-pressed={key === selected}
                        onClick={() => {
                          setSelected(key);
                          setShowDetails(true);
                        }}
                      >
                        <span className="date-number">{date.getDate()}</span>
                        {rows.slice(0, view === 'week' ? 12 : 3).map((row) => (
                          <span
                            className={'event-chip kind-' + row.kind}
                            key={row.id}
                          >
                            <small>{row.time}</small>
                            {row.title}
                          </span>
                        ))}
                        {rows.length > (view === 'week' ? 12 : 3) && (
                          <small className="more-events">
                            还有 {rows.length - (view === 'week' ? 12 : 3)} 项
                          </small>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="calendar-legend">
                {Object.entries(kindNames).map(([id, label]) => (
                  <span key={id}>
                    <i className={'kind-' + id} />
                    {label}
                  </span>
                ))}
                <button
                  className="text-button"
                  onClick={() =>
                    setEditing({
                      id: newCampusId('event'),
                      day: Number(selected.slice(-2)),
                      date: selected,
                      title: '',
                      kind: 'personal',
                      time: '09:00',
                      end: '10:00',
                      source: 'material',
                    })
                  }
                >
                  <Plus size={16} />
                  添加日程
                </button>
              </div>
              <div className="selected-day">
                <h3>{selected} 的安排</h3>
                {visible.length ? (
                  visible.map((event) => (
                    <div className="day-row" key={event.id}>
                      <time>
                        {event.time}
                        <small>{event.end}</small>
                      </time>
                      <div>
                        <strong>{event.title}</strong>
                        <p>{event.location || kindNames[event.kind]}</p>
                      </div>
                      {data.events.some((e) => e.id === event.id) && (
                        <button
                          className="icon-button"
                          aria-label={'编辑 ' + event.title}
                          onClick={() => setEditing(event)}
                        >
                          <Pencil size={15} />
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="empty-compact">
                    这一天还很宽敞。留一点时间给学习，也给自己。
                  </p>
                )}
              </div>
            </>
          )}
          {tab === 'courses' && (
            <CoursesPanel
              data={data.campus}
              onChange={setCampus}
              onSync={onImport}
            />
          )}
          {tab === 'exams' && (
            <ExamsPanel
              data={data.campus}
              onChange={setCampus}
              onSync={onImport}
            />
          )}
        </section>
        <TodoRail />
      </div>
      {editing && (
        <Dialog
          title={
            data.events.some((e) => e.id === editing.id)
              ? '编辑日程'
              : '添加日程'
          }
          onClose={() => setEditing(undefined)}
        >
          <EventForm event={editing} onChange={setEditing} />
          <div className="button-row">
            <button
              className="primary-button"
              disabled={!validEvent(editing)}
              onClick={() => {
                setData((d) => ({
                  ...d,
                  events: [
                    ...d.events.filter((e) => e.id !== editing.id),
                    { ...editing, day: Number(editing.date?.slice(-2)) },
                  ],
                }));
                setEditing(undefined);
              }}
            >
              <Check size={16} />
              保存日程
            </button>
            <button
              className="text-button danger"
              onClick={() => {
                setData((d) => ({
                  ...d,
                  events: d.events.filter((e) => e.id !== editing.id),
                }));
                setEditing(undefined);
              }}
            >
              <Trash2 size={16} />
              删除
            </button>
          </div>
          {!validEvent(editing) && (
            <p className="validation">
              请填写标题、有效日期和起止时间，结束时间需晚于开始时间。
            </p>
          )}
        </Dialog>
      )}
      {showDetails && (
        <Dialog
          title={selected + ' 的安排'}
          onClose={() => setShowDetails(false)}
        >
          {visible.length ? (
            visible.map((e) => (
              <div className="day-row" key={e.id}>
                <time>
                  {e.time}
                  <small>{e.end}</small>
                </time>
                <div>
                  <strong>{e.title}</strong>
                  <p>{e.location || kindNames[e.kind]}</p>
                </div>
                {data.events.some((x) => x.id === e.id) && (
                  <button
                    className="icon-button"
                    aria-label={'编辑 ' + e.title}
                    onClick={() => {
                      setShowDetails(false);
                      setEditing(e);
                    }}
                  >
                    <Pencil size={16} />
                  </button>
                )}
              </div>
            ))
          ) : (
            <p className="empty-compact">这天没有安排。</p>
          )}
          <button
            className="primary-button"
            onClick={() => {
              setShowDetails(false);
              setEditing({
                id: newCampusId('event'),
                day: Number(selected.slice(-2)),
                date: selected,
                title: '',
                time: '09:00',
                end: '10:00',
                kind: 'personal',
                source: 'material',
              });
            }}
          >
            <Plus size={16} />
            添加日程
          </button>
        </Dialog>
      )}
    </>
  );
}
export function EventForm({
  event,
  onChange,
}: {
  event: ScheduleEvent;
  onChange: (e: ScheduleEvent) => void;
}) {
  return (
    <div className="event-form">
      <label className="full">
        标题
        <input
          aria-label="日程标题"
          value={event.title}
          maxLength={80}
          onChange={(e) => onChange({ ...event, title: e.target.value })}
        />
      </label>
      <label>
        日期
        <input
          aria-label="日程日期"
          type="date"
          value={event.date ?? ''}
          onChange={(e) =>
            onChange({
              ...event,
              date: e.target.value,
              day: Number(e.target.value.slice(-2)),
            })
          }
        />
      </label>
      <label>
        类型
        <select
          value={event.kind}
          onChange={(e) =>
            onChange({
              ...event,
              kind: e.target.value as ScheduleEvent['kind'],
            })
          }
        >
          {Object.entries(kindNames).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label>
        开始
        <input
          aria-label="开始时间"
          type="time"
          value={event.time}
          onChange={(e) => onChange({ ...event, time: e.target.value })}
        />
      </label>
      <label>
        结束
        <input
          aria-label="结束时间"
          type="time"
          value={event.end}
          onChange={(e) => onChange({ ...event, end: e.target.value })}
        />
      </label>
      <label className="full">
        地点（可选）
        <input
          value={event.location ?? ''}
          onChange={(e) => onChange({ ...event, location: e.target.value })}
        />
      </label>
    </div>
  );
}
export function TodoRail() {
  const { data, setData } = useStudy();
  const [editing, setEditing] = useState<CampusTodo>();
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const todos = data.campus.todos
    .filter((t) => filter === 'all' || !t.completedAt)
    .sort(
      (a, b) =>
        Number(!!a.completedAt) - Number(!!b.completedAt) ||
        (a.dueAt ?? '9').localeCompare(b.dueAt ?? '9'),
    );
  const save = (todo: CampusTodo) =>
    setData((d) => ({
      ...d,
      campus: upsertTodo(d.campus, {
        ...todo,
        updatedAt: new Date().toISOString(),
      }),
    }));
  const make = () =>
    setEditing({
      id: newCampusId('todo'),
      title: '',
      reminderTimes: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  const dueInput = (value?: string) => {
    if (!value) return '';
    const d = new Date(value);
    return (
      localDate(d) +
      'T' +
      String(d.getHours()).padStart(2, '0') +
      ':' +
      String(d.getMinutes()).padStart(2, '0')
    );
  };
  return (
    <aside className="todo-rail">
      <div className="section-heading">
        <h2>我的待办</h2>
        <span className="pill">
          {data.campus.todos.filter((t) => !t.completedAt).length}
        </span>
      </div>
      <p className="muted">一件一件来，就好。</p>
      <div className="section-tabs small-tabs">
        <button
          className={filter === 'pending' ? 'active' : ''}
          onClick={() => setFilter('pending')}
        >
          待完成
        </button>
        <button
          className={filter === 'all' ? 'active' : ''}
          onClick={() => setFilter('all')}
        >
          全部
        </button>
      </div>
      <div className="todo-list">
        {todos.map((todo) => (
          <div
            className={'todo-item ' + (todo.completedAt ? 'completed' : '')}
            key={todo.id}
          >
            <button
              className="todo-check"
              aria-label={
                (todo.completedAt ? '恢复待办 ' : '完成待办 ') + todo.title
              }
              onClick={() =>
                save({
                  ...todo,
                  completedAt: todo.completedAt
                    ? undefined
                    : new Date().toISOString(),
                })
              }
            >
              {todo.completedAt && <Check size={15} />}
            </button>
            <div>
              <strong>{todo.title}</strong>
              <p
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
              </p>
              {todo.location && <small>{todo.location}</small>}
            </div>
            <button
              className="icon-button"
              aria-label={'编辑待办 ' + todo.title}
              onClick={() => setEditing(todo)}
            >
              <Pencil size={14} />
            </button>
          </div>
        ))}
      </div>
      {!todos.length && (
        <div className="empty-todo">
          <Check size={28} />
          <h3>给今天留一点可能</h3>
          <p>
            记下一件想完成的小事，
            <br />
            搭子会陪你慢慢来。
          </p>
        </div>
      )}
      <button className="secondary-button full-width" onClick={make}>
        <Plus size={18} />
        添加待办
      </button>
      {editing && (
        <Dialog
          title={
            data.campus.todos.some((t) => t.id === editing.id)
              ? '编辑待办'
              : '添加待办'
          }
          onClose={() => setEditing(undefined)}
        >
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              if (!editing.title.trim()) return;
              const dueValue = new FormData(e.currentTarget).get('dueAt');
              const dueAt =
                typeof dueValue === 'string' && dueValue
                  ? new Date(dueValue).toISOString()
                  : undefined;
              save({
                ...editing,
                title: editing.title.trim(),
                dueAt,
                reminderTimes: dueAt ? [dueAt] : [],
              });
              setEditing(undefined);
            }}
          >
            <label>
              待办标题
              <input
                required
                maxLength={120}
                value={editing.title}
                onChange={(e) =>
                  setEditing({ ...editing, title: e.target.value })
                }
              />
            </label>
            <label>
              截止时间（可选）
              <input
                type="datetime-local"
                name="dueAt"
                value={dueInput(editing.dueAt)}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    dueAt: e.target.value
                      ? new Date(e.target.value).toISOString()
                      : undefined,
                  })
                }
              />
            </label>
            <label>
              地点（可选）
              <input
                value={editing.location ?? ''}
                onChange={(e) =>
                  setEditing({ ...editing, location: e.target.value })
                }
              />
            </label>
            <p className="muted small">
              提醒在页面打开期间显示。有截止时间的待办会同步到日历。
            </p>
            <div className="button-row">
              <button className="primary-button" type="submit">
                保存待办
                <Check size={16} />
              </button>
              <button
                className="text-button danger"
                type="button"
                onClick={() => {
                  setData((d) => ({
                    ...d,
                    campus: {
                      ...d.campus,
                      todos: d.campus.todos.filter((t) => t.id !== editing.id),
                    },
                  }));
                  setEditing(undefined);
                }}
              >
                <Trash2 size={16} />
                删除
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </aside>
  );
}
