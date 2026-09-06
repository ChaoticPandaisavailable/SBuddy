'use client';
import { flushSync } from 'react-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  FileText,
  Hand,
  Mic,
  Plus,
  RotateCcw,
  Square,
  Timer,
  Upload,
} from 'lucide-react';
import { useStudy } from './provider';
import { FocusControls, PageTitle, type Tool } from './app';
import { CoursewareTool } from './courseware-tool';
import {
  useGestureCamera,
  type CompanionGesture,
} from '@/hooks/use-gesture-camera';
import { type Note } from '@/lib/sbuddy-state';
import { newCampusId, upsertTodo } from '@/lib/campus-data';
import { beginDictation, type SpeechConstructor } from '@/lib/live-dictation';
import { localNoteSummary } from '@/lib/showcase';

type ApiResult = {
  error?: string;
  source: string;
  warning?: string;
  transcript: string;
  summary: string;
  highlights: string[];
  actionItems: string[];
};
export function Tools({
  active,
  tool,
  onSelect,
}: {
  active: boolean;
  tool: Tool;
  onSelect: (tool: Tool) => void;
}) {
  const cards = [
    {
      id: 'courseware',
      title: '课件整理',
      note: '梳理重点与复习提纲',
      icon: BookOpen,
      color: 'sage',
    },
    {
      id: 'notes',
      title: '纪要',
      note: '录音与文字整理',
      icon: FileText,
      color: 'sand',
    },
    {
      id: 'gesture',
      title: '手势识别',
      note: '摄像头互动',
      icon: Hand,
      color: 'rose',
    },
    {
      id: 'focus',
      title: '番茄钟',
      note: '专注计时',
      icon: Timer,
      color: 'blue',
    },
  ] as const;
  return (
    <>
      <div hidden={!!tool}>
        <PageTitle title="工具" />
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
      <div hidden={tool !== 'courseware'}>
        <CoursewareTool />
      </div>
      <div hidden={tool !== 'notes'}>
        <NotesTool active={active && tool === 'notes'} />
      </div>
      <div hidden={tool !== 'gesture'}>
        <GestureTool active={active && tool === 'gesture'} />
      </div>
      <div hidden={tool !== 'focus'}>
        {active && tool === 'focus' && <FocusTool />}
      </div>
    </>
  );
}
function NotesTool({ active }: { active: boolean }) {
  const { data, setData, notify, showcase } = useStudy();
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [dictating, setDictating] = useState(false);
  const [interim, setInterim] = useState('');
  const stopDictation = useRef<(() => void) | undefined>(undefined);
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
  const endDictation = useCallback(() => {
    const stop = stopDictation.current;
    stopDictation.current = undefined;
    // Release the controls before a browser's native speech abort callback runs.
    flushSync(() => {
      setDictating(false);
      setInterim('');
      setStatus('听写已停止，已识别的文字已保留，可以继续编辑。');
    });
    stop?.();
  }, []);
  const startDictation = () => {
    const speechWindow = window as typeof window & {
      SpeechRecognition?: SpeechConstructor;
      webkitSpeechRecognition?: SpeechConstructor;
    };
    const Constructor =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Constructor) {
      setStatus('此浏览器不支持实时听写，请输入或粘贴文字，或使用录音转写。');
      return;
    }
    try {
      setDictating(true);
      setStatus('正在听写；已识别文字自动追加，离开此工具会停止。');
      stopDictation.current = beginDictation(Constructor, {
        onFinal: (text) =>
          setData((d) => ({
            ...d,
            note: {
              ...d.note,
              transcript: (
                d.note.transcript +
                (d.note.transcript ? '\n' : '') +
                text
              ).slice(0, 50000),
            },
          })),
        onInterim: setInterim,
        onEnd: (message) => {
          setDictating(false);
          setStatus(message);
        },
      });
    } catch {
      setDictating(false);
      setStatus('听写无法启动，请输入文字或使用录音转写。');
    }
  };
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
    stopDictation.current?.();
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
      stopDictation.current?.();
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
    if (showcase) {
      patch(localNoteSummary(note.transcript));
      setStatus('本地速记 · 已提取原文中的摘要与待办，未调用 AI。');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/ai/summary', {
        signal: AbortSignal.timeout(20000),
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
      <PageTitle title="纪要" />
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
              disabled={busy || dictating}
              onClick={() => (recording ? stop() : void start())}
            >
              {recording ? <Square size={16} /> : <Mic size={16} />}{' '}
              {recording ? '停止录音' : '开始录音'}
            </button>
            <button
              className="secondary-button"
              disabled={busy || recording}
              onClick={() => (dictating ? endDictation() : startDictation())}
            >
              {dictating ? '停止听写' : '实时听写'}
            </button>
            <label className="text-button upload-label">
              <Upload size={16} />
              上传录音
              <input
                disabled={busy || recording || dictating}
                type="file"
                accept="audio/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    if (file.size > 20 * 1024 * 1024)
                      notify('录音请控制在 20 MB 以内。');
                    else void transcribe(file);
                  }
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          {interim && (
            <p className="inline-message" aria-live="polite">
              正在识别：{interim}
            </p>
          )}
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
                disabled={busy || recording || dictating}
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
            disabled={busy || recording || dictating || !note.transcript.trim()}
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
  const [feedback, setFeedback] = useState('');
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
          {(feedback ||
            ['denied', 'error', 'unsupported'].includes(cameraStatus)) && (
            <p className="inline-message" aria-live="polite">
              {['denied', 'error', 'unsupported'].includes(cameraStatus)
                ? '摄像头或识别模型不可用，请检查权限，或到番茄钟工具操作。'
                : feedback}
            </p>
          )}
        </section>
      </div>
    </>
  );
}
function FocusTool() {
  const { data, setData, showcase } = useStudy();
  const [minutes, setMinutes] = useState(data.settings.focusMinutes);
  return (
    <>
      <PageTitle title="番茄钟" />
      <div className="focus-workspace">
        <section className="focus-main">
          <FocusControls minutes={minutes} />
          <div className="button-row centered focus-presets">
            {(showcase ? [1, 10, 25] : [10, 25, 45]).map((m) => (
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
                    ...(feedback === 'tired' ||
                    feedback === 'steady' ||
                    feedback === 'ready'
                      ? {
                          studyProfile: {
                            energy:
                              feedback === 'tired'
                                ? 1
                                : feedback === 'steady'
                                  ? 3
                                  : 5,
                            updatedAt: new Date().toISOString(),
                          },
                        }
                      : {}),
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
                <option value="ready">精力充足，还想继续</option>
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
