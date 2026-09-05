export type AnimationState =
  | 'idle'
  | 'greet'
  | 'think'
  | 'cheer'
  | 'study'
  | 'class'
  | 'meeting'
  | 'tired'
  | 'away'
  | 'returning';

export type AnimationPhase = 'exiting' | 'transitioning' | 'entering' | 'looping';

export type MotionProfile =
  | 'breathe'
  | 'wave'
  | 'ponder'
  | 'bounce'
  | 'focus'
  | 'write'
  | 'listen'
  | 'sway'
  | 'sleep'
  | 'stretch';

export type AnimationClip = {
  id: AnimationState;
  label: string;
  poseIndex: number;
  fps: number;
  loopFrames: number;
  enterMs: number;
  exitMs: number;
  motion: MotionProfile;
};

export type AnimationRequest = {
  state: AnimationState;
  reason: string;
  priority: number;
  requestedAt: number;
};

export const ANIMATION_CLIPS: Record<AnimationState, AnimationClip> = {
  idle: { id: 'idle', label: '等你出发', poseIndex: 0, fps: 8, loopFrames: 8, enterMs: 220, exitMs: 170, motion: 'breathe' },
  greet: { id: 'greet', label: '向你打招呼', poseIndex: 1, fps: 10, loopFrames: 10, enterMs: 210, exitMs: 160, motion: 'wave' },
  think: { id: 'think', label: '正在思考', poseIndex: 2, fps: 8, loopFrames: 8, enterMs: 220, exitMs: 180, motion: 'ponder' },
  cheer: { id: 'cheer', label: '为你庆祝', poseIndex: 3, fps: 12, loopFrames: 12, enterMs: 180, exitMs: 170, motion: 'bounce' },
  study: { id: 'study', label: '陪你自习', poseIndex: 4, fps: 9, loopFrames: 8, enterMs: 230, exitMs: 180, motion: 'focus' },
  class: { id: 'class', label: '认真上课', poseIndex: 5, fps: 9, loopFrames: 8, enterMs: 230, exitMs: 180, motion: 'write' },
  meeting: { id: 'meeting', label: '参加会议', poseIndex: 6, fps: 9, loopFrames: 8, enterMs: 230, exitMs: 180, motion: 'listen' },
  tired: { id: 'tired', label: '有点疲惫', poseIndex: 7, fps: 8, loopFrames: 8, enterMs: 260, exitMs: 190, motion: 'sway' },
  away: { id: 'away', label: '离开休息', poseIndex: 8, fps: 8, loopFrames: 6, enterMs: 260, exitMs: 180, motion: 'sleep' },
  returning: { id: 'returning', label: '醒来伸懒腰', poseIndex: 9, fps: 10, loopFrames: 10, enterMs: 190, exitMs: 160, motion: 'stretch' },
};

export const ANIMATION_PHASE_LABELS: Record<AnimationPhase, string> = {
  exiting: '收起动作',
  transitioning: '切换情境',
  entering: '进入动作',
  looping: '持续陪伴',
};

export function modeToAnimation(mode: 'idle' | 'class' | 'study' | 'meeting'): AnimationState {
  return mode;
}
