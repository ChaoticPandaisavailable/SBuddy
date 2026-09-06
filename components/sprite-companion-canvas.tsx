'use client';
import { useEffect, useRef, useState } from 'react';
import type { CompanionCanvasProps } from './pixel-companion-canvas';
import { ANIMATION_CLIPS } from '@/lib/companion-animation';
import { createSpriteRuntime, sampleSprite } from '@/lib/sprite-animation';
import { loadSpriteFrames, spriteImage } from '@/lib/sprite-assets';
import {
  drawClassBook,
  drawMeetingLaptop,
  sampleDeskActivity,
} from '@/lib/scene-activity-props';
import {
  interpolatedSpriteFrame,
  spriteRise,
} from '@/lib/sprite-interpolation';
import { cover } from '@/lib/chibi-renderer';
import { DESK_OBJECTS } from '@/lib/companion-behavior';
import { deskObjectLayout } from '@/lib/desk-object-layout';
import {
  drawPixelDesk,
  drawContactShadow,
  drawDeskClock,
  drawDeskBooks,
  drawDeskLaptop,
} from '@/lib/pixel-desk';
import { cn } from '@/lib/utils';

export function SpriteCompanionCanvas(props: CompanionCanvasProps) {
  const host = useRef<HTMLElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    input = useRef(props);
  const [ready, setReady] = useState(false),
    [error, setError] = useState(''),
    [travel, setTravel] = useState(false),
    [label, setLabel] = useState('');
  const full = !!props.fullRoom,
    compact = !!props.compact,
    scene = props.scene !== false;
  const appearance = props.appearance ?? { preset: 'female', rigVersion: 3 };
  const preset = appearance.preset,
    atlasKey = appearance.atlasKey,
    portrait = appearance.rigVersion === 4;
  useEffect(() => {
    input.current = props;
  }, [props]);
  useEffect(() => {
    const el = host.current,
      c = canvas.current,
      ctx = c?.getContext('2d');
    if (!el || !c || !ctx) return;
    let live = true,
      raf = 0,
      last = 0,
      wasBusy = false,
      lastStatus = '',
      hiddenAt = 0,
      reported = 0,
      token = input.current.actionToken ?? 0;
    let room = input.current.room ?? 'library',
      switching = false;
    const r = createSpriteRuntime(
      performance.now(),
      !atlasKey && !portrait ? preset : undefined,
    );
    const resize = () => {
      const b = el.getBoundingClientRect();
      c.height = 480;
      c.width = full
        ? Math.max(240, Math.round((480 * b.width) / Math.max(1, b.height)))
        : 340;
      el.style.setProperty('--scene-unit', `${b.height / 480}px`);
      for (const [activity, point] of Object.entries(
        deskObjectLayout(c.width),
      )) {
        el.style.setProperty(
          `--desk-${activity}-x`,
          `${(point.x * b.height) / 480}px`,
        );
        el.style.setProperty(
          `--desk-${activity}-y`,
          `${(point.y * b.height) / 480}px`,
        );
      }
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    const visibility = () => {
      if (document.hidden) hiddenAt = performance.now();
      else if (hiddenAt) {
        r.at += performance.now() - hiddenAt;
        hiddenAt = 0;
      }
    };
    document.addEventListener('visibilitychange', visibility);
    Promise.all([
      loadSpriteFrames({ preset, atlasKey, rigVersion: portrait ? 4 : 3 }),
      spriteImage('/scenes/library-v2.png'),
      spriteImage('/scenes/classroom-v2.png'),
    ])
      .then(([frames, library, classroom]) => {
        if (!live) return;
        setReady(true);
        setError('');
        const draw = (now: number) => {
          raf = requestAnimationFrame(draw);
          if (document.hidden || now - last < 1000 / 30) return;
          last = now;
          const p = input.current;
          if ((p.room ?? 'library') !== room) switching = true;
          const characterScale = full ? 12 / 7 : 1;
          r.exitX = c.width / (2 * characterScale) + 150;
          if (token !== (p.actionToken ?? 0)) {
            token = p.actionToken ?? 0;
            r.token = token;
            if (
              r.current === p.state &&
              r.phase === 'loop' &&
              (p.state === 'greet' || p.state === 'cheer')
            ) {
              r.index = 0;
              r.at = now;
            }
          }
          r.desired = switching ? 'away' : p.state;
          const completedAction = r.current;
          const sampled = sampleSprite(r, now);
          const reduced =
            window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
            document.documentElement.dataset.reduceMotion === 'true';
          const deskActivity = sampleDeskActivity(r, now, reduced);
          const pose = portrait
            ? {
                ...sampled,
                frame: 0,
                x: 0,
                flip: false,
                visible: p.state !== 'away',
                travel: false,
              }
            : p.previewFrame !== undefined
              ? {
                  ...sampled,
                  frame: Math.max(0, Math.min(47, Math.floor(p.previewFrame))),
                  x: 0,
                  flip: false,
                  visible: true,
                }
              : reduced && !sampled.travel
                ? {
                    ...sampled,
                    frame:
                      r.current === 'study'
                        ? 8
                        : r.current === 'tired'
                          ? 31
                          : 0,
                  }
                : { ...sampled, frame: deskActivity.frame ?? sampled.frame };
          if (switching && r.phase === 'away') {
            room = p.room ?? 'library';
            switching = false;
          }
          const busy = switching || (pose.travel && r.phase !== 'away');
          if (busy !== wasBusy) {
            wasBusy = busy;
            setTravel(busy);
            p.onTravelChange?.(busy);
          }
          if (r.completed !== reported) {
            reported = r.completed;
            el.dataset.completedAction = completedAction;
            el.dataset.completionCount = String(reported);
            if (completedAction === 'greet' || completedAction === 'cheer')
              p.onActionComplete?.(completedAction, token);
          }
          const status = `${r.current}:${r.phase}`;
          if (lastStatus !== status) {
            lastStatus = status;
            setLabel(ANIMATION_CLIPS[r.current].label);
            p.onPhaseChange?.(
              r.phase === 'loop' || r.phase === 'away'
                ? 'looping'
                : 'transitioning',
              r.current,
            );
          }
          const attrs = {
            activity: r.current,
            phase:
              r.phase === 'loop' || r.phase === 'away'
                ? 'looping'
                : 'transitioning',
            sequencePhase: r.phase,
            frame: String(pose.frame),
            travel: String(busy),
            room,
          };
          for (const [key, value] of Object.entries(attrs))
            if (el.dataset[key] !== value) el.dataset[key] = value;
          ctx.clearRect(0, 0, c.width, c.height);
          ctx.imageSmoothingEnabled = false;
          const roomVisible = full || (scene && !compact);
          if (roomVisible)
            cover(
              ctx,
              room === 'library' ? library : classroom,
              0,
              0,
              c.width,
              480,
            );
          else if (p.previewBackdrop) {
            ctx.fillStyle =
              p.previewBackdrop === 'dark' ? '#202c38' : '#fffaf1';
            ctx.fillRect(0, 0, c.width, 480);
          }
          ctx.save();
          ctx.translate(c.width / 2, 0);
          // Body is behind the desk. The same complete frame is clipped above the desk for hands/pen.
          const body = () => {
            if (!pose.visible) return;
            ctx.save();
            const inBetween =
              !atlasKey &&
              !portrait &&
              !reduced &&
              deskActivity.frame === undefined &&
              p.previewFrame === undefined
                ? sampled.tweenTo
                : undefined;
            const rise = portrait
              ? 0
              : inBetween === undefined
                ? spriteRise(pose.frame)
                : (spriteRise(pose.frame) + spriteRise(inBetween)) / 2;
            // Enlarge around the writing contact, so the hands stay on the same desktop.
            ctx.translate(
              Math.round(pose.x * characterScale),
              full
                ? 360 - (165 + rise) * characterScale
                : (roomVisible ? 195 : 107) - rise,
            );
            ctx.scale(characterScale, characterScale);
            if (pose.flip) ctx.scale(-1, 1);
            const shownFrame =
              !roomVisible &&
              p.previewFrame === undefined &&
              r.current === 'idle'
                ? 39
                : pose.frame;
            ctx.drawImage(
              interpolatedSpriteFrame(
                frames,
                portrait ? 0 : shownFrame,
                shownFrame === pose.frame ? inBetween : undefined,
              ),
              -128,
              0,
            );
            ctx.restore();
          };
          body();
          if (roomVisible) {
            drawPixelDesk(ctx, c.width);
            if (pose.visible && !pose.travel)
              drawContactShadow(ctx, 0, 370, 40 * characterScale);
            // Paper lies directly below the writing hand; books and the laptop stay clear of the face.
            if (r.current === 'study') {
              ctx.fillStyle = '#8c81694d';
              ctx.fillRect(-38 * characterScale, 365, 77 * characterScale, 16);
              ctx.fillStyle = '#fff7df';
              ctx.fillRect(-38 * characterScale, 363, 76 * characterScale, 15);
              ctx.fillStyle = '#c8c0a5';
              for (let y = 367; y < 376; y += 3)
                ctx.fillRect(-31 * characterScale, y, 59 * characterScale, 1);
            }
            if (deskActivity.book > 0)
              drawClassBook(
                ctx,
                characterScale,
                deskActivity.page,
                deskActivity.book,
                preset,
                'base',
              );
            ctx.save();
            ctx.beginPath();
            ctx.rect(-c.width / 2, 0, c.width, 372);
            ctx.clip();
            body();
            ctx.restore();
            if (deskActivity.book > 0)
              drawClassBook(
                ctx,
                characterScale,
                deskActivity.page,
                deskActivity.book,
                preset,
                'page',
              );
            if (deskActivity.laptop > 0)
              drawMeetingLaptop(ctx, characterScale, deskActivity.laptop);
            const objects = deskObjectLayout(c.width);
            const date = new Date();
            const time =
              String(date.getHours()).padStart(2, '0') +
              ':' +
              String(date.getMinutes()).padStart(2, '0');
            drawDeskClock(ctx, objects.study.x, objects.study.y, time);
            drawDeskBooks(ctx, objects.class.x, objects.class.y);
            drawDeskLaptop(
              ctx,
              objects.meeting.x,
              objects.meeting.y,
              p.activeActivity === 'meeting',
            );
          }
          ctx.restore();
        };
        raf = requestAnimationFrame(draw);
      })
      .catch((e) => {
        if (live) {
          setReady(false);
          setError(e instanceof Error ? e.message : '人物素材无法读取。');
        }
      });
    return () => {
      live = false;
      cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [preset, atlasKey, portrait, full, compact, scene]);
  return (
    <figure
      ref={host}
      className={cn(
        'pixel-companion-canvas-wrap',
        full && 'room-wallpaper',
        compact && 'is-compact',
        props.className,
      )}
      data-ready={ready}
      data-rig={portrait ? 'portrait-static' : 'sprite-v3'}
      aria-label={`像素学习搭子：${label}`}
    >
      <canvas
        ref={canvas}
        width={340}
        height={480}
        className="pixel-companion-canvas"
        aria-hidden="true"
      />
      {full && props.onCharacterClick && (
        <button
          className="scene-hotspot character-hotspot"
          aria-label="与人物互动"
          disabled={!ready || travel}
          onClick={props.onCharacterClick}
          style={{
            left: '50%',
            top: '50%',
            width: 'calc(216 * var(--scene-unit))',
            height: 'calc(240 * var(--scene-unit))',
          }}
        >
          <span className="hotspot-caption">聊聊</span>
        </button>
      )}
      {full &&
        props.onActivityClick &&
        DESK_OBJECTS.map((o) => (
          <button
            key={o.activity}
            className="scene-hotspot desk-hotspot"
            aria-label={o.label}
            aria-pressed={props.activeActivity === o.activity}
            disabled={!ready || travel}
            onClick={() => props.onActivityClick?.(o.activity)}
            style={{
              left: `calc(50% + var(--desk-${o.activity}-x))`,
              top: `var(--desk-${o.activity}-y)`,
              width: `calc(${o.w} * var(--scene-unit))`,
              height: `calc(${o.h} * var(--scene-unit))`,
            }}
          >
            <span className="hotspot-caption">{o.label.split('：')[1]}</span>
          </button>
        ))}
      {portrait && !compact && (
        <span className="portrait-mode-label">静态外观 · 互动与专注可用</span>
      )}
      {(!ready || error) && (
        <figcaption className="rig-loading">
          <output>{error || '正在准备人物…'}</output>
        </figcaption>
      )}
      <span className="sr-only" aria-live="polite">
        {label}
      </span>
    </figure>
  );
}
