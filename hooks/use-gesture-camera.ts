'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { GestureRecognizer } from '@mediapipe/tasks-vision';

export type CameraStatus =
  | 'off'
  | 'requesting'
  | 'loading'
  | 'active'
  | 'denied'
  | 'unsupported'
  | 'error';

export type CompanionGesture =
  | 'open_palm'
  | 'closed_fist'
  | 'thumb_up'
  | 'thumb_down'
  | 'victory';

export type GestureReading = {
  gesture: CompanionGesture;
  confidence: number;
};

type GestureCameraOptions = {
  onGesture: (gesture: CompanionGesture) => void;
};

const MODEL_PATH = '/mediapipe/gesture_recognizer.task';
const WASM_PATH = '/mediapipe/wasm';
const DETECTION_INTERVAL_MS = 180;
const STABLE_GESTURE_MS = 650;
const REARM_MS = 450;
const GLOBAL_COOLDOWN_MS = 1_500;

const gestureNames: Partial<Record<string, CompanionGesture>> = {
  Open_Palm: 'open_palm',
  Closed_Fist: 'closed_fist',
  Thumb_Up: 'thumb_up',
  Thumb_Down: 'thumb_down',
  Victory: 'victory',
};

export function useGestureCamera({ onGesture }: GestureCameraOptions) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | undefined>(undefined);
  const generation = useRef(0);
  const recognizerRef = useRef<GestureRecognizer | undefined>(undefined);
  const detectorTimer = useRef<number | undefined>(undefined);
  const callbackRef = useRef(onGesture);
  const candidateRef = useRef<
    { gesture: CompanionGesture; since: number } | undefined
  >(undefined);
  const latchedGesture = useRef<CompanionGesture | undefined>(undefined);
  const neutralSince = useRef<number | undefined>(undefined);
  const lastTriggeredAt = useRef(0);
  const [status, setStatus] = useState<CameraStatus>('off');
  const [reading, setReading] = useState<GestureReading>();

  useEffect(() => {
    callbackRef.current = onGesture;
  }, [onGesture]);

  const resetRecognition = useCallback(() => {
    candidateRef.current = undefined;
    latchedGesture.current = undefined;
    neutralSince.current = undefined;
    lastTriggeredAt.current = 0;
    setReading(undefined);
  }, []);

  const stop = useCallback(() => {
    generation.current++;
    if (detectorTimer.current) window.clearInterval(detectorTimer.current);
    detectorTimer.current = undefined;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = undefined;
    recognizerRef.current?.close();
    recognizerRef.current = undefined;
    if (videoRef.current) videoRef.current.srcObject = null;
    resetRecognition();
    setStatus('off');
  }, [resetRecognition]);

  const start = useCallback(async () => {
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof WebAssembly === 'undefined'
    ) {
      setStatus('unsupported');
      return;
    }

    const token = ++generation.current;
    setStatus('requesting');
    resetRecognition();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 480 },
          height: { ideal: 360 },
          frameRate: { ideal: 15, max: 24 },
        },
        audio: false,
      });
      if (token !== generation.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) throw new Error('Gesture camera preview is unavailable');
      video.srcObject = stream;
      await video.play();

      if (token !== generation.current) return;
      setStatus('loading');
      const { FilesetResolver, GestureRecognizer } =
        await import('@mediapipe/tasks-vision');
      const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
      const recognizer = await GestureRecognizer.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_PATH },
        runningMode: 'VIDEO',
        numHands: 1,
        minHandDetectionConfidence: 0.58,
        minHandPresenceConfidence: 0.58,
        minTrackingConfidence: 0.55,
        cannedGesturesClassifierOptions: {
          scoreThreshold: 0.66,
          categoryAllowlist: [
            'Open_Palm',
            'Closed_Fist',
            'Thumb_Up',
            'Thumb_Down',
            'Victory',
          ],
        },
      });
      if (token !== generation.current) {
        recognizer.close();
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      recognizerRef.current = recognizer;
      setStatus('active');

      const analyzeFrame = () => {
        if (
          document.hidden ||
          video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
        )
          return;

        const topResult = recognizer.recognizeForVideo(video, performance.now())
          .gestures[0]?.[0];
        const gesture = topResult
          ? gestureNames[topResult.categoryName]
          : undefined;
        const now = performance.now();

        if (!gesture || !topResult || topResult.score < 0.66) {
          candidateRef.current = undefined;
          setReading(undefined);
          if (!neutralSince.current) neutralSince.current = now;
          if (now - neutralSince.current >= REARM_MS)
            latchedGesture.current = undefined;
          return;
        }

        neutralSince.current = undefined;
        setReading({ gesture, confidence: topResult.score });

        if (candidateRef.current?.gesture !== gesture) {
          candidateRef.current = { gesture, since: now };
          return;
        }

        const stableFor = now - candidateRef.current.since;
        const cooledDown = now - lastTriggeredAt.current >= GLOBAL_COOLDOWN_MS;
        if (
          stableFor < STABLE_GESTURE_MS ||
          !cooledDown ||
          latchedGesture.current === gesture
        )
          return;

        latchedGesture.current = gesture;
        lastTriggeredAt.current = now;
        callbackRef.current(gesture);
      };

      detectorTimer.current = window.setInterval(
        analyzeFrame,
        DETECTION_INTERVAL_MS,
      );
      analyzeFrame();
    } catch (error) {
      if (token !== generation.current) return;
      if (detectorTimer.current) window.clearInterval(detectorTimer.current);
      detectorTimer.current = undefined;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = undefined;
      recognizerRef.current?.close();
      recognizerRef.current = undefined;
      if (videoRef.current) videoRef.current.srcObject = null;
      const permissionError =
        error instanceof DOMException &&
        (error.name === 'NotAllowedError' ||
          error.name === 'PermissionDeniedError');
      setStatus(permissionError ? 'denied' : 'error');
    }
  }, [resetRecognition]);

  const invalidate = useCallback(() => {
    generation.current++;
  }, []);
  useEffect(
    () => () => {
      invalidate();
      if (detectorTimer.current) window.clearInterval(detectorTimer.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      recognizerRef.current?.close();
    },
    [invalidate],
  );

  return { videoRef, status, reading, start, stop };
}
