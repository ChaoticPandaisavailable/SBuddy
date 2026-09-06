'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useStudy } from './provider';
import { updateBuddy, type Buddy } from '@/lib/sbuddy-state';
import {
  clickDesk,
  normalizeBehavior,
  resolveBehavior,
  scheduleLoadMinutes,
  type DeskActivity,
} from '@/lib/companion-behavior';
import type { AnimationState } from '@/lib/companion-animation';
import type { ScheduleEvent } from '@/lib/schedule-parser';
import { selectManualActivity } from '@/lib/activity-scoring';

export function useCompanionBehavior(
  buddy: Buddy,
  events: ScheduleEvent[],
  schedule: AnimationState,
  now: Date,
  question: boolean,
) {
  const { data, setData, completion } = useStudy();
  const behavior = normalizeBehavior(buddy.behavior);
  const [travel, setTravel] = useState(false);
  const [short, setShort] = useState<{
    action: 'greet' | 'cheer';
    token: number;
  }>();
  const [pendingCheer, setPendingCheer] = useState(false);
  const counter = useRef(0);
  const lastCompletion = useRef(completion.sequence);
  const paused =
    data.focus?.buddyId === buddy.id && data.focus.status === 'paused';
  const tired =
    scheduleLoadMinutes(events, now) >= (data.settings.fatigueHours ?? 6) * 60;
  useEffect(() => {
    if (completion.sequence === lastCompletion.current) return;
    const timer = setTimeout(() => {
      lastCompletion.current = completion.sequence;
      if (
        completion.items.some((e) => !e.buddyId || e.buddyId === buddy.id) &&
        short?.action !== 'cheer'
      )
        setPendingCheer(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [completion, buddy.id, short?.action]);
  useEffect(() => {
    if (pendingCheer && !short && !question && !paused && !travel) {
      const timer = setTimeout(() => {
        setShort({ action: 'cheer', token: ++counter.current });
        setPendingCheer(false);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [pendingCheer, short, question, paused, travel]);
  // Pause suspends a short action; it is not a successful activity completion.
  useEffect(() => {
    if (paused) {
      const timer = setTimeout(() => setShort(undefined), 0);
      return () => clearTimeout(timer);
    }
  }, [paused]);
  const touch = () =>
    setData((d) =>
      updateBuddy(d, buddy.id, (b) => ({
        ...b,
        behavior: {
          ...normalizeBehavior(b.behavior),
          lastInteractionAt: Date.now(),
        },
      })),
    );
  const selectMode = (mode: 'schedule' | 'manual') =>
    setData((d) =>
      updateBuddy(d, buddy.id, (b) => ({
        ...b,
        behavior: {
          ...normalizeBehavior(b.behavior),
          mode,
          manualSession:
            normalizeBehavior(b.behavior).mode === mode
              ? b.behavior?.manualSession
              : undefined,
          activity:
            normalizeBehavior(b.behavior).mode === mode
              ? b.behavior?.activity
              : undefined,
        },
      })),
    );
  const selectActivity = (activity: DeskActivity) => {
    if (travel || paused) return;
    if (clickDesk(behavior, activity).completed && short?.action !== 'cheer')
      setPendingCheer(true);
    const sessionId = crypto.randomUUID();
    setData((d) =>
      selectManualActivity(d, buddy.id, activity, Date.now(), sessionId),
    );
  };
  const finishShort = useCallback((action: AnimationState, token: number) => {
    setShort((s) =>
      s?.action === action && s.token === token ? undefined : s,
    );
  }, []);
  const activity =
    behavior.mode === 'manual'
      ? behavior.activity
      : ['study', 'class', 'meeting'].includes(schedule)
        ? (schedule as DeskActivity)
        : undefined;
  return {
    behavior,
    activity,
    paused,
    travel,
    setTravel,
    selectMode,
    selectActivity,
    touch,
    greet: () => setShort({ action: 'greet', token: ++counter.current }),
    finishShort,
    actionToken: short?.token ?? 0,
    animation: resolveBehavior({
      behavior,
      schedule,
      tired,
      paused,
      question,
      short: short?.action,
    }),
  };
}
