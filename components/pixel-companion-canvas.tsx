'use client';

import { useEffect, useRef, useState } from 'react';

import {
  ANIMATION_CLIPS,
  ANIMATION_PHASE_LABELS,
  type AnimationPhase,
  type AnimationState,
} from '@/lib/companion-animation';
import { defaultAvatarStyle, type AvatarStyle } from '@/lib/avatar-style';
import { cn } from '@/lib/utils';

const CANVAS_WIDTH = 520;
const CANVAS_HEIGHT = 430;
const TRANSITION_MS = 220;

type PixelCompanionCanvasProps = {
  state: AnimationState;
  avatarStyle?: AvatarStyle;
  className?: string;
  compact?: boolean;
  onPhaseChange?: (phase: AnimationPhase, state: AnimationState) => void;
};

type Runtime = {
  current: AnimationState;
  desired: AnimationState;
  from: AnimationState;
  to: AnimationState;
  phase: AnimationPhase;
  phaseStartedAt: number;
  loopStartedAt: number;
};

export function PixelCompanionCanvas({
  state,
  avatarStyle = defaultAvatarStyle,
  className,
  compact = false,
  onPhaseChange,
}: PixelCompanionCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const atlasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceImageRef = useRef<HTMLImageElement | null>(null);
  const styleRef = useRef(avatarStyle);
  const callbackRef = useRef(onPhaseChange);
  const runtimeRef = useRef<Runtime>({
    current: state,
    desired: state,
    from: state,
    to: state,
    phase: 'entering',
    phaseStartedAt: 0,
    loopStartedAt: 0,
  });
  const [phase, setPhase] = useState<AnimationPhase>('entering');
  const [liveState, setLiveState] = useState<AnimationState>(state);
  const [ready, setReady] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    callbackRef.current = onPhaseChange;
  }, [onPhaseChange]);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () =>
      setReducedMotion(
        query.matches ||
          document.documentElement.dataset.reduceMotion === 'true',
      );
    sync();
    query.addEventListener('change', sync);
    window.addEventListener('sbuddy-motion', sync);
    return () => {
      query.removeEventListener('change', sync);
      window.removeEventListener('sbuddy-motion', sync);
    };
  }, []);

  useEffect(() => {
    runtimeRef.current.desired = state;
  }, [state]);

  useEffect(() => {
    styleRef.current = avatarStyle;
    if (sourceImageRef.current) {
      atlasRef.current = tintAtlas(sourceImageRef.current, avatarStyle);
    }
  }, [avatarStyle]);

  useEffect(() => {
    const image = new Image();
    image.src = '/pixel-companion-atlas.png';
    image.onload = () => {
      sourceImageRef.current = image;
      atlasRef.current = tintAtlas(image, styleRef.current);
      setReady(true);
    };
    image.onerror = () => setReady(false);
    return () => {
      image.onload = null;
      image.onerror = null;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.imageSmoothingEnabled = false;
    let frame = 0;
    let lastDrawAt = 0;

    const setRuntimePhase = (next: AnimationPhase, timestamp: number) => {
      const runtime = runtimeRef.current;
      runtime.phase = next;
      runtime.phaseStartedAt = timestamp;
      if (next === 'looping') runtime.loopStartedAt = timestamp;
      setPhase(next);
      setLiveState(runtime.current);
      callbackRef.current?.(next, runtime.current);
    };

    const render = (timestamp: number) => {
      const frameInterval = reducedMotion ? 100 : 1000 / 12;
      if (lastDrawAt && timestamp - lastDrawAt < frameInterval) {
        frame = window.requestAnimationFrame(render);
        return;
      }
      lastDrawAt = timestamp;
      const atlas = atlasRef.current;
      const runtime = runtimeRef.current;
      if (!runtime.phaseStartedAt) runtime.phaseStartedAt = timestamp;
      if (!runtime.loopStartedAt) runtime.loopStartedAt = timestamp;

      advanceRuntime(runtime, timestamp, reducedMotion, setRuntimePhase);
      context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      context.imageSmoothingEnabled = false;

      if (atlas) {
        const elapsed = Math.max(0, timestamp - runtime.phaseStartedAt);
        if (runtime.phase === 'transitioning') {
          const progress = reducedMotion
            ? Math.min(1, elapsed / 100)
            : Math.min(1, elapsed / TRANSITION_MS);
          drawPose(
            context,
            atlas,
            runtime.from,
            styleRef.current,
            timestamp - runtime.loopStartedAt,
            1 - progress * 0.45,
            1 - progress * 0.025,
            progress * 5,
            reducedMotion,
          );
          if (reducedMotion) {
            context.globalAlpha = progress;
            drawPose(
              context,
              atlas,
              runtime.to,
              styleRef.current,
              0,
              1,
              0.97 + progress * 0.03,
              0,
              true,
            );
            context.globalAlpha = 1;
          } else {
            context.save();
            buildPixelDissolvePath(context, progress);
            context.clip();
            drawPose(
              context,
              atlas,
              runtime.to,
              styleRef.current,
              0,
              1,
              0.965 + progress * 0.035,
              3 - progress * 3,
              false,
            );
            context.restore();
          }
        } else {
          const clip = ANIMATION_CLIPS[runtime.current];
          const duration =
            runtime.phase === 'entering'
              ? clip.enterMs
              : runtime.phase === 'exiting'
                ? clip.exitMs
                : 1;
          const progress = Math.min(
            1,
            elapsed / (reducedMotion ? Math.min(100, duration) : duration),
          );
          const opacity =
            runtime.phase === 'entering'
              ? progress
              : runtime.phase === 'exiting'
                ? 1 - progress * 0.55
                : 1;
          const scale =
            runtime.phase === 'entering'
              ? 0.955 + progress * 0.045
              : runtime.phase === 'exiting'
                ? 1 - progress * 0.035
                : 1;
          const offsetY =
            runtime.phase === 'entering'
              ? (1 - progress) * 7
              : runtime.phase === 'exiting'
                ? progress * 6
                : 0;
          drawPose(
            context,
            atlas,
            runtime.current,
            styleRef.current,
            timestamp - runtime.loopStartedAt,
            opacity,
            scale,
            offsetY,
            reducedMotion,
          );
        }
      }
      frame = window.requestAnimationFrame(render);
    };

    frame = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(frame);
  }, [reducedMotion, ready]);

  const clip = ANIMATION_CLIPS[liveState];
  return (
    <figure
      className={cn(
        'pixel-companion-canvas-wrap',
        compact && 'is-compact',
        className,
      )}
      data-ready={ready}
      aria-label={`像素学习搭子：${clip.label}，${ANIMATION_PHASE_LABELS[phase]}`}
    >
      {!ready && (
        <div
          className="sprite-frame companion-static-fallback"
          aria-hidden="true"
        />
      )}
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="pixel-companion-canvas"
        aria-hidden="true"
      />
      <span className="sr-only" aria-live="polite">
        {clip.label}
      </span>
    </figure>
  );
}

function advanceRuntime(
  runtime: Runtime,
  timestamp: number,
  reducedMotion: boolean,
  setPhase: (phase: AnimationPhase, timestamp: number) => void,
) {
  const elapsed = timestamp - runtime.phaseStartedAt;
  const clip = ANIMATION_CLIPS[runtime.current];
  if (runtime.phase === 'looping' && runtime.desired !== runtime.current) {
    runtime.from = runtime.current;
    runtime.to = runtime.desired;
    setPhase('exiting', timestamp);
    return;
  }
  if (
    runtime.phase === 'exiting' &&
    elapsed >= (reducedMotion ? 80 : clip.exitMs)
  ) {
    runtime.to = runtime.desired;
    setPhase('transitioning', timestamp);
    return;
  }
  if (
    runtime.phase === 'transitioning' &&
    elapsed >= (reducedMotion ? 100 : TRANSITION_MS)
  ) {
    runtime.current = runtime.desired;
    runtime.to = runtime.current;
    setPhase('entering', timestamp);
    return;
  }
  if (
    runtime.phase === 'entering' &&
    elapsed >= (reducedMotion ? 80 : ANIMATION_CLIPS[runtime.current].enterMs)
  ) {
    setPhase('looping', timestamp);
  }
}

function drawPose(
  context: CanvasRenderingContext2D,
  atlas: HTMLCanvasElement,
  state: AnimationState,
  style: AvatarStyle,
  elapsed: number,
  opacity: number,
  scale: number,
  offsetY: number,
  reducedMotion: boolean,
) {
  const clip = ANIMATION_CLIPS[state];
  const frameDuration = 1000 / clip.fps;
  const frameIndex = reducedMotion
    ? 0
    : Math.floor(elapsed / frameDuration) % clip.loopFrames;
  const motion = motionFor(
    clip.motion,
    frameIndex,
    clip.loopFrames,
    elapsed,
    reducedMotion,
  );
  const cellWidth = atlas.width / 5;
  const cellHeight = atlas.height / 2;
  const sourceX = (clip.poseIndex % 5) * cellWidth;
  const sourceY = Math.floor(clip.poseIndex / 5) * cellHeight;
  // The original atlas is hand-spaced: celebration must exclude the next pose's bag.
  const left = clip.poseIndex === 4 ? -0.1 : 0;
  const span = clip.poseIndex === 3 ? 0.91 : clip.poseIndex === 4 ? 1.1 : 1;
  const size = 410;
  const centerX = CANVAS_WIDTH / 2;
  const centerY = CANVAS_HEIGHT / 2 + 4;

  context.save();
  context.globalAlpha = Math.max(0, Math.min(1, opacity * motion.opacity));
  context.translate(centerX + motion.x, centerY + offsetY + motion.y);
  context.rotate(motion.rotation);
  context.scale(scale * motion.scaleX, scale * motion.scaleY);
  drawHairExtension(context, clip.poseIndex, style, size);
  context.drawImage(
    atlas,
    sourceX + left * cellWidth,
    sourceY,
    cellWidth * span,
    cellHeight,
    -size / 2 + left * size,
    -size / 2,
    size * span,
    size,
  );
  if (style.accessory === 'glasses') drawGlasses(context, clip.poseIndex, size);
  context.restore();
}

function motionFor(
  profile: string,
  frame: number,
  totalFrames: number,
  elapsed: number,
  reduced: boolean,
) {
  if (reduced)
    return { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1 };
  const cycle = (frame / totalFrames) * Math.PI * 2;
  const slow = (elapsed / 1000) * Math.PI * 2;
  if (profile === 'wave')
    return {
      x: Math.sin(cycle) * 1.4,
      y: Math.sin(cycle * 2) * 2.4,
      rotation: Math.sin(cycle) * 0.016,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
    };
  if (profile === 'ponder')
    return {
      x: Math.sin(slow * 0.35) * 1.5,
      y: Math.cos(cycle) * 1.2,
      rotation: Math.sin(slow * 0.4) * 0.012,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
    };
  if (profile === 'bounce')
    return {
      x: Math.sin(cycle) * 1.2,
      y: -Math.abs(Math.sin(cycle)) * 9,
      rotation: Math.sin(cycle) * 0.02,
      scaleX: 1 + Math.sin(cycle) * 0.015,
      scaleY: 1 - Math.sin(cycle) * 0.015,
      opacity: 1,
    };
  if (profile === 'focus')
    return {
      x: 0,
      y: Math.sin(cycle) * 1.2,
      rotation: Math.sin(slow * 0.5) * 0.004,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
    };
  if (profile === 'write')
    return {
      x: Math.sin(cycle * 2) * 0.8,
      y: Math.abs(Math.sin(cycle * 2)) * 1.3,
      rotation: Math.sin(cycle) * 0.005,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
    };
  if (profile === 'listen')
    return {
      x: 0,
      y: Math.sin(cycle) * 1.5,
      rotation: Math.sin(cycle) * 0.009,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
    };
  if (profile === 'sway')
    return {
      x: Math.sin(cycle) * 2.5,
      y: Math.cos(cycle) * 1.5,
      rotation: Math.sin(cycle) * 0.022,
      scaleX: 1,
      scaleY: 0.99,
      opacity: 0.96,
    };
  if (profile === 'sleep')
    return {
      x: 0,
      y: Math.sin(slow * 0.7) * 1.5,
      rotation: 0,
      scaleX: 1 + Math.sin(slow * 0.7) * 0.006,
      scaleY: 1 - Math.sin(slow * 0.7) * 0.006,
      opacity: 0.82,
    };
  if (profile === 'stretch')
    return {
      x: Math.sin(cycle) * 1.5,
      y: -Math.abs(Math.sin(cycle)) * 4.5,
      rotation: Math.sin(cycle) * 0.014,
      scaleX: 1 + Math.sin(cycle) * 0.012,
      scaleY: 1.02,
      opacity: 1,
    };
  return {
    x: 0,
    y: Math.sin(slow * 0.72) * 2.5,
    rotation: 0,
    scaleX: 1 + Math.sin(slow * 0.72) * 0.004,
    scaleY: 1 - Math.sin(slow * 0.72) * 0.004,
    opacity: 1,
  };
}

function buildPixelDissolvePath(
  context: CanvasRenderingContext2D,
  progress: number,
) {
  const block = 20;
  context.beginPath();
  for (let y = 0; y < CANVAS_HEIGHT; y += block) {
    for (let x = 0; x < CANVAS_WIDTH; x += block) {
      const threshold = (((x / block) * 37 + (y / block) * 17) % 101) / 100;
      if (threshold <= progress) context.rect(x, y, block + 1, block + 1);
    }
  }
}

function tintAtlas(
  image: HTMLImageElement,
  style: AvatarStyle,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return canvas;
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const hair = hexToRgb(style.hairColor);
  const top = hexToRgb(style.topColor);
  const skin = hexToRgb(style.skinTone);
  const bottom = hexToRgb(style.bottomColor);
  for (let index = 0; index < pixels.data.length; index += 4) {
    if (pixels.data[index + 3] < 12) continue;
    const red = pixels.data[index];
    const green = pixels.data[index + 1];
    const blue = pixels.data[index + 2];
    const { hue, saturation, lightness } = rgbToHsl(red, green, blue);
    let target: [number, number, number] | undefined;
    let baseLightness = 0.5;
    if (saturation > 0.22 && hue >= 286 && hue <= 350 && lightness < 0.72) {
      target = hair;
      baseLightness = 0.28;
    } else if (saturation > 0.28 && hue >= 235 && hue < 286) {
      target = top;
      baseLightness = 0.48;
    } else if (hue >= 5 && hue <= 38 && saturation > 0.22 && lightness > 0.56) {
      target = skin;
      baseLightness = 0.78;
    } else if (
      hue >= 32 &&
      hue <= 70 &&
      saturation < 0.35 &&
      lightness > 0.68
    ) {
      target = bottom;
      baseLightness = 0.84;
    }
    if (!target) continue;
    const shade = Math.max(
      0.38,
      Math.min(1.35, (lightness + 0.05) / (baseLightness + 0.05)),
    );
    pixels.data[index] = Math.min(255, target[0] * shade);
    pixels.data[index + 1] = Math.min(255, target[1] * shade);
    pixels.data[index + 2] = Math.min(255, target[2] * shade);
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}

function drawHairExtension(
  context: CanvasRenderingContext2D,
  poseIndex: number,
  style: AvatarStyle,
  size: number,
) {
  if (style.hairStyleId === 'short') return;
  const anchors = [
    [0.6, 0.27],
    [0.5, 0.27],
    [0.5, 0.27],
    [0.375, 0.27],
    [0.44, 0.43],
    [0.55, 0.29],
    [0.49, 0.3],
    [0.44, 0.3],
    [0.34, 0.41],
    [0.5, 0.3],
  ];
  const [x, y] = anchors[poseIndex];
  const centerX = (x - 0.5) * size;
  const centerY = (y - 0.5) * size;
  const pixel = Math.max(4, Math.round(size / 76));
  context.fillStyle = style.hairColor;
  const length = style.hairStyleId === 'long' ? 10 : 5;
  context.fillRect(
    centerX - pixel * 13,
    centerY + pixel * 2,
    pixel * 4,
    pixel * length,
  );
  context.fillRect(
    centerX + pixel * 9,
    centerY + pixel * 2,
    pixel * 4,
    pixel * length,
  );
  if (style.hairStyleId === 'curly') {
    for (let index = 0; index < 5; index += 1) {
      const offset = index * pixel * 2;
      context.fillRect(
        centerX - pixel * 14,
        centerY + offset,
        pixel * 3,
        pixel * 3,
      );
      context.fillRect(
        centerX + pixel * 11,
        centerY + offset,
        pixel * 3,
        pixel * 3,
      );
    }
  }
}

function drawGlasses(
  context: CanvasRenderingContext2D,
  poseIndex: number,
  size: number,
) {
  const anchors = [
    [0.6, 0.32],
    [0.5, 0.32],
    [0.5, 0.32],
    [0.375, 0.32],
    [0.44, 0.48],
    [0.55, 0.32],
    [0.49, 0.34],
    [0.44, 0.34],
    [0.34, 0.46],
    [0.5, 0.34],
  ];
  const [x, y] = anchors[poseIndex];
  const centerX = (x - 0.5) * size;
  const centerY = (y - 0.5) * size;
  const unit = Math.max(2, Math.round(size / 115));
  context.strokeStyle = '#2a1930';
  context.lineWidth = unit;
  context.strokeRect(centerX - unit * 8, centerY - unit, unit * 6, unit * 4);
  context.strokeRect(centerX + unit * 2, centerY - unit, unit * 6, unit * 4);
  context.beginPath();
  context.moveTo(centerX - unit * 2, centerY + unit);
  context.lineTo(centerX + unit * 2, centerY + unit);
  context.stroke();
}

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgbToHsl(red: number, green: number, blue: number) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue = (hue * 60 + 360) % 360;
  }
  const lightness = (max + min) / 2;
  const saturation = delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0;
  return { hue, saturation, lightness };
}
