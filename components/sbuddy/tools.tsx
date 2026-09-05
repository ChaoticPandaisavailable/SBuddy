'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarSearch,
  Check,
  FileText,
  Hand,
  Mic,
  Plus,
  RotateCcw,
  Square,
  Timer,
  Trash2,
  Upload,
} from 'lucide-react';
import { useStudy } from './provider';
import { BuddyStage, FocusControls, PageTitle, type Tool } from './app';
import { EventForm } from './daily';
import { CampusSyncPanel } from '@/components/campus-calendar-workspace';
import {
  useGestureCamera,
  type CompanionGesture,
} from '@/hooks/use-gesture-camera';
import {
  localDate,
  mergeEvents,
  validEvent,
  type Note,
} from '@/lib/sbuddy-state';
import {
  parseScheduleMaterial,
  type ScheduleEvent,
} from '@/lib/schedule-parser';
import { newCampusId, upsertTodo } from '@/lib/campus-data';

type ApiResult = {
  error?: string;
  source: string;
  warning?: string;
  events: ScheduleEvent[];
  transcript: string;
  summary: string;
  highlights: string[];
  actionItems: string[];
};
export function Tools({
  active,
  tool,
  onSelect,
  onCalendar,
}: {
  active: boolean;
  tool: Tool;
  onSelect: (tool: Tool) => void;
  onCalendar: () => void;
}) {
  const cards = [
    {
      id: 'schedule',
      title: '日程识别',
      note: '把课表、通知和文字，变成清晰的安排。',
      icon: CalendarSearch,
      color: 'sage',
    },
    {
      id: 'notes',
      title: '纪要',
      note: '认真听就好，重要的事帮你记下来。',
      icon: FileText,
      color: 'sand',
    },
    {
      id: 'gesture',
      title: '手势识别',
      note: '挥挥手，就能和搭子打个招呼。',
      icon: Hand,
      color: 'rose',
    },
    {
      id: 'focus',
      title: '番茄钟',
      note: '留一小段时间，只做眼前这一件事。',
      icon: Timer,
      color: 'blue',
    },
  ] as const;
  return (
    <>
      <div hidden={!!tool}>
        <PageTitle
          title="让学习轻松一点"
          description="一些顺手的小工具，留更多心思给重要的事。"
        />
        <div className="tools-grid">
          {cards.map((card) => (
            <button
              className={'tool-card ' + card.color}
              key={card.id}
              onClick={() => onSelect(card.id)}
            >
              <span className="tool-illustration">
                <card.icon strokeWidth={1.2} />
              </span>
              <div>
                <h2>{card.title}</h2>
                <p>{card.note}</p>
              </div>
              <ArrowRight size={22} />
            </button>
          ))}
        </div>
        <p className="tools-footnote">
          工具与你的日历和搭子相连，准备好就开始吧。
        </p>
      </div>
      {tool && (
        <button
          className="text-button back-button"
          onClick={() => onSelect(undefined)}
        >
          <ArrowLeft size={17} />
          返回工具
        </button>
      )}
      <div hidden={tool !== 'schedule'}>
        <ScheduleTool onCalendar={onCalendar} />
      </div>
      <div hidden={tool !== 'notes'}>
        <NotesTool active={active && tool === 'notes'} />
      </div>
      <div hidden={tool !== 'gesture'}>
        <GestureTool active={active && tool === 'gesture'} />
      </div>
      <div hidden={tool !== 'focus'}>
        <FocusTool />
      </div>
    </>
  );
}
function ScheduleTool({ onCalendar }: { onCalendar: () => void }) {
  const { data, setData, notify } = useStudy();
  const [tab, setTab] = useState('text');
  const [preview, setPreview] = useState<ScheduleEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState('');
  const parse = async () => {
    if (!data.material.trim()) return;
    setBusy(true);
    try {
      const response = await fetch('/api/ai/schedule', {
        method: 'POST',
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
      <PageTitle
        title="日程识别"
        description="从一段文字、一张课表开始，把安排收进日历。"
      />
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
          课表与考试 · 采集 / 文件 / 截图
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
function NotesTool({ active }: { active: boolean }) {
  const { data, setData, notify } = useStudy();
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState('');
  const [status, setStatus] = useState('');
  const recorder = useRef<MediaRecorder | undefined>(undefined);
  const stream = useRef<MediaStream | undefined>(undefined);
  const chunks = useRef<Blob[]>([]);
  const mounted = useRef(true);
  const session = useRef(0);
  const note = data.note;
  const patch = (value: Partial<Note>) =>
    setData((d) => ({ ...d, note: { ...d.note, ...value } }));
  const transcribe = async (file: File | Blob) => {
    setBusy(true);
    setStatus('正在转写录音…');
    try {
      const form = new FormData();
      form.set(
        'audio',
        file,
        file instanceof File ? file.name : 'recording.webm',
      );
      const response = await fetch('/api/ai/transcribe', {
        method: 'POST',
        body: form,
      });
      const result = (await response.json()) as ApiResult;
      if (!response.ok || !result.transcript)
        throw new Error(result.error || '转写失败');
      patch({
        transcript: result.transcript,
        summary: '',
        highlights: [],
        actionItems: [],
        addedActions: [],
      });
      setStatus('转写完成，可以编辑文字并整理纪要。');
    } catch (error) {
      setStatus(
        (error instanceof Error ? error.message : '转写失败') +
          ' 你也可以直接输入或粘贴文字。',
      );
    } finally {
      setBusy(false);
    }
  };
  const stop = useCallback(() => {
    session.current++;
    if (recorder.current?.state === 'recording') recorder.current.stop();
    stream.current?.getTracks().forEach((t) => t.stop());
    setRecording(false);
  }, []);
  useEffect(() => {
    if (!active) queueMicrotask(stop);
  }, [active, stop]);
  const invalidateSession = useCallback(() => {
    session.current++;
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      invalidateSession();
      stream.current?.getTracks().forEach((t) => t.stop());
      if (recorder.current?.state === 'recording') recorder.current.stop();
    };
  }, [invalidateSession]);
  useEffect(
    () => () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    },
    [audioUrl],
  );
  const start = async () => {
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      setStatus('浏览器不支持录音，请上传音频或直接输入文字。');
      return;
    }
    const token = ++session.current;
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current || session.current !== token) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      chunks.current = [];
      const next = new MediaRecorder(media);
      recorder.current = next;
      next.ondataavailable = (e) => {
        if (e.data.size) chunks.current.push(e.data);
      };
      next.onstop = () => {
        const blob = new Blob(chunks.current, {
          type: next.mimeType || 'audio/webm',
        });
        if (mounted.current) {
          setAudioUrl(URL.createObjectURL(blob));
          setStatus('录音已保留在当前页面，可下载或点击转写。');
        }
      };
      next.start(1000);
      setRecording(true);
      setStatus('正在录音，离开纪要页面会自动停止。');
    } catch {
      setStatus('麦克风未能开启，请检查权限，或改用文字输入。');
    }
  };
  const summarize = async () => {
    if (!note.transcript.trim()) return;
    setBusy(true);
    try {
      const response = await fetch('/api/ai/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: note.title,
          transcript: note.transcript,
        }),
      });
      const result = (await response.json()) as ApiResult;
      if (!response.ok) throw new Error(result.error || '整理失败');
      patch({
        summary: result.summary,
        highlights: result.highlights,
        actionItems: result.actionItems,
        addedActions: [],
        source: result.source,
      });
      setStatus(result.warning || '纪要已整理并保存在本机。');
    } catch {
      const sentences = note.transcript
        .split(/(?<=[。！？!?])|\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      patch({
        summary: sentences.slice(0, 2).join(''),
        highlights: sentences.slice(0, 3),
        actionItems: sentences
          .filter((s) => /需要|完成|准备|负责|截止|下一步/.test(s))
          .slice(0, 8),
        addedActions: [],
        source: 'fallback',
      });
      setStatus('服务暂时不可用，已按原文生成本地速记摘要。');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageTitle
        title="把重要的事记下来"
        description="听课、开会，或者记录一个刚刚冒出的想法。"
      />
      <div className="notes-columns">
        <section className="paper-panel">
          <label>
            记录标题
            <input
              placeholder="给这次记录起个名字"
              value={note.title}
              onChange={(e) => patch({ title: e.target.value })}
            />
          </label>
          <label>
            文字稿
            <textarea
              className="large-textarea"
              placeholder="在这里输入或粘贴文字，也可以录音后转写。"
              value={note.transcript}
              maxLength={50000}
              onChange={(e) => patch({ transcript: e.target.value })}
            />
          </label>
          <div className="button-row">
            <button
              className={
                recording ? 'secondary-button danger' : 'secondary-button'
              }
              disabled={busy}
              onClick={() => (recording ? stop() : void start())}
            >
              {recording ? <Square size={16} /> : <Mic size={16} />}{' '}
              {recording ? '停止录音' : '开始录音'}
            </button>
            <label className="text-button upload-label">
              <Upload size={16} />
              上传录音
              <input
                disabled={busy || recording}
                type="file"
                accept="audio/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    if (file.size > 25 * 1024 * 1024)
                      notify('录音请控制在 25 MB 以内。');
                    else void transcribe(file);
                  }
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          {audioUrl && (
            <div className="recorded-audio">
              <audio controls src={audioUrl}>
                <track kind="captions" />
              </audio>
              <a
                className="text-button"
                href={audioUrl}
                download="sbuddy-recording.webm"
              >
                下载录音
              </a>
              <button
                className="secondary-button"
                disabled={busy || recording}
                onClick={() =>
                  void fetch(audioUrl)
                    .then((r) => r.blob())
                    .then(transcribe)
                }
              >
                转写这段录音
              </button>
            </div>
          )}
          {status && (
            <p className="inline-message" aria-live="polite">
              {status}
            </p>
          )}
          <button
            className="primary-button full-width"
            disabled={busy || recording || !note.transcript.trim()}
            onClick={() => void summarize()}
          >
            <FileText size={17} />
            {busy ? '正在处理…' : '整理纪要'}
          </button>
        </section>
        <section className="paper-panel notes-result">
          <h2>这一页的重点</h2>
          {note.summary ? (
            <>
              <span className="pill">
                {note.source === 'ai' ? 'AI 整理' : '本地速记'}
              </span>
              <p className="summary-text">{note.summary}</p>
              <h3>关键要点</h3>
              <ul>
                {note.highlights.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
              <h3>下一步行动</h3>
              {note.actionItems.length ? (
                note.actionItems.map((text, i) => (
                  <div className="action-row" key={i}>
                    <p>{text}</p>
                    <button
                      className="icon-button"
                      aria-label={'加入待办 ' + text}
                      disabled={note.addedActions.includes(i)}
                      onClick={() =>
                        setData((d) => {
                          const existing = d.campus.todos.some(
                            (t) => t.title === text && !t.completedAt,
                          );
                          const now = new Date().toISOString();
                          return {
                            ...d,
                            campus: existing
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
                      {note.addedActions.includes(i) ? (
                        <Check size={17} />
                      ) : (
                        <Plus size={17} />
                      )}
                    </button>
                  </div>
                ))
              ) : (
                <p className="muted">原文中没有明确的行动项。</p>
              )}
            </>
          ) : (
            <div className="empty-compact">
              还没有纪要。
              <br />
              从一段真实的记录开始吧。
            </div>
          )}
        </section>
      </div>
    </>
  );
}
function GestureTool({ active }: { active: boolean }) {
  const { data, startFocus, toggleFocus, finishFocus, notify } = useStudy();
  const [feedback, setFeedback] = useState('准备好后，开启摄像头。');
  const buddy = data.buddies.find((b) => b.id === data.activeBuddyId)!;
  const handle = (gesture: CompanionGesture) => {
    if (gesture === 'open_palm')
      setFeedback(buddy.name + '：我在，今天也陪你一起。');
    if (gesture === 'victory') {
      startFocus(10);
      setFeedback('开始十分钟的小专注。');
    }
    if (gesture === 'closed_fist') {
      toggleFocus();
      setFeedback('已切换专注暂停 / 继续。');
    }
    if (gesture === 'thumb_up') {
      finishFocus();
      setFeedback('辛苦啦，给认真开始的你一个赞。');
    }
    if (gesture === 'thumb_down') {
      notify('累了就休息一会儿吧，准备好再继续。');
      setFeedback('先放松一下，没关系。');
    }
  };
  const {
    videoRef,
    status: cameraStatus,
    start: startCamera,
    stop: stopCamera,
  } = useGestureCamera({ onGesture: handle });
  useEffect(() => {
    if (!active) queueMicrotask(stopCamera);
  }, [active, stopCamera]);
  return (
    <>
      <PageTitle
        title="挥挥手，我就在"
        description="摄像头画面只在浏览器内识别；离开此工具会自动关闭。"
      />
      <div className="gesture-columns">
        <section className="camera-panel">
          <video ref={videoRef} autoPlay muted playsInline />
          {cameraStatus !== 'active' && (
            <div className="camera-empty">
              <Hand size={48} />
              <p>用一个小手势，开始今天的陪伴</p>
            </div>
          )}
          <div className="camera-controls">
            <button
              className="primary-button"
              disabled={
                cameraStatus === 'loading' || cameraStatus === 'requesting'
              }
              onClick={() =>
                cameraStatus === 'active' ? stopCamera() : void startCamera()
              }
            >
              {cameraStatus === 'active'
                ? '关闭摄像头'
                : cameraStatus === 'loading' || cameraStatus === 'requesting'
                  ? '正在开启…'
                  : '开启摄像头'}
            </button>
          </div>
        </section>
        <section className="paper-panel">
          <h2>搭子能看懂这些</h2>
          {[
            ['张开手掌', '打个招呼'],
            ['剪刀手', '开始 10 分钟专注'],
            ['握拳', '暂停或继续'],
            ['点赞', '结束当前专注'],
            ['向下点赞', '告诉搭子有点累'],
          ].map(([name, action]) => (
            <div className="gesture-instruction" key={name}>
              <strong>{name}</strong>
              <span>{action}</span>
            </div>
          ))}
          <p className="inline-message" aria-live="polite">
            {['denied', 'error', 'unsupported'].includes(cameraStatus)
              ? '摄像头或识别模型不可用，请检查权限；所有操作也可使用页面按钮完成。'
              : feedback}
          </p>
          <FocusControls />
        </section>
      </div>
    </>
  );
}
function FocusTool() {
  const { data, setData, startFocus } = useStudy();
  const [minutes, setMinutes] = useState(data.settings.focusMinutes);
  const buddy =
    data.buddies.find(
      (b) => b.id === (data.focus?.buddyId ?? data.activeBuddyId),
    ) ?? data.buddies[0];
  return (
    <>
      <PageTitle
        title="这段时间，只做一件事"
        description="不用一次走很远。把眼前的一小步，交给现在。"
      />
      <div className="focus-workspace">
        <section className="focus-main">
          <BuddyStage
            buddy={buddy}
            animation={data.focus?.status === 'running' ? 'study' : 'idle'}
          />
          <h2>{buddy.name} 陪你专注</h2>
          <FocusControls />
          <div className="button-row centered focus-presets">
            {[10, 25, 45].map((m) => (
              <button
                className={
                  'secondary-button ' + (minutes === m ? 'selected' : '')
                }
                key={m}
                onClick={() => setMinutes(m)}
              >
                {m} 分钟
              </button>
            ))}
            <label>
              自定义
              <input
                aria-label="自定义专注分钟"
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
            </label>
          </div>
          <div className="button-row centered">
            <button
              className="primary-button"
              disabled={!!data.focus && data.focus.status !== 'complete'}
              onClick={() => startFocus(minutes)}
            >
              开始 {minutes} 分钟
            </button>
            <button
              className="text-button"
              onClick={() => {
                if (
                  !data.focus ||
                  data.focus.status === 'complete' ||
                  confirm('重置本轮计时？未完成时长不会计入记录。')
                )
                  setData((d) => ({ ...d, focus: undefined }));
              }}
            >
              <RotateCcw size={16} />
              重置
            </button>
          </div>
          {data.focusHistory.some((record) => record.id === data.focus?.id) && (
            <label className="focus-feedback">
              这一轮感觉如何？
              <select
                value={
                  data.focusHistory.find(
                    (record) => record.id === data.focus?.id,
                  )?.feedback ?? ''
                }
                onChange={(event) => {
                  const feedback = event.target.value;
                  const sessionId = data.focus?.id;
                  setData((d) => ({
                    ...d,
                    focusHistory: d.focusHistory.map((record) =>
                      record.id === sessionId
                        ? { ...record, feedback }
                        : record,
                    ),
                  }));
                }}
              >
                <option value="">记录一下这次的感受</option>
                <option value="steady">状态不错，节奏刚好</option>
                <option value="tired">有些累了，需要休息</option>
                <option value="distracted">容易分心，下次缩短一点</option>
              </select>
            </label>
          )}
          {data.focus?.status === 'complete' && (
            <p className="inline-message">
              这一轮完成了，默契和学习记录已经保存。
            </p>
          )}
        </section>
        <aside className="paper-panel focus-history">
          <h2>认真过的时光</h2>
          <p className="muted">每一小步，都算数。</p>
          {data.focusHistory.length ? (
            data.focusHistory
              .slice(-12)
              .reverse()
              .map((record) => (
                <div className="history-row" key={record.id}>
                  <div>
                    <strong>{record.minutes} 分钟</strong>
                    <small>
                      {data.buddies.find((b) => b.id === record.buddyId)
                        ?.name ?? '曾经的搭子'}{' '}
                      陪伴
                    </small>
                  </div>
                  <time>{new Date(record.at).toLocaleDateString('zh-CN')}</time>
                </div>
              ))
          ) : (
            <div className="empty-compact">
              第一段专注时光，
              <br />
              等你来点亮。
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
