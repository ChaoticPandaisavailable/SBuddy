import { campusScheduleEvents } from './campus-data';
import { eventsForDays } from './calendar-layout';
import { getScheduleSnapshot } from './schedule-engine';
import {
  clickDesk,
  normalizeBehavior,
  type DeskActivity,
} from './companion-behavior';
import { updateBuddy, type AppData } from './sbuddy-state';
import {
  creditReward,
  eventRewardKey,
  manualElapsed,
  reserveReward,
  type ManualSession,
} from './bond-scoring';

export function selectManualActivity(
  data: AppData,
  buddyId: string,
  activity: DeskActivity,
  now: number,
  sessionId: string,
): AppData {
  const buddy = data.buddies.find((b) => b.id === buddyId);
  if (!buddy) return data;
  const behavior = normalizeBehavior(buddy.behavior);
  const result = clickDesk(behavior, activity);
  const session = behavior.manualSession;
  let next = data;
  if (result.completed && session && manualElapsed(session, now) >= 60000)
    next = creditReward(next, session.rewardKey, buddyId);
  const manualSession: ManualSession | undefined = result.completed
    ? undefined
    : {
        id: sessionId,
        rewardKey: JSON.stringify(['manual', buddyId, sessionId]),
        elapsedMs: 0,
        runningSince: now,
      };
  return updateBuddy(next, buddyId, (b) => ({
    ...b,
    behavior: { ...result.behavior, manualSession },
  }));
}
export function beginFocus(
  data: AppData,
  minutes: number,
  now: number,
  id: string,
): AppData {
  if (data.focus && data.focus.status !== 'complete') return data;
  const buddyId = data.activeBuddyId;
  const buddy = data.buddies.find((b) => b.id === buddyId)!;
  const behavior = normalizeBehavior(buddy.behavior);
  const existingManual =
    behavior.mode === 'manual' && behavior.activity === 'study'
      ? behavior.manualSession
      : undefined;
  const date = new Date(now);
  const current = getScheduleSnapshot(
    [
      ...eventsForDays(data.events, [date]),
      ...campusScheduleEvents(data.campus),
    ],
    date,
  ).currentEvent;
  // An older manual activity acquires its own session rather than borrowing the calendar's identity.
  const manualStudy =
    behavior.mode === 'manual' && behavior.activity === 'study';
  const rewardKey =
    existingManual?.rewardKey ??
    (manualStudy
      ? JSON.stringify(['manual', buddyId, id])
      : current?.kind === 'study'
        ? eventRewardKey(current)
        : JSON.stringify(['self-study', buddyId, id]));
  const session = existingManual
    ? { ...existingManual, runningSince: existingManual.runningSince ?? now }
    : {
        id,
        rewardKey,
        elapsedMs: 0,
        runningSince: now,
      };
  const duration = Math.max(1, Math.min(180, minutes)) * 60;
  const next = reserveReward(data, rewardKey, buddyId);
  return {
    ...updateBuddy(next, buddyId, (b) => ({
      ...b,
      behavior: {
        ...behavior,
        mode: 'manual',
        activity: 'study',
        manualSession: session,
      },
    })),
    focus: {
      id,
      buddyId,
      duration,
      remaining: duration,
      endsAt: now + duration * 1000,
      status: 'running',
      rewardKey,
    },
  };
}
export function pauseManualActivity(
  data: AppData,
  buddyId: string,
  paused: boolean,
  now: number,
): AppData {
  return updateBuddy(data, buddyId, (buddy) => {
    const behavior = normalizeBehavior(buddy.behavior),
      session = behavior.manualSession;
    if (!session) return buddy;
    return {
      ...buddy,
      behavior: {
        ...behavior,
        manualSession: {
          ...session,
          elapsedMs: manualElapsed(session, now),
          runningSince: paused ? undefined : now,
        },
      },
    };
  });
}
