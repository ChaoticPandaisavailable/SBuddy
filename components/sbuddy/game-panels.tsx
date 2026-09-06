'use client';
import { useState } from 'react';
import {
  CalendarDays,
  Check,
  ChevronRight,
  FileText,
  Timer,
  X,
  Plus,
} from 'lucide-react';
import { useStudy } from './provider';
import { FocusControls, type Page, type Tool } from './app';
import type { ScheduleEvent } from '@/lib/schedule-parser';
import { localNoteSummary } from '@/lib/showcase';
import { newCampusId, upsertTodo } from '@/lib/campus-data';

type Navigate = (page: Page, tool?: Tool) => void;
export function GameAgenda({
  events,
  navigate,
}: {
  events: ScheduleEvent[];
  navigate: Navigate;
}) {
  const { data, setData } = useStudy();
  const todos = data.campus.todos
    .filter((t) => !t.completedAt)
    .sort((a, b) => (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999'));
  const agenda = events.filter((e) => e.source !== 'campus-todo');
  return (
    <aside
      className="game-sidebar game-sidebar-agenda"
      aria-label="当日日程与待办"
    >
      <section className="game-widget">
        <div className="game-widget-heading">
          <h2>
            <CalendarDays size={15} />
            当日日程
          </h2>
          <button
            className="icon-button"
            aria-label="查看日历"
            onClick={() => navigate('daily')}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="game-widget-list">
          {agenda.length ? (
            agenda.map((event) => (
              <div className="game-agenda-item" key={event.id}>
                <time>
                  {event.time}–{event.end}
                </time>
                <strong>{event.title}</strong>
                {event.location && <small>{event.location}</small>}
              </div>
            ))
          ) : (
            <p className="game-widget-empty">今天暂无安排</p>
          )}
        </div>
      </section>
      <section className="game-widget">
        <div className="game-widget-heading">
          <h2>
            <Check size={15} />
            待办
          </h2>
          <span>{todos.length}</span>
        </div>
        <div className="game-widget-list">
          {todos.length ? (
            todos.map((todo) => (
              <label className="game-todo-item" key={todo.id}>
                <input
                  type="checkbox"
                  checked={false}
                  aria-label={'完成待办 ' + todo.title}
                  onChange={() =>
                    setData((d) => ({
                      ...d,
                      campus: {
                        ...d.campus,
                        todos: d.campus.todos.map((t) =>
                          t.id === todo.id
                            ? {
                                ...t,
                                completedAt: new Date().toISOString(),
                                updatedAt: new Date().toISOString(),
                              }
                            : t,
                        ),
                      },
                    }))
                  }
                />
                <span>
                  {todo.title}
                  {todo.dueAt && (
                    <small>
                      {new Date(todo.dueAt).toLocaleString('zh-CN', {
                        month: 'numeric',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </small>
                  )}
                </span>
              </label>
            ))
          ) : (
            <p className="game-widget-empty">暂无待办</p>
          )}
        </div>
      </section>
    </aside>
  );
}
export function GameTools({
  panel,
  onClose,
}: {
  panel?: 'focus' | 'notes';
  onClose: () => void;
}) {
  const { data, setData } = useStudy();
  const [minutes, setMinutes] = useState(data.settings.focusMinutes);
  const running = !!data.focus && data.focus.status !== 'complete';
  const record = data.focusHistory.find((item) => item.id === data.focus?.id);
  if (!panel) return null;
  return (
    <aside
      className="game-sidebar game-sidebar-tools"
      aria-label="学习工具组件"
    >
      {panel === 'focus' ? (
        <section className="game-widget scene-focus-widget">
          <div className="game-widget-heading">
            <h2>
              <Timer size={15} />
              番茄钟
            </h2>
            <button
              className="icon-button"
              aria-label="收起番茄钟"
              onClick={onClose}
            >
              <X size={16} />
            </button>
          </div>
          {!running && (
            <label className="scene-focus-duration">
              时长
              <input
                aria-label="场景专注分钟"
                type="number"
                min={1}
                max={180}
                value={minutes}
                onChange={(e) =>
                  setMinutes(
                    Math.max(1, Math.min(180, Number(e.target.value) || 1)),
                  )
                }
              />
              分钟
            </label>
          )}
          <FocusControls minutes={minutes} />
          {record && !running && (
            <output className="scene-note-status">
              已记录 {record.minutes} 分钟专注
            </output>
          )}
        </section>
      ) : (
        <section className="game-widget scene-notes-widget">
          <div className="game-widget-heading">
            <h2>
              <FileText size={15} />
              纪要
            </h2>
            <button
              className="icon-button"
              aria-label="收起纪要"
              onClick={onClose}
            >
              <X size={16} />
            </button>
          </div>
          <textarea
            aria-label="随手记纪要"
            placeholder="随手记下重点…"
            value={data.note.transcript}
            maxLength={50000}
            onChange={(e) =>
              setData((d) => ({
                ...d,
                note: { ...d.note, transcript: e.target.value },
              }))
            }
          />
          <button
            className="secondary-button scene-note-organize"
            disabled={!data.note.transcript.trim()}
            onClick={() =>
              setData((d) => ({
                ...d,
                note: { ...d.note, ...localNoteSummary(d.note.transcript) },
              }))
            }
          >
            整理重点
          </button>
          {data.note.summary && (
            <div className="scene-note-result" aria-label="场景纪要结果">
              <p className="scene-note-status">
                {data.note.source === 'ai' ? 'AI 整理' : '本地速记'}
              </p>
              <p>{data.note.summary}</p>
              {data.note.actionItems.map((text, i) => (
                <div className="scene-note-action" key={i}>
                  <span>{text}</span>
                  <button
                    className="icon-button"
                    aria-label={'加入待办 ' + text}
                    disabled={data.note.addedActions.includes(i)}
                    onClick={() =>
                      setData((d) => {
                        const now = new Date().toISOString();
                        return {
                          ...d,
                          campus: d.campus.todos.some(
                            (t) => t.title === text && !t.completedAt,
                          )
                            ? d.campus
                            : upsertTodo(d.campus, {
                                id: newCampusId('todo'),
                                title: text,
                                createdAt: now,
                                updatedAt: now,
                                reminderTimes: [],
                              }),
                          note: {
                            ...d.note,
                            addedActions: [
                              ...new Set([...d.note.addedActions, i]),
                            ],
                          },
                        };
                      })
                    }
                  >
                    {data.note.addedActions.includes(i) ? (
                      <Check size={15} />
                    ) : (
                      <Plus size={15} />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </aside>
  );
}
