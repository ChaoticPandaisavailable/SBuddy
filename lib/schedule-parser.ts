export type EventKind = 'class' | 'study' | 'meeting' | 'personal';
export type ScheduleEvent = {
  id: string;
  day: number;
  date?: string;
  time: string;
  end: string;
  title: string;
  kind: EventKind;
  location?: string;
  source?: 'material' | 'campus-course' | 'campus-exam' | 'campus-todo';
};
export const initialEvents: ScheduleEvent[] = [];
export function dateString(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}
export function resolveDate(
  line: string,
  reference = new Date(),
): string | undefined {
  const ref = new Date(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate(),
    12,
  );
  const iso = line.match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?/);
  const md = line.match(/(\d{1,2})月(\d{1,2})[日号]?/);
  const day = line.match(/(\d{1,2})[日号]/);
  if (iso || md || day) {
    const year = iso ? Number(iso[1]) : ref.getFullYear();
    const month = iso
      ? Number(iso[2])
      : md
        ? Number(md[1])
        : ref.getMonth() + 1;
    const d = iso ? Number(iso[3]) : md ? Number(md[2]) : Number(day![1]);
    const date = new Date(year, month - 1, d, 12);
    return date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === d
      ? dateString(date)
      : undefined;
  }
  if (/今天|明天|后天/.test(line)) {
    ref.setDate(
      ref.getDate() +
        (line.includes('后天') ? 2 : line.includes('明天') ? 1 : 0),
    );
    return dateString(ref);
  }
  const weekday = line.match(/(下周|本周|这周|周|星期)([一二三四五六日天])/);
  if (weekday) {
    const target = '一二三四五六日'.indexOf(
      weekday[2] === '天' ? '日' : weekday[2],
    );
    const current = (ref.getDay() + 6) % 7;
    const offset =
      weekday[1] === '下周'
        ? 7 + target - current
        : /本周|这周/.test(weekday[1])
          ? target - current
          : (target - current + 7) % 7;
    ref.setDate(ref.getDate() + offset);
    return dateString(ref);
  }
  return undefined;
}
export function parseScheduleMaterial(
  material: string,
  reference = new Date(),
): ScheduleEvent[] {
  return material
    .split(/\r?\n|[；;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((line, index) => {
      const date = resolveDate(line, reference);
      const kind: EventKind = /自习|复习|论文|阅读/.test(line)
        ? 'study'
        : /会议|开会|组会|讨论/.test(line)
          ? 'meeting'
          : /课|讲座/.test(line)
            ? 'class'
            : 'personal';
      const matches = [
        ...line.matchAll(/(\d{1,2})(?:[:：](\d{2})|点(?:(\d{1,2})分?)?)/g),
      ];
      const format = (m: RegExpMatchArray) => {
        let hour = Number(m[1]);
        const minute = Number(m[2] ?? m[3] ?? 0);
        if (/下午|晚上/.test(line.slice(0, m.index)) && hour < 12) hour += 12;
        return hour < 24 && minute < 60
          ? String(hour).padStart(2, '0') +
              ':' +
              String(minute).padStart(2, '0')
          : '';
      };
      const time = matches[0] ? format(matches[0]) : '';
      const end = matches[1] ? format(matches[1]) : '';
      const location = line
        .match(/(?:地点[:：]?|在)([^，,。]+?)(?=自习|开会|上课|，|,|$)/)?.[1]
        ?.trim();
      const title =
        line
          .replace(/(?:\d{4}[-/年])?\d{1,2}[-/月]\d{1,2}日?/g, '')
          .replace(/\d{1,2}[日号]/g, '')
          .replace(
            /今天|明天|后天|(?:下周|本周|这周|周|星期)[一二三四五六日天]/g,
            '',
          )
          .replace(
            /(?:上午|下午|晚上|凌晨)?\s*\d{1,2}(?:[:：]\d{2}|点(?:\d{1,2}分?)?)/g,
            '',
          )
          .replace(/(?:地点[:：]?|在)[^，,。]+/g, '')
          .replace(/^[\s，,到至—–-]+|[\s，,到至—–-]+$/g, '') || line;
      return {
        id: 'parsed-' + Date.now() + '-' + index,
        day: date ? Number(date.slice(-2)) : 0,
        date,
        time,
        end,
        title: title.slice(0, 80),
        kind,
        location,
        source: 'material' as const,
      };
    });
}
