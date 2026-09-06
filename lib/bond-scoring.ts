import type { AppData } from './sbuddy-state';
import type { ScheduleEvent } from './schedule-parser';
import { getBondLevel } from './relationship';
import { rewards } from './bond-rewards';

export type RewardGroup = {
  id: string;
  buddyId: string;
  activityCompleted: boolean;
  focusIds: string[];
};
export type ManualSession = {
  id: string;
  rewardKey: string;
  elapsedMs: number;
  runningSince?: number;
};
export function eventRewardKey(event: ScheduleEvent) {
  // Titles/times can change without turning an already rewarded occurrence into a new one.
  const courseId =
    event.originCourseId ??
    (event.source === 'campus-course'
      ? event.id.replace(/^campus-course-/, '').replace(/-\d+$/, '')
      : undefined);
  return JSON.stringify([
    'event',
    courseId ? 'campus-course' : (event.source ?? 'material'),
    courseId ?? event.id,
    event.date,
  ]);
}
export function reserveReward(
  data: AppData,
  id: string,
  buddyId: string,
): AppData {
  if (data.rewardLedger?.some((group) => group.id === id)) return data;
  return {
    ...data,
    rewardLedger: [
      ...(data.rewardLedger ?? []),
      { id, buddyId, activityCompleted: false, focusIds: [] },
    ],
  };
}
export function creditReward(
  data: AppData,
  id: string,
  buddyId: string,
  focusId?: string,
): AppData {
  if (
    focusId &&
    data.rewardLedger?.some((group) => group.focusIds.includes(focusId))
  )
    return data;
  const reserved = reserveReward(data, id, buddyId);
  const group = reserved.rewardLedger!.find((item) => item.id === id)!;
  if (!focusId && group.activityCompleted) return data;
  const next = {
    ...group,
    activityCompleted: group.activityCompleted || !focusId,
    focusIds: focusId ? [...group.focusIds, focusId] : group.focusIds,
  };
  const total = (item: RewardGroup) =>
    Math.max(item.focusIds.length, Number(item.activityCompleted));
  const delta = total(next) - total(group);
  const owner = focusId ? buddyId : group.buddyId;
  return {
    ...reserved,
    rewardLedger: reserved.rewardLedger!.map((item) =>
      item.id === id ? next : item,
    ),
    buddies: delta
      ? reserved.buddies.map((buddy) => {
          if (buddy.id !== owner) return buddy;
          const bond = buddy.relationship.bond + delta;
          return {
            ...buddy,
            relationship: {
              ...buddy.relationship,
              bond,
              bondLevel: getBondLevel(bond),
              unlocked: [
                ...new Set([
                  ...buddy.relationship.unlocked,
                  ...rewards
                    .filter((reward) => bond >= reward.threshold)
                    .map((reward) => reward.id),
                ]),
              ],
            },
          };
        })
      : reserved.buddies,
  };
}
export function manualElapsed(session: ManualSession, now: number) {
  return (
    session.elapsedMs +
    (session.runningSince === undefined
      ? 0
      : Math.max(0, now - session.runningSince))
  );
}
export function validManualSession(value: ManualSession | undefined) {
  return (
    !value ||
    (typeof value.id === 'string' &&
      value.id.length > 0 &&
      typeof value.rewardKey === 'string' &&
      value.rewardKey.length > 0 &&
      Number.isFinite(value.elapsedMs) &&
      value.elapsedMs >= 0 &&
      (value.runningSince === undefined ||
        (Number.isFinite(value.runningSince) && value.runningSince >= 0)))
  );
}
export function validateRewardLedger(value: unknown): RewardGroup[] {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    !value.every(
      (group) =>
        group &&
        typeof group.id === 'string' &&
        group.id.length > 0 &&
        typeof group.buddyId === 'string' &&
        typeof group.activityCompleted === 'boolean' &&
        Array.isArray(group.focusIds) &&
        group.focusIds.every(
          (id: unknown) => typeof id === 'string' && id.length > 0,
        ),
    )
  )
    throw new Error('默契奖励记录无效，未修改现有数据。');
  const ids = value.map((group) => group.id),
    focusIds = value.flatMap((group) => group.focusIds);
  if (
    new Set(ids).size !== ids.length ||
    new Set(focusIds).size !== focusIds.length
  )
    throw new Error('默契奖励记录重复，未修改现有数据。');
  return value;
}
