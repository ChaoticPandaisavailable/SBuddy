'use client';
import { useEffect, useRef, useState } from 'react';
import type { CompanionCanvasProps } from './pixel-companion-canvas';
import { ANIMATION_CLIPS } from '@/lib/companion-animation';
import { createSpriteRuntime, sampleSprite } from '@/lib/sprite-animation';
import { loadSpriteFrames, spriteImage } from '@/lib/sprite-assets';
import { cover } from '@/lib/chibi-renderer';
import { DESK_OBJECTS } from '@/lib/companion-behavior';
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
    atlasKey = appearance.atlasKey;
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
    const r = createSpriteRuntime(performance.now());
    const resize = () => {
      const b = el.getBoundingClientRect();
      c.height = 480;
      c.width = full
        ? Math.max(240, Math.round((480 * b.width) / Math.max(1, b.height)))
        : 340;
      el.style.setProperty('--scene-unit', `${b.height / 480}px`);
      el.style.setProperty(
        '--desk-spread',
        `${(Math.min(92, (c.width - 76) / 2) * b.height) / 480}px`,
      );
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
      loadSpriteFrames({ preset, atlasKey, rigVersion: 3 }),
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
          const pose =
            p.previewFrame !== undefined
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
                      r.current === 'study' || r.current === 'class'
                        ? 8
                        : r.current === 'tired'
                          ? 31
                          : 0,
                  }
                : sampled;
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
            const rise = pose.frame >= 39 ? 32 : pose.frame === 38 ? 16 : 0;
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
            ctx.drawImage(frames[shownFrame], -128, 0);
            ctx.restore();
          };
          body();
          if (roomVisible) {
            const shade = ctx.createLinearGradient(0, 360, 0, 480);
            shade.addColorStop(0, '#d9c8a6');
            shade.addColorStop(1, '#c6b28e');
            ctx.fillStyle = shade;
            ctx.fillRect(-c.width / 2, 360, c.width, 120);
            ctx.fillStyle = '#8f8066';
            ctx.fillRect(-c.width / 2, 360, c.width, 3);
            ctx.fillStyle = '#eee1c2';
            ctx.fillRect(-c.width / 2, 363, c.width, 2);
            // Paper lies directly below the writing hand; books and the laptop stay clear of the face.
            ctx.fillStyle = '#8c81694d';
            ctx.fillRect(-38 * characterScale, 365, 77 * characterScale, 16);
            ctx.fillStyle = '#fff7df';
            ctx.fillRect(-38 * characterScale, 363, 76 * characterScale, 15);
            ctx.fillStyle = '#c8c0a5';
            for (let y = 367; y < 376; y += 3)
              ctx.fillRect(-31 * characterScale, y, 59 * characterScale, 1);
            ctx.save();
            ctx.beginPath();
            ctx.rect(-c.width / 2, 0, c.width, 369);
            ctx.clip();
            body();
            ctx.restore();
            const spread = Math.min(92, (c.width - 76) / 2);
            const rect = (
              x: number,
              y: number,
              w: number,
              h: number,
              color: string,
            ) => {
              ctx.fillStyle = color;
              ctx.fillRect(Math.round(x), y, w, h);
            };
            rect(-spread - 30, 367, 60, 29, '#4c5b52');
            rect(-spread - 26, 371, 52, 19, '#cfdbc6');
            ctx.fillStyle = '#405441';
            ctx.font = '14px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(
              new Date().toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              }),
              -spread,
              386,
            );
            rect(-29, 384, 58, 7, '#536e60');
            rect(-25, 379, 54, 6, '#b48d6c');
            rect(-23, 380, 48, 3, '#f0dfbd');
            rect(-18, 375, 48, 4, '#758979');
            rect(spread - 29, 359, 58, 32, '#424e51');
            rect(spread - 25, 363, 50, 23, '#c3d6ce');
            rect(
              spread - 22,
              367,
              15,
              14,
              p.activeActivity === 'meeting' ? '#789e89' : '#a4b7a9',
            );
            rect(spread - 3, 369, 21, 2, '#819d91');
            rect(spread - 3, 375, 17, 2, '#819d91');
            rect(spread - 34, 391, 68, 6, '#7b8986');
            rect(spread - 23, 392, 47, 2, '#c6d0c5');
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
  }, [preset, atlasKey, full, compact, scene]);
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
      data-rig="sprite-v3"
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
              left: `calc(50% + ${Math.sign(o.x)} * var(--desk-spread))`,
              top: `${o.y / 4.8}%`,
              width: `calc(${o.w} * var(--scene-unit))`,
              height: `calc(${o.h} * var(--scene-unit))`,
            }}
          >
            <span className="hotspot-caption">{o.label.split('：')[1]}</span>
          </button>
        ))}
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
