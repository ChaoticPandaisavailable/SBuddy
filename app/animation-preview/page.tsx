'use client';
/* oxlint-disable next/no-img-element -- Unmodified pixel-art reference on a local animation comparison page. */
import { useState } from 'react';
import { PixelCompanionCanvas } from '@/components/pixel-companion-canvas';
import {
  ANIMATION_CLIPS,
  type AnimationState,
} from '@/lib/companion-animation';
import { RIG_STATES } from '@/lib/companion-rig';
import type { RoomKind } from '@/lib/chibi-rig';

export default function AnimationPreview() {
  const [activity, setActivity] = useState<AnimationState>('study');
  const [actionToken, setActionToken] = useState(0);
  const [room, setRoom] = useState<RoomKind>('library');
  const [inspect, setInspect] = useState(false),
    [frame, setFrame] = useState(0);
  const [backdrop, setBackdrop] = useState<'dark' | 'light'>('dark');
  return (
    <main className="animation-preview">
      <header>
        <button onClick={() => window.location.assign('/#play')}>
          返回游戏
        </button>
        <h1>人物动作演示</h1>
        <label>
          场景
          <select
            value={room}
            onChange={(e) =>
              setRoom(e.target.value === 'classroom' ? 'classroom' : 'library')
            }
          >
            <option value="library">图书馆</option>
            <option value="classroom">教室</option>
          </select>
        </label>
      </header>
      <p>
        可直接点击人物与桌面物件；下方动作按钮仅用于演示检查，不出现在游戏页面。
      </p>
      <div className="animation-preview-controls">
        {RIG_STATES.map((s) => (
          <button
            key={s}
            aria-pressed={activity === s}
            onClick={() => {
              setActivity(s);
              setActionToken((n) => n + 1);
            }}
          >
            {ANIMATION_CLIPS[s].label}
          </button>
        ))}
      </div>
      <div className="animation-preview-pair">
        {(['female', 'male'] as const).map((preset) => (
          <section key={preset}>
            <h2>{preset === 'female' ? '小禾' : '知序'}</h2>
            <div className="animation-preview-room">
              <PixelCompanionCanvas
                state={activity}
                actionToken={actionToken}
                appearance={{ preset, rigVersion: 2 }}
                fullRoom
                previewFrame={inspect ? frame : undefined}
                room={room}
                activeActivity={
                  activity === 'study' ||
                  activity === 'class' ||
                  activity === 'meeting'
                    ? activity
                    : undefined
                }
                onActivityClick={(target) => {
                  setActivity((current) =>
                    current === target ? 'cheer' : target,
                  );
                  setActionToken((n) => n + 1);
                }}
                onCharacterClick={() => {
                  setActivity('greet');
                  setActionToken((n) => n + 1);
                }}
                onActionComplete={(action) =>
                  setActivity((current) =>
                    current === action ? 'idle' : current,
                  )
                }
              />
            </div>
          </section>
        ))}
      </div>
      <div className="animation-frame-controls">
        <label>
          <input
            type="checkbox"
            checked={inspect}
            onChange={(e) => setInspect(e.target.checked)}
          />
          逐帧检查
        </label>
        {inspect && (
          <>
            <input
              aria-label="检查动画帧"
              type="range"
              min={0}
              max={47}
              value={frame}
              onChange={(e) => setFrame(Number(e.target.value))}
            />
            <output>第 {frame + 1} / 48 帧</output>
          </>
        )}
      </div>
      <details>
        <summary>人物全身与旧版画风对照</summary>
        <label className="animation-matte">
          检查底色
          <select
            aria-label="检查底色"
            value={backdrop}
            onChange={(e) =>
              setBackdrop(e.target.value === 'light' ? 'light' : 'dark')
            }
          >
            <option value="dark">深色</option>
            <option value="light">浅色</option>
          </select>
        </label>
        <div className="animation-reference">
          <img
            className="animation-reference-original"
            src="/pixel-companion-sheet.png"
            width={1254}
            height={1254}
            alt="旧版 Q 版人物与绘制姿态参考"
          />
          {(['female', 'male'] as const).map((preset) => (
            <PixelCompanionCanvas
              key={preset}
              state={activity}
              appearance={{ preset, rigVersion: 2 }}
              scene={false}
              previewFrame={inspect ? frame : undefined}
              previewBackdrop={backdrop}
            />
          ))}
        </div>
      </details>
    </main>
  );
}
