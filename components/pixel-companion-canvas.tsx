'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ANIMATION_CLIPS,
  type AnimationPhase,
  type AnimationState,
} from '@/lib/companion-animation';
import type { AvatarStyle } from '@/lib/avatar-style';
import { type RigAppearance, loopPose } from '@/lib/companion-rig';
import {
  createChibiRuntime,
  sampleChibi,
  type RoomKind,
  CHIBI_CLIP_MS,
} from '@/lib/chibi-rig';
import {
  cover,
  drawChibiBody,
  drawChibiHands,
  drawChibiHead,
  drawTableItems,
  drawDeskObjects,
} from '@/lib/chibi-renderer';
import { loadChibi, loadProps, loadRig } from '@/lib/rig-assets';
import {
  PixelCompanionCanvas as LegacyCanvas,
  drawLegacyCharacter,
} from './legacy-pixel-companion-canvas';
import { cn } from '@/lib/utils';
import { DESK_OBJECTS, type DeskActivity } from '@/lib/companion-behavior';
import { SpriteCompanionCanvas } from './sprite-companion-canvas';

export type CompanionCanvasProps = {
  state: AnimationState;
  actionToken?: number;
  avatarStyle?: AvatarStyle;
  appearance?: RigAppearance;
  className?: string;
  compact?: boolean;
  scene?: boolean;
  fullRoom?: boolean;
  room?: RoomKind;
  onPhaseChange?: (phase: AnimationPhase, state: AnimationState) => void;
  activeActivity?: DeskActivity;
  onActivityClick?: (activity: DeskActivity) => void;
  onCharacterClick?: () => void;
  onTravelChange?: (busy: boolean) => void;
  onActionComplete?: (action: AnimationState, token: number) => void;
  previewFrame?: number;
  previewBackdrop?: 'dark' | 'light';
};
type Props = CompanionCanvasProps;
const DEFAULT: RigAppearance = { preset: 'female', rigVersion: 2 };
const imageCache = new Map<string, Promise<HTMLImageElement>>();
function loadImage(url: string) {
  if (!imageCache.has(url))
    imageCache.set(
      url,
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('场景素材加载失败，请刷新重试。'));
        img.src = url;
      }),
    );
  return imageCache.get(url)!;
}
export function PixelCompanionCanvas(props: Props) {
  const appearance = props.appearance ?? DEFAULT;
  if (!appearance.atlasKey || appearance.rigVersion === 3)
    return <SpriteCompanionCanvas {...props} appearance={appearance} />;
  if (appearance.atlasKey && appearance.rigVersion !== 2 && !props.fullRoom)
    return <LegacyCanvas {...props} appearance={appearance} />;
  return <ChibiCanvas {...props} appearance={appearance} />;
}
function ChibiCanvas({
  state,
  actionToken = 0,
  appearance = DEFAULT,
  className,
  compact = false,
  scene = true,
  fullRoom = false,
  room = 'library',
  onPhaseChange,
  activeActivity,
  onActivityClick,
  onCharacterClick,
  onTravelChange,
  onActionComplete,
}: Props) {
  const canvas = useRef<HTMLCanvasElement>(null),
    wrapper = useRef<HTMLElement>(null);
  const runtime = useRef(createChibiRuntime(state));
  const input = useRef({
    state,
    room,
    onPhaseChange,
    actionToken,
    activeActivity,
    onTravelChange,
    onActionComplete,
  });
  const [travel, setTravel] = useState(state === 'away');
  const assets = useRef<
    | {
        parts: HTMLCanvasElement[];
        objects: HTMLCanvasElement[];
        library: HTMLImageElement;
        classroom: HTMLImageElement;
        desk: HTMLImageElement;
      }
    | undefined
  >(undefined);
  const [error, setError] = useState(''),
    [ready, setReady] = useState(false),
    [status, setStatus] = useState('');
  const [visibleRoom, setVisibleRoom] = useState(room);
  const displayed = useRef(room),
    switching = useRef(false);
  const preset = appearance.preset,
    atlasKey = appearance.atlasKey,
    rigVersion = appearance.rigVersion;
  const legacy = !!atlasKey && rigVersion !== 2;
  useEffect(() => {
    input.current = {
      state,
      room,
      onPhaseChange,
      actionToken,
      activeActivity,
      onTravelChange,
      onActionComplete,
    };
  }, [
    state,
    room,
    onPhaseChange,
    actionToken,
    activeActivity,
    onTravelChange,
    onActionComplete,
  ]);
  useEffect(() => {
    let live = true;
    assets.current = undefined;
    Promise.all([
      legacy
        ? loadRig({ preset, atlasKey })
        : loadChibi({ preset, atlasKey, rigVersion: 2 }),
      loadProps(),
      loadImage('/scenes/library-v2.png'),
      loadImage('/scenes/classroom-v2.png'),
      loadImage('/scenes/desk-v2.png'),
    ])
      .then(([parts, objects, library, classroom, desk]) => {
        if (live) {
          assets.current = { parts, objects, library, classroom, desk };
          setReady(true);
          setError('');
        }
      })
      .catch((e: unknown) => {
        if (live) {
          setReady(false);
          setError(e instanceof Error ? e.message : '人物素材加载失败');
        }
      });
    return () => {
      live = false;
    };
  }, [preset, atlasKey, rigVersion, legacy]);
  useEffect(() => {
    const element = canvas.current,
      host = wrapper.current,
      ctx = element?.getContext('2d');
    if (!element || !ctx || !host) return;
    const size = () => {
      const bounds = host.getBoundingClientRect();
      host.style.setProperty(
        '--scene-unit',
        `${bounds.height / (fullRoom ? 480 : 340)}px`,
      );
      element.height = fullRoom ? 480 : 340;
      element.width = fullRoom
        ? Math.max(
            240,
            Math.round((480 * bounds.width) / Math.max(1, bounds.height)),
          )
        : 340;
      host.style.setProperty(
        '--desk-spread',
        `${(Math.min(92, (element.width - 84) / 2) * bounds.height) / (fullRoom ? 480 : 340)}px`,
      );
    };
    const observer = new ResizeObserver(size);
    observer.observe(host);
    size();
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    runtime.current = createChibiRuntime(
      input.current.state,
      performance.now(),
    );
    let lastToken = input.current.actionToken;
    let completedAction = '',
      committedExit = false,
      lastTravel: boolean | undefined;
    let frame = 0,
      last = 0,
      lastPhase = '',
      hiddenAt: number | undefined;
    const visibility = () => {
      if (document.hidden) hiddenAt = performance.now();
      else if (hiddenAt !== undefined) {
        const gap = performance.now() - hiddenAt;
        runtime.current.at += gap;
        runtime.current.loopAt += gap;
        hiddenAt = undefined;
      }
    };
    document.addEventListener('visibilitychange', visibility);
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (document.hidden) return;
      if (now - last < 1000 / 30) return;
      last = now;
      const art = assets.current;
      if (!art) return;
      const r = runtime.current;
      if (lastToken !== input.current.actionToken) {
        if (
          !r.segments.length &&
          r.current === input.current.state &&
          (r.current === 'greet' || r.current === 'cheer')
        )
          r.loopAt = now;
        lastToken = input.current.actionToken;
      }
      r.exitX = Math.max(250, element.width / 2 + 100);
      if (fullRoom && displayed.current !== input.current.room)
        switching.current = true;
      if (switching.current || input.current.state === 'away')
        committedExit = true;
      r.desired = committedExit ? 'away' : input.current.state;
      const reduced =
        media.matches ||
        document.documentElement.dataset.reduceMotion === 'true';
      const p = sampleChibi(r, now, reduced);
      if (r.current === 'away' && !r.segments.length) committedExit = false;
      if (switching.current && r.current === 'away' && !r.segments.length) {
        displayed.current = input.current.room;
        setVisibleRoom(input.current.room);
        switching.current = false;
        host.dataset.room = displayed.current;
      }
      const busy =
        switching.current ||
        (!(r.current === 'away' && !r.segments.length) &&
          (Math.abs(p.x) > 1 ||
            p.rise > 5 ||
            r.segments.some(
              (segment) =>
                segment.walk ||
                Math.abs(segment.from.x) > 1 ||
                segment.from.rise > 5,
            ) ||
            input.current.state === 'away'));
      if (busy !== lastTravel) {
        lastTravel = busy;
        setTravel(busy);
        input.current.onTravelChange?.(busy);
        host.dataset.travel = String(busy);
      }
      if (
        !r.segments.length &&
        (r.current === 'greet' || r.current === 'cheer') &&
        r.current === input.current.state &&
        (reduced || now - r.loopAt >= CHIBI_CLIP_MS[r.current])
      ) {
        const signature = `${r.current}:${lastToken}:${r.loopAt}`;
        if (signature !== completedAction) {
          completedAction = signature;
          host.dataset.completedAction = r.current;
          host.dataset.completionCount = String(
            Number(host.dataset.completionCount ?? 0) + 1,
          );
          input.current.onActionComplete?.(r.current, lastToken);
        }
      }
      const phase: AnimationPhase = r.segments.length
        ? 'transitioning'
        : 'looping';
      const label = switching.current
        ? '正在换场景'
        : ANIMATION_CLIPS[r.current].label;
      if (lastPhase !== r.current + phase + label) {
        lastPhase = r.current + phase + label;
        setStatus(label);
        host.dataset.activity = r.current;
        host.dataset.phase = phase;
        input.current.onPhaseChange?.(phase, r.current);
      }
      ctx.clearRect(0, 0, element.width, element.height);
      ctx.imageSmoothingEnabled = false;
      const showRoom = fullRoom || (scene && !compact);
      const visiblePose = showRoom ? p : { ...p, rise: 42 };
      if (showRoom)
        cover(ctx, art[displayed.current], 0, 0, element.width, element.height);
      ctx.save();
      ctx.translate(element.width / 2, fullRoom ? 0 : showRoom ? 0 : 5);
      if (fullRoom) ctx.translate(0, 130);
      const old = {
        ...loopPose(r.current, now - r.loopAt),
        x: p.x,
        y: 286 - p.rise,
      };
      if (legacy) drawLegacyCharacter(ctx, art.parts, old);
      else drawChibiBody(ctx, art.parts, visiblePose);
      if (showRoom) {
        ctx.fillStyle = '#d4c2a1';
        ctx.fillRect(
          -element.width / 2,
          230,
          element.width,
          element.height - 230,
        );
        ctx.fillStyle = '#938166';
        ctx.fillRect(-element.width / 2, 230, element.width, 3);
        drawTableItems(ctx, art.objects, p);
        if (fullRoom) {
          ctx.save();
          ctx.translate(0, -42);
          drawDeskObjects(
            ctx,
            input.current.activeActivity,
            Math.min(92, (element.width - 84) / 2),
          );
          ctx.restore();
        }
      }
      if (legacy) drawLegacyCharacter(ctx, art.parts, old, true);
      else {
        drawChibiHands(ctx, art.parts, visiblePose);
        drawChibiHead(ctx, art.parts, visiblePose);
      }
      ctx.restore();
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [compact, scene, fullRoom, legacy]);
  return (
    <figure
      ref={wrapper}
      className={cn(
        'pixel-companion-canvas-wrap',
        fullRoom && 'room-wallpaper',
        compact && 'is-compact',
        className,
      )}
      data-ready={ready}
      data-rig={legacy ? 'legacy-v1' : 'chibi-v2'}
      data-room={visibleRoom}
      aria-label={`像素学习搭子：${status || ANIMATION_CLIPS[state].label}`}
    >
      <canvas
        ref={canvas}
        width={340}
        height={340}
        className="pixel-companion-canvas"
        aria-hidden="true"
      />
      {fullRoom && onCharacterClick && (
        <button
          className="scene-hotspot character-hotspot"
          aria-label="与人物互动"
          disabled={
            !ready || travel || state === 'away' || room !== visibleRoom
          }
          onClick={onCharacterClick}
          style={{
            left: '50%',
            top: '60%',
            width: 'calc(120 * var(--scene-unit))',
            height: 'calc(145 * var(--scene-unit))',
          }}
        >
          <span className="hotspot-caption">聊聊</span>
        </button>
      )}
      {fullRoom &&
        onActivityClick &&
        DESK_OBJECTS.map((object) => (
          <button
            key={object.activity}
            className="scene-hotspot desk-hotspot"
            aria-label={object.label}
            aria-pressed={activeActivity === object.activity}
            disabled={
              !ready || travel || state === 'away' || room !== visibleRoom
            }
            onClick={() => onActivityClick(object.activity)}
            style={{
              left: `calc(50% + ${Math.sign(object.x)} * var(--desk-spread))`,
              top: `${object.y / 4.8}%`,
              width: `calc(${object.w} * var(--scene-unit))`,
              height: `calc(${object.h} * var(--scene-unit))`,
            }}
          >
            <span className="hotspot-caption">
              {object.label.split('：')[1]}
            </span>
          </button>
        ))}
      {(!ready || error) && (
        <figcaption className="rig-loading">
          <output>{error || '正在准备人物…'}</output>
        </figcaption>
      )}
      <span className="sr-only" aria-live="polite">
        {status}
      </span>
    </figure>
  );
}
