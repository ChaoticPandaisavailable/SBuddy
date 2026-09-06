'use client';
import type { ScheduleEvent } from '@/lib/schedule-parser';
import { NeroCalendar } from './nero-calendar';
export const kindNames = {
  class: '课程',
  study: '自习',
  meeting: '会议',
  personal: '日常',
};
export function DailyActivities(props: {
  onImport: () => void;
  onFocus: () => void;
}) {
  return <NeroCalendar {...props} />;
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
