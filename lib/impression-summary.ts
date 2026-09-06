import type { Buddy, FocusRecord } from './sbuddy-state';

// Summaries describe explicit preferences, never infer personality or identity.
const preferences: Record<string, Record<string, string>> = {
  reminderStyle: {
    quiet: '你更喜欢不被打扰的陪伴，我会给你留出安静的空间',
    gentle: '你希望提醒温和一些，我会放轻语气',
    direct: '你更看重清楚直接的提醒，我会把重点说在前面',
  },
  taskApproach: {
    tiny: '面对任务时，从容易完成的小步骤开始更合你的节奏',
    'tiny-step': '面对任务时，从容易完成的小步骤开始更合你的节奏',
    'single-entry': '面对任务时，从容易完成的小步骤开始更合你的节奏',
    plan: '开始之前，你更希望先理清计划',
    overview: '开始之前，你更希望先理清计划',
    space: '卡住的时候，你希望先留一点时间自己调整',
    'urgent-first': '安排任务时，你会优先处理紧急的事情',
    'easy-first': '先完成容易的任务，更能帮你进入学习状态',
    'important-first': '安排任务时，你更愿意先留时间给重要的事情',
    'draft-first': '你更愿意先做出一个初稿，再逐步完善',
    'sprint-boring': '面对枯燥的任务，你偏向用短时专注推进',
  },
  socialTone: {
    playful: '你喜欢轻松一点的交流',
    warm: '交流时，你更希望得到温和的回应',
    'warm-welcome': '重新见面时，你希望先得到一点关心',
    'quiet-return': '回来之后，你更喜欢安静地接着学习',
    'resume-direct': '重新开始时，你希望我帮你接上之前的进度',
  },
  breakStyle: {
    walk: '休息时，你倾向于起身走走',
    rest: '休息时，你更愿意安静地放松',
    music: '休息时，音乐是你喜欢的放松方式',
    phone: '休息时，你会选择看看手机',
    continue: '状态好的时候，你愿意再继续一小段',
    short: '学习间隙，你更喜欢短暂休息后继续',
    done: '完成一轮后，你希望适时收尾',
  },
};

/** Recomputed from the current buddy's records, so edits/removals cannot leave stale prose. */
export function summarizeImpression(
  buddy: Buddy,
  history: FocusRecord[],
): string {
  const facts = new Map<string, string>();
  for (const [key, value] of Object.entries(buddy.relationship.preferences)) {
    const text = preferences[key]?.[value];
    if (text) facts.set(key, text);
  }
  for (const note of buddy.impressions) {
    for (const clause of note
      .split(/[，,。；;！!？?\n]|但是|不过|而是/)
      .map((s) => s.trim())) {
      const negative = /不喜欢|不想|不要|不习惯|不再|讨厌/.test(clause);
      if (/图书馆/.test(clause) && /喜欢|习惯|常|去|不要|不再/.test(clause)) {
        facts.set(
          'place',
          negative
            ? '选择学习地点时，你会避开图书馆'
            : '图书馆是你偏好的学习地点',
        );
      }
      if (/宿舍/.test(clause) && /喜欢|习惯|常|待|不要|不再/.test(clause)) {
        facts.set(
          'place',
          negative ? '你更希望在宿舍以外的地方学习' : '你更习惯在宿舍学习',
        );
      }
      if (!negative && /喜欢|习惯|通常|经常|更想|希望/.test(clause)) {
        if (/晚饭后|晚餐后/.test(clause))
          facts.set('time', '你更习惯在晚饭后安排学习');
        else if (/晚上|夜里/.test(clause))
          facts.set('time', '你习惯把学习安排在晚上');
        else if (/早上|早晨|清晨/.test(clause))
          facts.set('time', '你习惯在早晨开始学习');
        if (/安静|不打扰/.test(clause))
          facts.set('reminderStyle', preferences.reminderStyle.quiet);
        if (/直接.*提醒/.test(clause))
          facts.set('reminderStyle', preferences.reminderStyle.direct);
        if (/温柔|温和|轻轻.*提醒/.test(clause))
          facts.set('reminderStyle', preferences.reminderStyle.gentle);
        if (/先.*计划|列.*计划/.test(clause))
          facts.set('taskApproach', preferences.taskApproach.plan);
        if (/小步|拆小|最小/.test(clause))
          facts.set('taskApproach', preferences.taskApproach['tiny-step']);
        if (/听歌|音乐/.test(clause))
          facts.set('interest', '音乐是你的兴趣之一');
        if (/阅读|看书/.test(clause))
          facts.set('interest', '阅读是你的兴趣之一');
        if (/跑步|散步/.test(clause))
          facts.set('interest', '你喜欢通过走动或运动活动身体');
      }
      if (/不想被打扰|不要打扰|不喜欢.*催/.test(clause))
        facts.set('reminderStyle', preferences.reminderStyle.quiet);
      if (
        /容易分心|很难集中|注意力不集中/.test(clause) &&
        !/不容易|不再|没有/.test(clause)
      )
        facts.set(
          'taskApproach',
          '你提到专注有时会被打断，我会陪你先从短一点的任务开始',
        );
      const subject = clause.match(
        /(?:我的专业是|我正在学习|我在学)([^，。；！？]{2,16})$/,
      )?.[1];
      if (subject && !negative) facts.set('subject', `你目前在学习${subject}`);
      if (negative && /早上|早晨|清晨|晚上|夜里|晚饭后|晚餐后/.test(clause))
        facts.delete('time');
      if (negative && /听歌|音乐|阅读|看书|跑步|散步/.test(clause))
        facts.delete('interest');
    }
  }
  // Fold place/time into a single description instead of listing copied answers.
  const place = facts.get('place'),
    time = facts.get('time');
  facts.delete('place');
  facts.delete('time');
  if (place || time)
    facts.set('habit', [place, time].filter(Boolean).join('，而'));
  const latest = history
    .filter((r) => r.buddyId === buddy.id && r.feedback)
    .sort((a, b) => b.at.localeCompare(a.at))[0];
  const feedback: Record<string, string> = {
    steady: '最近一次专注的节奏对你来说比较合适，我们可以沿用这个步调',
    ready: '最近一次专注后，你还有余力，可以按状态决定是否继续',
    tired: '最近一次专注后你有些疲惫，下次我会先提醒你留出休息',
    distracted: '最近一次专注比较容易分心，下次可以先试试更短的一轮',
  };
  const sentences = [
    ...new Set(
      [
        facts.get('habit') ?? facts.get('interest'),
        facts.get('reminderStyle') ?? facts.get('socialTone'),
        facts.get('taskApproach') ??
          facts.get('breakStyle') ??
          facts.get('subject'),
      ].filter((text): text is string => !!text),
    ),
  ];
  if (latest?.feedback && feedback[latest.feedback])
    sentences.push(feedback[latest.feedback]);
  return sentences.length
    ? sentences.map((s) => s + '。').join('')
    : '我还在了解你的学习习惯。';
}
