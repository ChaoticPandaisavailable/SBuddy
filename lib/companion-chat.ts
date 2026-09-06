export const supportModes = {
  listen: '听我说说就好',
  advice: '帮我一起想办法',
  pause: '陪我缓一会儿',
} as const;
export type SupportMode = keyof typeof supportModes;
export type ChatMessage = { role: 'user' | 'assistant'; text: string };
export function isSupportMode(value: unknown): value is SupportMode {
  return typeof value === 'string' && Object.hasOwn(supportModes, value);
}
export function validChatMessages(value: unknown): value is ChatMessage[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 16 &&
    value.every(
      (m) =>
        m &&
        ['user', 'assistant'].includes(m.role) &&
        typeof m.text === 'string' &&
        m.text.trim().length > 0 &&
        m.text.length <= 2000,
    ) &&
    value.at(-1)?.role === 'user'
  );
}
export function proactiveLine(kind: 'entry' | 'focus', personality: string) {
  if (kind === 'focus')
    return personality.includes('吐槽')
      ? '这一轮完成啦，肩膀也该下班两分钟了。要不要歇歇？'
      : '这一轮辛苦了，要不要起来走两步，或者和我聊聊？';
  return personality.includes('吐槽')
    ? '来啦，今天先拿哪个小目标练手？也可以先聊两句。'
    : '你来啦。今天想先忙哪一件，还是先和我说说话？';
}
