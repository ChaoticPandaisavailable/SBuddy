'use client';

import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  FileText,
  Hand,
  RotateCcw,
  Timer,
} from 'lucide-react';
import { useStudy } from './provider';
import { FocusControls, PageTitle, type Tool } from './app';
import { CoursewareTool } from './courseware-tool';
import { NotesTool } from './notes-tool';
import {
  useGestureCamera,
  type CompanionGesture,
} from '@/hooks/use-gesture-camera';

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
