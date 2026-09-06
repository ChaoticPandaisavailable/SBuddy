import {
  createAppData,
  earnBond,
  localDate,
  type AppData,
} from './sbuddy-state';

export const SHOWCASE_STORAGE_KEY = 'sbuddy-showcase-v1';
export const SHOWCASE_URL = '/?demo=1#play';
export function isShowcase(search: string) {
  return new URLSearchParams(search).get('demo') === '1';
}

/** A separate, resettable workspace. No invented focus history or AI outputs. */
export function createShowcaseData(now = new Date()): AppData {
  const data = createAppData();
  const date = localDate(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextDate = localDate(tomorrow);
  data.demo = true;
  data.settings = { ...data.settings, muted: true, focusMinutes: 1 };
  data.buddies[0].relationship = earnBond(data.buddies[0].relationship, 48);
  data.buddies[1].relationship = earnBond(data.buddies[1].relationship, 12);
  data.buddies[0].impressions = [
    '我喜欢在晚饭后去图书馆安静地学习。',
    '我习惯把任务拆成小步骤。',
  ];
  data.events = [
    {
      id: 'demo-class',
      date,
      day: now.getDay(),
      time: '09:00',
      end: '10:30',
      title: '人机交互 · 设计原型',
      kind: 'class',
      location: '教学楼 B203',
    },
    {
      id: 'demo-study',
      date,
      day: now.getDay(),
      time: '14:00',
      end: '15:30',
      title: '图书馆 · 复习交互设计',
      kind: 'study',
      location: '图书馆二层',
    },
    {
      id: 'demo-meeting',
      date,
      day: now.getDay(),
      time: '19:00',
      end: '20:00',
      title: '小组会议 · 演示彩排',
      kind: 'meeting',
      location: '线上会议',
    },
  ];
  data.campus.todos = ['完成一轮专注', '整理课堂纪要', '检查明天的安排'].map(
    (title, i) => ({
      id: `demo-todo-${i}`,
      title,
      dueAt: `${date}T23:59`,
      reminderTimes: [],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }),
  );
  data.campus.courses = [
    {
      id: 'demo-course',
      semester: data.campus.activeSemester,
      courseName: '人机交互',
      teacher: '林老师',
      location: '教学楼 B203',
      weekday: now.getDay() || 7,
      periods: [3, 4],
      weeks: [1, 2, 3, 4],
      startMinutes: 600,
      endMinutes: 690,
      source: 'manual',
    },
  ];
  data.campus.exams = [
    {
      id: 'demo-exam',
      courseName: '交互设计 · 随堂测验',
      date: nextDate,
      time: '10:00-11:00',
      location: '教学楼 B203',
      source: 'manual',
    },
  ];
  data.material = `${nextDate} 14:00-15:00 图书馆自习，地点：图书馆二层\n${nextDate} 16:00-17:00 设计小组会议，地点：教学楼 B203`;
  data.note.title = '项目小组 · 演示准备';
  data.note.transcript =
    '今天确定了学习搭子的演示顺序：先认识角色，再安排日程，最后完成专注。小林负责检查手机布局，需要在明天中午前完成。小周负责准备三分钟讲解稿。下一步需要整理课堂材料，并在周五进行一次彩排。';
  data.courseware = {
    title: '人机交互 · 设计原则',
    material:
      '# 反馈与可见性\n每一次操作都应有可理解的反馈。重要状态应始终可见，减少用户猜测。\n\n# 一致性与控制感\n同类操作使用一致的名称和位置。允许撤销操作，帮助用户从错误中恢复。\n\n# 降低认知负担\n一次呈现少量有意义的选择。用清晰的视觉层级，让下一步容易发现。',
  };
  return data;
}

export function localNoteSummary(transcript: string) {
  const sentences = transcript
    .split(/(?<=[。！？!?])|\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    summary: sentences.slice(0, 2).join(''),
    highlights: sentences.slice(0, 3),
    actionItems: sentences
      .filter((s) => /需要|负责|截止|下一步|^(请|准备|完成)/.test(s))
      .slice(0, 8),
    addedActions: [] as number[],
    source: 'fallback',
  };
}
