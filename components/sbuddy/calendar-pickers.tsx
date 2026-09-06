'use client';
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Dialog } from './app';
import { calendarDate, monthDays, moveMonth } from '@/lib/calendar-layout';
import { localDate } from '@/lib/sbuddy-state';

export function DatePicker({
  value,
  monthOnly = false,
  onChange,
  onClose,
}: {
  value: string;
  monthOnly?: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
}) {
  const [anchor, setAnchor] = useState(() => calendarDate(value));
  const [step, setStep] = useState<'year' | 'month' | 'day'>(
    monthOnly ? 'year' : 'day',
  );
  const [yearPage, setYearPage] = useState(
    () => Math.floor(anchor.getFullYear() / 12) * 12,
  );
  const [selected, setSelected] = useState(value);
  return (
    <Dialog
      title={
        step === 'year'
          ? '选择年份'
          : step === 'month'
            ? '选择月份'
            : '选择日期'
      }
      className="nero-picker"
      onClose={onClose}
    >
      <div className="nero-picker-heading">
        <button
          type="button"
          className="icon-button"
          aria-label="上一组"
          onClick={() =>
            step === 'year'
              ? setYearPage(yearPage - 12)
              : setAnchor(
                  step === 'month'
                    ? new Date(
                        anchor.getFullYear() - 1,
                        anchor.getMonth(),
                        1,
                        12,
                      )
                    : moveMonth(anchor, -1),
                )
          }
        >
          <ChevronLeft size={18} />
        </button>
        <button
          type="button"
          onClick={() => setStep(step === 'day' ? 'month' : 'year')}
        >
          {anchor.getFullYear()}年
          {step === 'day' ? `${anchor.getMonth() + 1}月` : ''}
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="下一组"
          onClick={() =>
            step === 'year'
              ? setYearPage(yearPage + 12)
              : setAnchor(
                  step === 'month'
                    ? new Date(
                        anchor.getFullYear() + 1,
                        anchor.getMonth(),
                        1,
                        12,
                      )
                    : moveMonth(anchor, 1),
                )
          }
        >
          <ChevronRight size={18} />
        </button>
      </div>
      {step === 'year' ? (
        <div className="nero-picker-grid">
          {Array.from({ length: 12 }, (_, i) => yearPage + i).map((y) => (
            <button
              type="button"
              key={y}
              disabled={y < 2000 || y > 2100}
              aria-pressed={y === anchor.getFullYear()}
              onClick={() => {
                setAnchor(new Date(y, anchor.getMonth(), 1, 12));
                setStep('month');
              }}
            >
              {y}年
            </button>
          ))}
        </div>
      ) : step === 'month' ? (
        <div className="nero-picker-grid">
          {Array.from({ length: 12 }, (_, i) => i).map((m) => (
            <button
              type="button"
              key={m}
              aria-pressed={m === anchor.getMonth()}
              onClick={() => {
                const d = new Date(anchor.getFullYear(), m, 1, 12);
                setAnchor(d);
                setSelected(localDate(d));
                if (!monthOnly) setStep('day');
              }}
            >
              {m + 1}月
            </button>
          ))}
        </div>
      ) : (
        <div className="nero-date-picker">
          {'日一二三四五六'.split('').map((d) => (
            <span key={d}>{d}</span>
          ))}
          {monthDays(anchor).map((d) => (
            <button
              type="button"
              key={localDate(d)}
              className={d.getMonth() !== anchor.getMonth() ? 'outside' : ''}
              aria-label={localDate(d)}
              aria-pressed={localDate(d) === selected}
              onClick={() => setSelected(localDate(d))}
            >
              {d.getDate()}
            </button>
          ))}
        </div>
      )}
      <div className="nero-picker-actions">
        <button type="button" onClick={onClose}>
          取消
        </button>
        <button
          type="button"
          disabled={step === 'year'}
          onClick={() => {
            onChange(
              monthOnly
                ? localDate(
                    new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12),
                  )
                : selected,
            );
            onClose();
          }}
        >
          确定
        </button>
      </div>
    </Dialog>
  );
}
export function TimePicker({
  value,
  onChange,
  onClose,
}: {
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
}) {
  const [hour, setHour] = useState(value.slice(0, 2)),
    [minute, setMinute] = useState(value.slice(3));
  return (
    <Dialog title="选择时间" className="nero-picker" onClose={onClose}>
      <div className="nero-time-wheels">
        <label>
          时
          <select
            size={5}
            aria-label="小时"
            value={hour}
            onChange={(e) => setHour(e.target.value)}
          >
            {Array.from({ length: 24 }, (_, i) =>
              String(i).padStart(2, '0'),
            ).map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <span>:</span>
        <label>
          分
          <select
            size={5}
            aria-label="分钟"
            value={minute}
            onChange={(e) => setMinute(e.target.value)}
          >
            {Array.from({ length: 60 }, (_, i) =>
              String(i).padStart(2, '0'),
            ).map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="nero-picker-actions">
        <button type="button" onClick={onClose}>
          取消
        </button>
        <button
          type="button"
          onClick={() => {
            onChange(`${hour}:${minute}`);
            onClose();
          }}
        >
          确定
        </button>
      </div>
    </Dialog>
  );
}
