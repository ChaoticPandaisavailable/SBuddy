'use client';
import { useState } from 'react';
import { BookOpen, Download, Upload } from 'lucide-react';
import { PageTitle } from './app';
import { useStudy } from './provider';
import {
  coursewareMarkdown,
  localCourseware,
  validCoursewareResult,
  type Courseware,
} from '@/lib/courseware';
import { readCoursewareFile } from '@/lib/courseware-file';

const empty: Courseware = { title: '', material: '' };
export function CoursewareTool() {
  const { data, setData, notify, showcase } = useStudy();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const courseware = data.courseware ?? empty;
  const patch = (value: Partial<Courseware>) =>
    setData((d) => ({
      ...d,
      courseware: { ...(d.courseware ?? empty), ...value },
    }));
  const organize = async () => {
    const snapshot = JSON.stringify(courseware),
      material = courseware.material,
      title = courseware.title;
    if (!material.trim()) return;
    if (showcase) {
      patch({
        result: localCourseware(material),
        source: '本地摘录提纲 · 未调用 AI',
        resultMaterial: material,
      });
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/ai/courseware', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, material }),
        signal: AbortSignal.timeout(70000),
      });
      const body = (await response.json()) as {
        error?: string;
        source?: string;
        warning?: string;
        result?: unknown;
      };
      if (!response.ok || !validCoursewareResult(body.result))
        throw new Error(body.error || '整理服务暂时不可用');
      const result = body.result,
        source =
          body.source === 'ai' ? 'AI 整理' : (body.warning ?? '本地摘录提纲');
      setData((d) =>
        JSON.stringify(d.courseware ?? empty) === snapshot
          ? {
              ...d,
              courseware: {
                title,
                material,
                result,
                source,
                resultMaterial: material,
              },
            }
          : d,
      );
    } catch {
      setData((d) =>
        JSON.stringify(d.courseware ?? empty) === snapshot
          ? {
              ...d,
              courseware: {
                title,
                material,
                result: localCourseware(material),
                source: '服务暂时不可用，当前为本地摘录提纲，未生成自测问题。',
                resultMaterial: material,
              },
            }
          : d,
      );
    } finally {
      setBusy(false);
    }
  };
  const upload = async (file: File) => {
    const snapshot = JSON.stringify(courseware);
    setBusy(true);
    setError('');
    try {
      const material = await readCoursewareFile(file);
      setData((d) =>
        JSON.stringify(d.courseware ?? empty) === snapshot
          ? {
              ...d,
              courseware: {
                ...(d.courseware ?? empty),
                title: file.name.replace(/\.[^.]+$/, '').slice(0, 120),
                material,
              },
            }
          : d,
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : '无法读取课件，请复制文字后粘贴。',
      );
    } finally {
      setBusy(false);
    }
  };
  const download = () => {
    try {
      const url = URL.createObjectURL(
        new Blob([coursewareMarkdown(courseware)], {
          type: 'text/markdown;charset=utf-8',
        }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download =
        (courseware.title || '课件整理').replace(/[<>:"/\\|?*]/g, '_') + '.md';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      notify('暂时无法导出，请复制整理结果。');
    }
  };
  const result = courseware.result;
  return (
    <>
      <PageTitle title="课件整理" />
      <div className="import-columns courseware-columns">
        <section className="paper-panel">
          <label>
            课件名称
            <input
              maxLength={120}
              value={courseware.title}
              disabled={busy}
              onChange={(e) => patch({ title: e.target.value })}
            />
          </label>
          <label>
            课件文字
            <textarea
              className="large-textarea"
              placeholder="粘贴课件内容，或导入 PPTX、TXT、Markdown。"
              maxLength={50000}
              value={courseware.material}
              disabled={busy}
              onChange={(e) => patch({ material: e.target.value })}
            />
          </label>
          <div className="button-row">
            <button
              className="primary-button"
              disabled={busy || !courseware.material.trim()}
              onClick={() => void organize()}
            >
              <BookOpen size={17} />
              {busy ? '正在处理…' : '整理课件'}
            </button>
            <label className="secondary-button upload-label">
              <Upload size={16} />
              导入课件
              <input
                type="file"
                aria-label="导入课件文件"
                accept=".pptx,.txt,.md"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) void upload(file);
                }}
              />
            </label>
          </div>
          <p className="muted small">
            PPTX 仅提取文字。PDF、旧版 PPT 或图片课件请先复制或识别文字后粘贴。
          </p>
          {error && (
            <p role="alert" className="inline-message">
              {error}
            </p>
          )}
        </section>
        <section
          className="paper-panel courseware-result"
          aria-label="课件整理结果"
        >
          <div className="section-heading">
            <h2>整理结果</h2>
            {result && (
              <button
                className="text-button"
                disabled={
                  busy || courseware.resultMaterial !== courseware.material
                }
                onClick={download}
              >
                <Download size={16} />
                导出
              </button>
            )}
          </div>
          {!result ? (
            <p className="empty-compact">整理后查看提纲、重点与自测问题。</p>
          ) : (
            <>
              <p className="inline-message">{courseware.source}</p>
              {courseware.resultMaterial !== courseware.material && (
                <output>资料已修改，请重新整理。</output>
              )}
              <h3>内容概览</h3>
              <p className="courseware-copy">{result.summary}</p>
              <h3>提纲</h3>
              {result.outline.map((section, i) => (
                <div className="courseware-section" key={i}>
                  <h4>{section.title}</h4>
                  <ul>
                    {section.points.map((point, j) => (
                      <li key={j}>{point}</li>
                    ))}
                  </ul>
                </div>
              ))}
              <h3>重点</h3>
              <ul>
                {result.keyPoints.map((point, i) => (
                  <li key={i}>{point}</li>
                ))}
              </ul>
              {result.questions.length > 0 && (
                <>
                  <h3>自测问题</h3>
                  <ol>
                    {result.questions.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ol>
                </>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}
