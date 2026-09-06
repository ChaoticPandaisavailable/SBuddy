'use client';
import { useState } from 'react';
import {
  ArrowRight,
  CalendarSearch,
  Check,
  Trash2,
  Upload,
} from 'lucide-react';
import { useStudy } from './provider';
import { PageTitle } from './app';
import { EventForm } from './daily';
import { CampusSyncPanel } from '@/components/campus-calendar-workspace';
import { localDate, mergeEvents, validEvent } from '@/lib/sbuddy-state';
import {
  parseScheduleMaterial,
  type ScheduleEvent,
} from '@/lib/schedule-parser';
type ApiResult = {
  error?: string;
  source?: string;
  warning?: string;
  events: ScheduleEvent[];
};
export function ScheduleTool({ onCalendar }: { onCalendar: () => void }) {
  const { data, setData, notify, showcase } = useStudy();
  const [tab, setTab] = useState('text');
  const [preview, setPreview] = useState<ScheduleEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState('');
  const parse = async () => {
    if (!data.material.trim()) return;
    if (showcase) {
      setPreview(parseScheduleMaterial(data.material));
      setSource('本地规则识别 · 核对后加入日历');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/ai/schedule', {
        method: 'POST',
        signal: AbortSignal.timeout(20000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          material: data.material,
          referenceDate: localDate(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const result = (await response.json()) as ApiResult;
      if (!response.ok) throw new Error(result.error || '识别失败');
      setPreview(result.events);
      setSource(
        result.source === 'ai'
          ? 'AI 识别结果，请核对后保存。'
          : (result.warning ?? '本地规则识别，请确认信息。'),
      );
    } catch {
      setPreview(parseScheduleMaterial(data.material));
      setSource('服务暂时不可用，已使用本地规则识别，请补全日期与时间。');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageTitle title="日程识别" />
      <div className="section-tabs">
        <button
          className={tab === 'text' ? 'active' : ''}
          onClick={() => setTab('text')}
        >
          文字日程
        </button>
        <button
          className={tab === 'campus' ? 'active' : ''}
          onClick={() => setTab('campus')}
        >
          课程与考试导入
        </button>
      </div>
      <div hidden={tab !== 'text'} className="import-columns">
        <section className="paper-panel">
          <h2>把安排放在这里</h2>
          <label>
            日程材料
            <textarea
              className="large-textarea"
              placeholder={
                '例如：明天 14:00–16:00 图书馆自习\n周五 09:00–10:00 设计小组会议，地点：教学楼 B203'
              }
              value={data.material}
              maxLength={12000}
              onChange={(e) =>
                setData((d) => ({ ...d, material: e.target.value }))
              }
            />
          </label>
          <div className="button-row">
            <button
              className="primary-button"
              disabled={busy || !data.material.trim()}
              onClick={() => void parse()}
            >
              <CalendarSearch size={17} />
              {busy ? '正在识别…' : '识别日程'}
            </button>
            <label className="secondary-button upload-label">
              <Upload size={16} />
              上传文本
              <input
                type="file"
                accept=".txt,.csv"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    if (file.size > 200000) {
                      notify('请选择 200 KB 以内的文本。');
                      return;
                    }
                    void file
                      .text()
                      .then((text) =>
                        setData((d) => ({
                          ...d,
                          material: text.slice(0, 12000),
                        })),
                      )
                      .catch(() => notify('无法读取文件。'));
                  }
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          <p className="muted small">
            识别不会直接修改日历。不确定的信息留给你确认。
          </p>
        </section>
        <section className="paper-panel">
          <div className="section-heading">
            <h2>确认这些安排</h2>
            <span>{preview.length} 项</span>
          </div>
          {source && <p className="inline-message">{source}</p>}
          {!preview.length ? (
            <div className="empty-compact">
              识别结果会出现在这里。
              <br />
              核对日期和起止时间后，再放进日历。
            </div>
          ) : (
            <>
              <div className="preview-scroll">
                {preview.map((event, i) => (
                  <div className="preview-event" key={event.id}>
                    <EventForm
                      event={event}
                      onChange={(next) =>
                        setPreview((list) =>
                          list.map((e, index) => (index === i ? next : e)),
                        )
                      }
                    />
                    <button
                      className="text-button danger"
                      onClick={() =>
                        setPreview((list) =>
                          list.filter((_, index) => index !== i),
                        )
                      }
                    >
                      <Trash2 size={15} />
                      移除这项
                    </button>
                  </div>
                ))}
              </div>
              {!preview.every(validEvent) && (
                <p className="validation">
                  请补全每项标题、日期和时间，结束时间需晚于开始时间。
                </p>
              )}
              <button
                className="primary-button full-width"
                disabled={!preview.every(validEvent)}
                onClick={() => {
                  setData((d) => ({
                    ...d,
                    events: mergeEvents(d.events, preview),
                  }));
                  setPreview([]);
                  notify('日程已保存，重复条目会自动跳过。');
                  onCalendar();
                }}
              >
                <Check size={16} />
                确认写入日历
              </button>
            </>
          )}
        </section>
      </div>
      <div hidden={tab !== 'campus'} className="campus-import">
        <CampusSyncPanel
          data={data.campus}
          onChange={(campus) => setData((d) => ({ ...d, campus }))}
        />
        <button className="secondary-button" onClick={onCalendar}>
          查看日历
          <ArrowRight size={16} />
        </button>
      </div>
    </>
  );
}
