import type { CompanionGesture } from '@/hooks/use-gesture-camera';
import type { AppData } from './sbuddy-state';

export function gameGestureAction(
  gesture: CompanionGesture,
  buddyId: string,
  focus: AppData['focus'],
): {
  action: 'greet' | 'start' | 'toggle' | 'finish' | 'none';
  message: string;
} {
  if (gesture === 'open_palm')
    return { action: 'greet', message: '已向搭子打招呼。' };
  const ongoing = focus && focus.status !== 'complete';
  if (ongoing && focus.buddyId !== buddyId)
    return {
      action: 'none',
      message: '这轮专注属于另一位搭子，请切回 TA 后操作。',
    };
  if (gesture === 'victory')
    return ongoing
      ? { action: 'none', message: '已有专注会话，握拳可暂停或继续。' }
      : { action: 'start', message: '开始 10 分钟专注，一起加油。' };
  if (gesture === 'thumb_down')
    return {
      action: ongoing && focus.status === 'running' ? 'toggle' : 'none',
      message: '先休息一下，准备好了再继续。',
    };
  if (!ongoing)
    return { action: 'none', message: '还没有进行中的专注，比个 V 开始吧。' };
  if (gesture === 'closed_fist')
    return {
      action: 'toggle',
      message: focus.status === 'running' ? '专注已暂停。' : '专注已继续。',
    };
  return { action: 'finish', message: '已结束本轮专注，辛苦啦。' };
}
