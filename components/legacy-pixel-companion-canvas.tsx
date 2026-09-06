'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ANIMATION_CLIPS,
  type AnimationPhase,
  type AnimationState,
} from '@/lib/companion-animation';
import type { AvatarStyle } from '@/lib/avatar-style';
import {
  createRigRuntime,
  requestRigState,
  sampleRig,
  type Pose,
  type RigAppearance,
} from '@/lib/companion-rig';
import { loadProps, loadRig } from '@/lib/rig-assets';
import { cn } from '@/lib/utils';
type Props = {
  state: AnimationState;
  avatarStyle?: AvatarStyle;
  appearance?: RigAppearance;
  className?: string;
  compact?: boolean;
  scene?: boolean;
  onPhaseChange?: (phase: AnimationPhase, state: AnimationState) => void;
};
const DEFAULT_APPEARANCE: RigAppearance = { preset: 'female' };
type Point = { x: number; y: number };
const joint = (base: Point, angle: number, length: number): Point => ({
  x: base.x + Math.sin(angle) * length,
  y: base.y + Math.cos(angle) * length,
});
function sprite(
  ctx: CanvasRenderingContext2D,
  image: HTMLCanvasElement,
  x: number,
  y: number,
  width: number,
  height: number,
  angle = 0,
  anchor = 0,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-angle);
  ctx.drawImage(image, -width / 2, -anchor, width, height);
  ctx.restore();
}
export function drawLegacyCharacter(
  ctx: CanvasRenderingContext2D,
  parts: HTMLCanvasElement[],
  p: Pose,
  foreground = false,
) {
  const neck = joint({ x: p.x, y: p.y }, Math.PI + p.torso, 90);
  if (!foreground) {
    for (const left of [true, false]) {
      const origin = { x: p.x + (left ? -15 : 15), y: p.y - 5 },
        thigh = left ? p.leftThigh : p.rightThigh,
        shin = left ? p.leftShin : p.rightShin;
      const knee = joint(origin, thigh, 55);
      sprite(ctx, parts[left ? 6 : 8], origin.x, origin.y, 27, 62, thigh, 4);
      sprite(ctx, parts[left ? 7 : 9], knee.x, knee.y, 27, 65, shin, 5);
    }
    sprite(ctx, parts[1], neck.x, neck.y - 4, 61, 100, p.torso);
  } else {
    for (const left of [true, false]) {
      const shoulder = { x: neck.x + (left ? -25 : 25), y: neck.y + 13 };
      const upper = left ? p.leftUpper : p.rightUpper,
        lower = left ? p.leftLower : p.rightLower,
        elbow = joint(shoulder, upper, 38);
      sprite(
        ctx,
        parts[left ? 2 : 4],
        shoulder.x,
        shoulder.y,
        21,
        44,
        upper,
        4,
      );
      sprite(
        ctx,
        parts[!left && p.pen > 0.5 ? 10 : left ? 3 : 5],
        elbow.x,
        elbow.y,
        18,
        !left && p.pen > 0.5 ? 52 : 46,
        lower,
        5,
      );
    }
    sprite(
      ctx,
      parts[p.blink > 0.5 ? 11 : 0],
      neck.x,
      neck.y + 4,
      80,
      80,
      p.head,
      77,
    );
  }
}
export function PixelCompanionCanvas({
  state,
  appearance = DEFAULT_APPEARANCE,
  className,
  compact = false,
  scene = true,
  onPhaseChange,
}: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const parts = useRef<HTMLCanvasElement[] | undefined>(undefined),
    props = useRef<HTMLCanvasElement[] | undefined>(undefined);
  const runtime = useRef(createRigRuntime(state)),
    desired = useRef(state),
    callback = useRef(onPhaseChange);
  const [ready, setReady] = useState(false),
    [error, setError] = useState(''),
    [label, setLabel] = useState(ANIMATION_CLIPS[state].label);
  const preset = appearance.preset,
    atlasKey = appearance.atlasKey;
  useEffect(() => {
    desired.current = state;
    callback.current = onPhaseChange;
  }, [state, onPhaseChange]);
  useEffect(() => {
    let live = true;
    void loadRig({ preset, atlasKey })
      .then((loaded) => {
        if (live) {
          parts.current = loaded;
          setReady(true);
          setError('');
        }
      })
      .catch((e: unknown) => {
        if (live) {
          parts.current = undefined;
          setReady(false);
          setError(e instanceof Error ? e.message : '人物素材加载失败');
        }
      });
    void loadProps()
      .then((loaded) => {
        if (live) props.current = loaded;
      })
      .catch(() => {
        if (live) setError('桌椅素材加载失败，请刷新页面。');
      });
    return () => {
      live = false;
    };
  }, [preset, atlasKey]);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    let frame = 0,
      last = 0,
      previous = '';
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    runtime.current.loopAt = performance.now();
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (now - last < 1000 / 30) return;
      last = now;
      requestRigState(runtime.current, desired.current);
      const p = sampleRig(
        runtime.current,
        now,
        media.matches ||
          document.documentElement.dataset.reduceMotion === 'true',
      );
      const phase = runtime.current.segments.length
          ? 'transitioning'
          : 'looping',
        status = runtime.current.current + phase;
      if (status !== previous) {
        previous = status;
        setLabel(ANIMATION_CLIPS[runtime.current.current].label);
        callback.current?.(phase, runtime.current.current);
      }
      ctx.clearRect(0, 0, 520, 430);
      ctx.imageSmoothingEnabled = false;
      const showScene = scene && !compact,
        art = parts.current,
        objects = props.current;
      if (showScene && objects) sprite(ctx, objects[1], 300, 229, 88, 169);
      const frameCharacter = () => {
        if (!showScene) {
          ctx.translate(260, compact ? -106 : -70);
          ctx.scale(compact ? 1.36 : 1.25, compact ? 1.36 : 1.25);
          ctx.translate(-150, 0);
        }
      };
      ctx.save();
      frameCharacter();
      if (art) drawLegacyCharacter(ctx, art, p);
      ctx.restore();
      if (showScene && objects) {
        sprite(ctx, objects[0], 300, 272, 226, 132);
        if (p.notebook > 0.05) {
          ctx.globalAlpha = p.notebook;
          sprite(ctx, objects[2], 319, 279, 86, 34);
          ctx.globalAlpha = 1;
        }
        if (p.laptop > 0.05) {
          ctx.globalAlpha = p.laptop;
          sprite(ctx, objects[3], 310, 278, 88, 32);
          ctx.globalAlpha = 1;
        }
      }
      ctx.save();
      frameCharacter();
      if (art) drawLegacyCharacter(ctx, art, p, true);
      ctx.restore();
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [compact, scene]);
  return (
    <figure
      className={cn(
        'pixel-companion-canvas-wrap',
        compact && 'is-compact',
        className,
      )}
      data-ready={ready}
      data-rig="articulated-v1"
      aria-label={`像素学习搭子：${label}`}
    >
      <canvas
        ref={canvas}
        width={520}
        height={430}
        className="pixel-companion-canvas"
        aria-hidden="true"
      />
      {(!ready || error) && (
        <figcaption className="rig-loading">
          {error || '正在准备人物…'}
        </figcaption>
      )}
      <span className="sr-only" aria-live="polite">
        {label}
      </span>
    </figure>
  );
}
