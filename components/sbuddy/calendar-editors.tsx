'use client';
import { useState } from 'react';
import { ChevronRight, Plus, X } from 'lucide-react';
import { Dialog } from './app';
import { DatePicker, TimePicker } from './calendar-pickers';
import { calendarDate, weekday } from '@/lib/calendar-layout';
import { localDate, validEvent } from '@/lib/sbuddy-state';
import type { EventRepeat, ScheduleEvent } from '@/lib/schedule-parser';
import type { CampusTodo } from '@/lib/campus-data';

const repeatNames = {
  none: '永不',
  daily: '每天',
  weekly: '每周',
  biweekly: '每两周',
  monthly: '每月',
  yearly: '每年',
  custom: '自定义',
};
export function CalendarEventEditor({
  event,
  existing,
  onSave,
  onDelete,
  onClose,
}: {
  event: ScheduleEvent;
  existing: boolean;
  onSave: (e: ScheduleEvent) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(event),
    [picker, setPicker] = useState<
      '' | 'date' | 'start' | 'end' | 'until' | 'custom'
    >('');
  const [hint, setHint] = useState('');
  const change = (v: Partial<ScheduleEvent>) => {
    setDraft((d) => ({ ...d, ...v }));
    setHint('');
  };
  const date = calendarDate(draft.date!);
  return (
    <Dialog
      title={existing ? '编辑日程' : '添加日程'}
      className="nero-sheet"
      onClose={onClose}
    >
      <form
        className="nero-editor"
        onSubmit={(e) => {
          e.preventDefault();
          if (!validEvent(draft)) {
            setHint(
              '请填写标题，结束时间须晚于开始时间，重复结束日期不能早于开始日期。',
            );
            return;
          }
          onSave({
            ...draft,
            title: draft.title.trim(),
            remindMinutes:
              draft.remindMinutes === undefined ? 30 : draft.remindMinutes,
          });
        }}
      >
        <button
          type="button"
          className="nero-editor-date"
          onClick={() => setPicker('date')}
        >
          <strong>
            {date.getFullYear()}年{date.getMonth() + 1}月{date.getDate()}日
          </strong>
          <span>周{'一二三四五六日'[weekday(date) - 1]}</span>
        </button>
        <div className="nero-type-toggle">
          {['活动', '课程'].map((label, i) => (
            <button
              type="button"
              key={label}
              aria-pressed={
                i === 1 ? draft.kind === 'class' : draft.kind !== 'class'
              }
              onClick={() => change({ kind: i === 1 ? 'class' : 'personal' })}
            >
              {label}
            </button>
          ))}
        </div>
        <label>
          标题（必填）
          <input
            aria-label="日程标题"
            required
            maxLength={120}
            value={draft.title}
            onChange={(e) => change({ title: e.target.value })}
          />
        </label>
        <label>
          地点（选填）
          <input
            value={draft.location ?? ''}
            onChange={(e) => change({ location: e.target.value })}
          />
        </label>
        <button
          type="button"
          className="nero-setting-row"
          onClick={() => setPicker('start')}
        >
          开始 {draft.time}
          <ChevronRight size={18} />
        </button>
        <button
          type="button"
          className="nero-setting-row"
          onClick={() => setPicker('end')}
        >
          结束 {draft.end}
          <ChevronRight size={18} />
        </button>
        <label className="nero-select-row">
          提醒
          <select
            value={
              draft.remindMinutes === null
                ? 'none'
                : (draft.remindMinutes ?? 'default')
            }
            onChange={(e) =>
              change({
                remindMinutes:
                  e.target.value === 'none'
                    ? null
                    : e.target.value === 'default'
                      ? undefined
                      : Number(e.target.value),
              })
            }
          >
            <option value="default">默认（30 分钟前）</option>
            <option value="none">不提醒</option>
            {[5, 10, 15, 30, 45, 60, 90, 120].map((n) => (
              <option key={n} value={n}>
                {n} 分钟前
              </option>
            ))}
          </select>
        </label>
        <label className="nero-select-row">
          重复
          <select
            value={draft.repeat?.kind ?? 'none'}
            onChange={(e) => {
              const kind = e.target.value as EventRepeat['kind'] | 'none';
              change({
                repeat:
                  kind === 'none'
                    ? undefined
                    : { kind, until: draft.repeat?.until },
              });
              if (kind === 'custom') setPicker('custom');
            }}
          >
            {Object.entries(repeatNames).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {draft.repeat?.kind === 'custom' && (
          <button
            type="button"
            className="nero-setting-row"
            onClick={() => setPicker('custom')}
          >
            自定义重复规则
            <ChevronRight size={18} />
          </button>
        )}
        {draft.repeat && (
          <>
            <label className="nero-select-row">
              结束重复
              <select
                value={draft.repeat.until ? 'date' : 'never'}
                onChange={(e) =>
                  e.target.value === 'date'
                    ? setPicker('until')
                    : change({ repeat: { ...draft.repeat!, until: undefined } })
                }
              >
                <option value="never">永不</option>
                <option value="date">于日期</option>
              </select>
            </label>
            {draft.repeat.until && (
              <button
                type="button"
                className="nero-setting-row"
                onClick={() => setPicker('until')}
              >
                结束日期 <span>{draft.repeat.until}</span>
              </button>
            )}
          </>
        )}
        {hint && (
          <p role="alert" className="error-message">
            {hint}
          </p>
        )}
        <button className="nero-primary" type="submit">
          {existing ? '保存' : '添加'}
        </button>
        {existing && (
          <button className="nero-danger" type="button" onClick={onDelete}>
            {draft.repeat ? '删除全部重复日程' : '删除日程'}
          </button>
        )}
      </form>
      {(picker === 'date' || picker === 'until') && (
        <DatePicker
          value={
            picker === 'date'
              ? draft.date!
              : (draft.repeat?.until ?? draft.date!)
          }
          onClose={() => setPicker('')}
          onChange={(v) =>
            picker === 'date'
              ? change({ date: v, day: Number(v.slice(-2)) })
              : change({ repeat: { ...draft.repeat!, until: v } })
          }
        />
      )}
      {(picker === 'start' || picker === 'end') && (
        <TimePicker
          value={picker === 'start' ? draft.time : draft.end}
          onClose={() => setPicker('')}
          onChange={(v) => {
            if (picker === 'end') {
              change({ end: v });
              return;
            }
            const h = Number(v.slice(0, 2)),
              m = v.slice(3);
            change({
              time: v,
              end:
                v >= draft.end
                  ? `${String(Math.min(23, h + 1)).padStart(2, '0')}:${h === 23 ? '59' : m}`
                  : draft.end,
            });
          }}
        />
      )}
      {picker === 'custom' && (
        <RepeatEditor
          value={draft.repeat!}
          date={date}
          onClose={() => setPicker('')}
          onSave={(r) => {
            change({ repeat: r });
            setPicker('');
          }}
        />
      )}
    </Dialog>
  );
}

function RepeatEditor({
  value,
  date,
  onSave,
  onClose,
}: {
  value: EventRepeat;
  date: Date;
  onSave: (v: EventRepeat) => void;
  onClose: () => void;
}) {
  const [r, setR] = useState<EventRepeat>({
    frequency: 'weekly',
    interval: 1,
    weekdays: [weekday(date)],
    monthDays: [date.getDate()],
    months: [date.getMonth() + 1],
    ...value,
  });
  const toggle = (field: 'weekdays' | 'monthDays' | 'months', n: number) => {
    const old = r[field] ?? [];
    if (old.length === 1 && old.includes(n)) return;
    setR({
      ...r,
      [field]: old.includes(n) ? old.filter((x) => x !== n) : [...old, n],
    });
  };
  return (
    <Dialog title="自定义重复" className="nero-sheet" onClose={onClose}>
      <div className="nero-editor">
        <label className="nero-select-row">
          频率
          <select
            value={r.frequency}
            onChange={(e) =>
              setR({
                ...r,
                frequency: e.target.value as EventRepeat['frequency'],
              })
            }
          >
            {Object.entries({
              daily: '每天',
              weekly: '每周',
              monthly: '每月',
              yearly: '每年',
            }).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="nero-select-row">
          间隔
          <input
            aria-label="重复间隔"
            type="number"
            min={1}
            max={99}
            value={r.interval}
            onChange={(e) => setR({ ...r, interval: Number(e.target.value) })}
          />
        </label>
        {r.frequency === 'weekly' && (
          <div className="nero-choice-grid weekdays">
            {[7, 1, 2, 3, 4, 5, 6].map((n) => (
              <button
                type="button"
                key={n}
                aria-pressed={r.weekdays?.includes(n)}
                onClick={() => toggle('weekdays', n)}
              >
                {'一二三四五六日'[n - 1]}
              </button>
            ))}
          </div>
        )}
        {r.frequency === 'yearly' && (
          <div className="nero-choice-grid">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
              <button
                type="button"
                key={n}
                aria-pressed={r.months?.includes(n)}
                onClick={() => toggle('months', n)}
              >
                {n}月
              </button>
            ))}
          </div>
        )}
        {(r.frequency === 'monthly' || r.frequency === 'yearly') && (
          <>
            <label className="nero-select-row">
              日期方式
              <select
                value={r.ordinal === undefined ? 'date' : 'weekday'}
                onChange={(e) =>
                  setR({
                    ...r,
                    ordinal: e.target.value === 'date' ? undefined : 1,
                    dayKind: 'natural',
                  })
                }
              >
                <option value="date">日期</option>
                <option value="weekday">星期</option>
              </select>
            </label>
            {r.ordinal === undefined ? (
              <div className="nero-choice-grid days">
                {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
                  <button
                    type="button"
                    key={n}
                    aria-pressed={r.monthDays?.includes(n)}
                    onClick={() => toggle('monthDays', n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            ) : (
              <>
                <label className="nero-select-row">
                  第几个
                  <select
                    value={r.ordinal}
                    onChange={(e) =>
                      setR({ ...r, ordinal: Number(e.target.value) })
                    }
                  >
                    {[1, 2, 3, 4, 5, -2, -1].map((n) => (
                      <option value={n} key={n}>
                        {n > 0
                          ? `第 ${n} 个`
                          : n === -1
                            ? '最后一个'
                            : '倒数第二个'}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="nero-select-row">
                  日期类型
                  <select
                    value={r.dayKind}
                    onChange={(e) =>
                      setR({
                        ...r,
                        dayKind: /^\d$/.test(e.target.value)
                          ? Number(e.target.value)
                          : (e.target.value as EventRepeat['dayKind']),
                      })
                    }
                  >
                    <option value="natural">自然日</option>
                    <option value="workday">工作日（周一至周五）</option>
                    <option value="weekend">周末</option>
                    {[7, 1, 2, 3, 4, 5, 6].map((n) => (
                      <option value={n} key={n}>
                        周{'一二三四五六日'[n - 1]}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </>
        )}
        <button
          type="button"
          className="nero-primary"
          disabled={!r.interval || r.interval < 1 || r.interval > 99}
          onClick={() => onSave(r)}
        >
          完成
        </button>
      </div>
    </Dialog>
  );
}

export function CalendarTodoEditor({
  todo,
  existing,
  onSave,
  onDelete,
  onClose,
}: {
  todo: CampusTodo;
  existing: boolean;
  onSave: (v: CampusTodo) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(todo),
    [pick, setPick] = useState<
      '' | 'dueDate' | 'dueTime' | 'reminderDate' | 'reminderTime'
    >(''),
    [tempDate, setTempDate] = useState(localDate()),
    [hint, setHint] = useState('');
  const [fallbackDeadline] = useState(() => new Date(Date.now() + 86400000));
  const initial = draft.dueAt ? new Date(draft.dueAt) : fallbackDeadline;
  const format = (v: string) =>
    new Date(v).toLocaleString('zh-CN', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  return (
    <Dialog
      title={existing ? '编辑待办' : '添加待办'}
      className="nero-sheet"
      onClose={onClose}
    >
      <form
        className="nero-editor"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.title.trim())
            onSave({ ...draft, title: draft.title.trim() });
        }}
      >
        <label>
          标题（必填）
          <input
            required
            aria-label="待办标题"
            maxLength={120}
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </label>
        <label>
          地点（选填）
          <input
            value={draft.location ?? ''}
            onChange={(e) => setDraft({ ...draft, location: e.target.value })}
          />
        </label>
        <div className="nero-deadline">
          <button
            type="button"
            className="nero-setting-row"
            onClick={() => setPick('dueDate')}
          >
            <span>
              截止时间
              <small>{draft.dueAt ? format(draft.dueAt) : '未设置'}</small>
            </span>
            <ChevronRight size={18} />
          </button>
          {draft.dueAt && (
            <button
              type="button"
              className="icon-button"
              aria-label="清除截止时间"
              onClick={() =>
                setDraft({ ...draft, dueAt: undefined, reminderTimes: [] })
              }
            >
              <X size={18} />
            </button>
          )}
        </div>
        <strong>提醒时间</strong>
        {!draft.dueAt ? (
          <p className="muted">请先设置截止时间</p>
        ) : (
          <>
            {!draft.reminderTimes.length && (
              <p className="muted">尚未设置提醒</p>
            )}
            {draft.reminderTimes.map((v) => (
              <div className="nero-setting-row" key={v}>
                <span>{format(v)}</span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={'删除提醒 ' + format(v)}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      reminderTimes: draft.reminderTimes.filter((t) => t !== v),
                    })
                  }
                >
                  <X size={16} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="text-button"
              onClick={() => setPick('reminderDate')}
            >
              <Plus size={16} />
              添加提醒
            </button>
          </>
        )}
        {hint && (
          <p role="alert" className="error-message">
            {hint}
          </p>
        )}
        <button type="submit" className="nero-primary">
          {existing ? '保存' : '添加'}
        </button>
        {existing && (
          <button type="button" className="nero-danger" onClick={onDelete}>
            删除待办
          </button>
        )}
      </form>
      {(pick === 'dueDate' || pick === 'reminderDate') && (
        <DatePicker
          value={localDate(initial)}
          onClose={() => setPick((p) => (p.endsWith('Date') ? '' : p))}
          onChange={(v) => {
            setTempDate(v);
            setPick(pick === 'dueDate' ? 'dueTime' : 'reminderTime');
          }}
        />
      )}
      {(pick === 'dueTime' || pick === 'reminderTime') && (
        <TimePicker
          value={`${String(initial.getHours()).padStart(2, '0')}:${String(initial.getMinutes()).padStart(2, '0')}`}
          onClose={() => setPick('')}
          onChange={(v) => {
            const time = new Date(`${tempDate}T${v}:00`).toISOString();
            if (new Date(time).getTime() <= Date.now()) {
              setHint(
                pick === 'dueTime'
                  ? '截止时间需晚于现在'
                  : '提醒时间需晚于现在',
              );
              return;
            }
            if (pick === 'dueTime') {
              setDraft({
                ...draft,
                dueAt: time,
                reminderTimes: draft.reminderTimes.filter((t) => t <= time),
              });
            } else if (time > draft.dueAt!) {
              setHint('提醒时间不能晚于截止时间');
              return;
            } else
              setDraft({
                ...draft,
                reminderTimes: [
                  ...new Set([...draft.reminderTimes, time]),
                ].sort(),
              });
            setHint('');
          }}
        />
      )}
    </Dialog>
  );
}
