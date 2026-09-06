'use client';
import { flushSync } from 'react-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, FileText, Mic, Plus, Square, Upload } from 'lucide-react';
import { useStudy } from './provider';
import { PageTitle } from './app';
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
export function NotesTool({
  active,
  compact = false,
}: {
  active: boolean;
  compact?: boolean;
}) {
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
      setStatus('正在听写；文字自动追加，收起窗口或离开此工具会停止。');
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
        file instanceof File
          ? file.name
          : `recording.${file.type.includes('mp4') ? 'm4a' : file.type.includes('ogg') ? 'ogg' : file.type.includes('wav') ? 'wav' : 'webm'}`,
      );
      const response = await fetch('/api/ai/transcribe', {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(190000),
      });
      if (!response.headers.get('content-type')?.includes('application/json'))
        throw new Error(
          response.status === 413
            ? '录音超出当前服务器上传限制，请缩短后再试。'
            : '转写服务暂时未响应，请稍后重试；录音仍可下载。',
        );
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
      setStatus('正在录音，收起窗口或离开纪要页面会自动停止。');
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
        signal: AbortSignal.timeout(70000),
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
    <div className={compact ? 'notes-tool notes-tool-compact' : 'notes-tool'}>
      {!compact && <PageTitle title="纪要" />}
      <div className="notes-columns">
        <section className="paper-panel">
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
          <label hidden={compact}>
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
              placeholder={
                compact
                  ? '点击实时听写，或录音后转写；文字可在这里修改。'
                  : '在这里输入或粘贴文字，也可以录音后转写。'
              }
              value={note.transcript}
              maxLength={50000}
              onChange={(e) => patch({ transcript: e.target.value })}
            />
          </label>
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
        <section
          className="paper-panel notes-result"
          hidden={compact && !note.summary}
        >
          <h2>这一页的重点</h2>
          {note.summary ? (
            <div>
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
            </div>
          ) : (
            <div className="empty-compact">
              还没有纪要。
              <br />
              从一段真实的记录开始吧。
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
