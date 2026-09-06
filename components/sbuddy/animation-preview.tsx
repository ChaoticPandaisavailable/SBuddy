'use client';
import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { PixelCompanionCanvas } from '@/components/pixel-companion-canvas';
import {
  ANIMATION_CLIPS,
  type AnimationState,
} from '@/lib/companion-animation';
import { RIG_STATES } from '@/lib/companion-rig';
import type { RoomKind } from '@/lib/chibi-rig';

export function AnimationPreview({ onBack }: { onBack: () => void }) {
  const [activity, setActivity] = useState<AnimationState>('study');
  const [actionToken, setActionToken] = useState(0);
  const [room, setRoom] = useState<RoomKind>('library');
  return (
    <section className="animation-preview">
      <header>
        <button className="secondary-button auxiliary-back" onClick={onBack}>
          <ArrowLeft size={18} />
          返回
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
                appearance={{ preset, rigVersion: 3 }}
                fullRoom
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
    </section>
  );
}
