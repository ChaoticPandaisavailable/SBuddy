import type { AnimationState } from '@/lib/companion-animation';
import { rewards } from './bond-rewards';

export type BondLevel = '初识' | '熟悉' | '默契' | '知心';
export type DialogueTrigger =
  | 'first_visit'
  | 'schedule_imported'
  | 'focus_complete'
  | 'return_from_away'
  | 'low_energy'
  | 'demo';

export type DialogueChoice = {
  id: string;
  label: string;
  delta: -1 | 1 | 2;
  reaction: string;
  preference?: { key: keyof RelationshipPreferences; value: string };
};

export type DialoguePrompt = {
  id: string;
  trigger: DialogueTrigger[];
  text: string;
  animation: AnimationState;
  choices: DialogueChoice[];
  minimumLevel?: BondLevel;
};

export type RelationshipPreferences = {
  reminderStyle?: string;
  taskApproach?: string;
  socialTone?: string;
  breakStyle?: string;
};

export type DialogueHistoryItem = {
  promptId: string;
  choiceId: string;
  answeredAt: string;
  delta: number;
};

export type RelationshipState = {
  schemaVersion: 1;
  bond: number;
  bondLevel: BondLevel;
  answeredPromptIds: string[];
  dialogueHistory: DialogueHistoryItem[];
  preferences: RelationshipPreferences;
  unlocked: string[];
  dailyPromptDate: string;
  dailyPromptCount: number;
  lastPromptAt?: string;
  pendingPromptId?: string;
};

export const initialRelationship: RelationshipState = {
  schemaVersion: 1,
  bond: 18,
  bondLevel: '初识',
  answeredPromptIds: [],
  dialogueHistory: [],
  preferences: {},
  unlocked: [],
  dailyPromptDate: '',
  dailyPromptCount: 0,
};

const LEVEL_ORDER: BondLevel[] = ['初识', '熟悉', '默契', '知心'];
const MIN_PROMPT_GAP = 30 * 60 * 1000;

export const dialoguePrompts: DialoguePrompt[] = [
  {
    id: 'welcome-reminders',
    trigger: ['first_visit', 'demo'],
    text: '先说好，我不是来监督你的。你更希望我怎么陪？',
    animation: 'greet',
    choices: [
      {
        id: 'gentle',
        label: '偶尔轻轻提醒我',
        delta: 2,
        reaction: '收到。我会敲敲门，不会拿着喇叭闯进来。',
        preference: { key: 'reminderStyle', value: 'gentle' },
      },
      {
        id: 'quiet',
        label: '安静待着就很好',
        delta: 2,
        reaction: '懂了。需要时抬头，我一直在。',
        preference: { key: 'reminderStyle', value: 'quiet' },
      },
      {
        id: 'direct',
        label: '可以直接一点',
        delta: 1,
        reaction: '好，那我会少绕弯子，但也不会凶你。',
        preference: { key: 'reminderStyle', value: 'direct' },
      },
    ],
  },
  {
    id: 'welcome-company',
    trigger: ['first_visit', 'demo'],
    text: '第一次搭伙学习，有件事得问清楚：你卡住时想听哪句话？',
    animation: 'think',
    choices: [
      {
        id: 'tiny',
        label: '先做最小的一步',
        delta: 2,
        reaction: '成交。以后大任务来了，我先帮你把门槛锯低。',
        preference: { key: 'taskApproach', value: 'tiny-step' },
      },
      {
        id: 'overview',
        label: '先帮我理清全局',
        delta: 2,
        reaction: '明白。先找地图，再迈第一步。',
        preference: { key: 'taskApproach', value: 'overview' },
      },
      {
        id: 'space',
        label: '先让我自己缓缓',
        delta: 1,
        reaction: '可以。暂停不等于放弃，我会给你留一点空间。',
        preference: { key: 'taskApproach', value: 'space' },
      },
    ],
  },
  {
    id: 'import-overwhelm',
    trigger: ['schedule_imported', 'demo'],
    text: '安排一下子排得满满的。现在看到它们，你第一反应是什么？',
    animation: 'think',
    choices: [
      {
        id: 'relief',
        label: '终于没那么乱了',
        delta: 2,
        reaction: '那就好。乱糟糟的东西一旦有了形状，就没那么吓人。',
      },
      {
        id: 'pressure',
        label: '还是有一点压力',
        delta: 2,
        reaction: '合理。日历只是地图，不是催债单，我们只看下一格。',
      },
      {
        id: 'avoid',
        label: '不想看，先关掉',
        delta: -1,
        reaction:
          '也行，我先收好。只是别消失太久，我会担心任务在角落偷偷长大。',
      },
    ],
  },
  {
    id: 'import-priority',
    trigger: ['schedule_imported', 'demo'],
    text: '如果今天只能推进一件事，你想让我怎么帮你挑？',
    animation: 'think',
    choices: [
      {
        id: 'urgent',
        label: '先看最紧急的',
        delta: 1,
        reaction: '紧急雷达开启，不过我也会提醒你别一直救火。',
        preference: { key: 'taskApproach', value: 'urgent-first' },
      },
      {
        id: 'easy',
        label: '先做最容易启动的',
        delta: 2,
        reaction: '很会选。先用一点进展，把发动机热起来。',
        preference: { key: 'taskApproach', value: 'easy-first' },
      },
      {
        id: 'important',
        label: '先看最重要的',
        delta: 2,
        reaction: '好。我们不被红点牵着跑，先守住真正重要的。',
        preference: { key: 'taskApproach', value: 'important-first' },
      },
    ],
  },
  {
    id: 'focus-feeling',
    trigger: ['focus_complete', 'demo'],
    text: '十分钟到了。先不评价效率，你现在身体和脑子是什么感觉？',
    animation: 'think',
    choices: [
      {
        id: 'lighter',
        label: '比开始前轻松一点',
        delta: 2,
        reaction: '看吧，最难的果然是点火。这个小胜利我替你存好了。',
      },
      {
        id: 'same',
        label: '好像没什么变化',
        delta: 1,
        reaction: '没关系。能和任务坐在一起十分钟，本身就不是零。',
      },
      {
        id: 'drained',
        label: '更累了',
        delta: 2,
        reaction: '那就停在这里。知道什么时候该收手，也是我们之间的默契。',
      },
    ],
  },
  {
    id: 'focus-next',
    trigger: ['focus_complete', 'demo'],
    text: '现在要不要继续？放心，选休息不会扣“努力分”。我们根本没有那种东西。',
    animation: 'greet',
    choices: [
      {
        id: 'continue',
        label: '再来一个专注块',
        delta: 2,
        reaction: '有余力就走，但还是一小块一小块来。',
        preference: { key: 'breakStyle', value: 'continue' },
      },
      {
        id: 'short-break',
        label: '先休息五分钟',
        delta: 2,
        reaction: '批准。去喝口水，我负责看住进度条。',
        preference: { key: 'breakStyle', value: 'short' },
      },
      {
        id: 'done',
        label: '今天先到这里',
        delta: 1,
        reaction: '收到。会停下来的人，明天才更容易回来。',
        preference: { key: 'breakStyle', value: 'done' },
      },
    ],
  },
  {
    id: 'return-greeting',
    trigger: ['return_from_away', 'demo'],
    text: '欢迎回来。离开一会儿之后，你希望我先做什么？',
    animation: 'returning',
    choices: [
      {
        id: 'resume',
        label: '直接告诉我做到哪了',
        delta: 2,
        reaction: '没问题。断点我帮你夹着书签呢。',
        preference: { key: 'reminderStyle', value: 'resume-direct' },
      },
      {
        id: 'welcome',
        label: '先跟我打个招呼',
        delta: 2,
        reaction: '欢迎回来！这句不计入工作时间，纯属搭子福利。',
        preference: { key: 'socialTone', value: 'warm-welcome' },
      },
      {
        id: 'quiet-return',
        label: '什么都不用说',
        delta: 1,
        reaction: '好。灯亮着，位置留着，我们安静接上。',
        preference: { key: 'socialTone', value: 'quiet-return' },
      },
    ],
  },
  {
    id: 'return-restart',
    trigger: ['return_from_away', 'demo'],
    text: '刚回来容易发懵。你想从哪种“重新启动”开始？',
    animation: 'think',
    choices: [
      {
        id: 'one-minute',
        label: '只做一分钟',
        delta: 2,
        reaction: '漂亮。小到不能拒绝，通常最容易真的开始。',
      },
      {
        id: 'review',
        label: '先回顾刚才的进度',
        delta: 2,
        reaction: '好，我陪你把上下文捡回来。',
      },
      {
        id: 'later',
        label: '晚点再说',
        delta: -1,
        reaction: '可以，但我会把任务放在看得见的地方，免得“晚点”偷偷跑远。',
      },
    ],
  },
  {
    id: 'low-energy-care',
    trigger: ['low_energy', 'demo'],
    text: '今天的电量看起来不太富裕。我们要不要把标准调低一点？',
    animation: 'tired',
    choices: [
      {
        id: 'lower',
        label: '好，只保留最重要的',
        delta: 2,
        reaction: '聪明。低电量模式不是偷懒，是系统保护。',
      },
      {
        id: 'tiny',
        label: '先试五分钟',
        delta: 2,
        reaction: '五分钟就五分钟。我们今天主打一个轻装上阵。',
      },
      {
        id: 'push',
        label: '不用，我想硬撑一下',
        delta: -1,
        reaction: '我尊重你，但会把水和暂停键放在手边。硬撑也得留条退路。',
      },
    ],
  },
  {
    id: 'break-preference',
    trigger: ['low_energy', 'focus_complete', 'demo'],
    text: '休息时哪种方式最能让你真的恢复，而不是换个软件继续耗电？',
    animation: 'think',
    choices: [
      {
        id: 'walk',
        label: '起来走一走',
        delta: 2,
        reaction: '记住了。下次休息我会把你从椅子上“请”起来。',
        preference: { key: 'breakStyle', value: 'walk' },
      },
      {
        id: 'music',
        label: '听一首歌',
        delta: 2,
        reaction: '好，一首歌的时间，刚好够脑内缓存清一清。',
        preference: { key: 'breakStyle', value: 'music' },
      },
      {
        id: 'scroll',
        label: '刷会儿手机',
        delta: -1,
        reaction: '诚实加分，但它有时会把五分钟吃成五十分钟。我到点敲你一下？',
        preference: { key: 'breakStyle', value: 'phone' },
      },
    ],
  },
  {
    id: 'task-pile',
    trigger: ['schedule_imported', 'low_energy', 'demo'],
    text: '任务堆起来时，你更容易卡在哪一步？我想把吐槽用在刀刃上。',
    animation: 'think',
    choices: [
      {
        id: 'choose',
        label: '不知道先做哪个',
        delta: 2,
        reaction: '以后我先给你一个唯一入口，暂时把其他门关上。',
        preference: { key: 'taskApproach', value: 'single-entry' },
      },
      {
        id: 'perfect',
        label: '总想一开始就做好',
        delta: 2,
        reaction: '抓到了。以后我负责提醒你：草稿丑一点，世界不会塌。',
        preference: { key: 'taskApproach', value: 'draft-first' },
      },
      {
        id: 'bored',
        label: '就是觉得很无聊',
        delta: 1,
        reaction: '合理，任务也不总值得热爱。那就用短冲刺把它尽快送走。',
        preference: { key: 'taskApproach', value: 'sprint-boring' },
      },
    ],
  },
  {
    id: 'hidden-courage',
    trigger: ['focus_complete', 'return_from_away', 'demo'],
    minimumLevel: '默契',
    text: '悄悄问一句：最近哪次“我还是做到了”，最值得我们记住？',
    animation: 'greet',
    choices: [
      {
        id: 'started',
        label: '拖了很久但终于开始',
        delta: 2,
        reaction: '这很了不起。开始不是小事，是你把方向盘拿回来了。',
      },
      {
        id: 'finished',
        label: '把一件难事做完了',
        delta: 2,
        reaction: '那必须庆祝。我宣布它进入我们的隐藏成就墙。',
      },
      {
        id: 'rested',
        label: '累的时候允许自己休息',
        delta: 2,
        reaction: '这也是勇气。你没有把自己当成无限续航的机器。',
      },
    ],
  },
];

export function getBondLevel(bond: number): BondLevel {
  if (bond >= 75) return '知心';
  if (bond >= 50) return '默契';
  if (bond >= 25) return '熟悉';
  return '初识';
}

export function normalizeRelationship(
  value: Partial<RelationshipState> | undefined,
): RelationshipState {
  const bond = clampBond(
    typeof value?.bond === 'number' ? value.bond : initialRelationship.bond,
  );
  return {
    schemaVersion: 1,
    bond,
    bondLevel: getBondLevel(bond),
    answeredPromptIds: Array.isArray(value?.answeredPromptIds)
      ? value.answeredPromptIds
          .filter((item): item is string => typeof item === 'string')
          .slice(-40)
      : [],
    dialogueHistory: Array.isArray(value?.dialogueHistory)
      ? value.dialogueHistory.slice(-20)
      : [],
    preferences: value?.preferences ?? {},
    unlocked: Array.isArray(value?.unlocked)
      ? value.unlocked.filter(
          (item): item is string => typeof item === 'string',
        )
      : [],
    dailyPromptDate:
      typeof value?.dailyPromptDate === 'string' ? value.dailyPromptDate : '',
    dailyPromptCount:
      typeof value?.dailyPromptCount === 'number'
        ? Math.max(0, value.dailyPromptCount)
        : 0,
    lastPromptAt:
      typeof value?.lastPromptAt === 'string' ? value.lastPromptAt : undefined,
    pendingPromptId:
      typeof value?.pendingPromptId === 'string'
        ? value.pendingPromptId
        : undefined,
  };
}

export function selectPrompt(
  state: RelationshipState,
  trigger: DialogueTrigger,
  now: Date,
  bypassLimits = false,
): DialoguePrompt | undefined {
  const today = localDateKey(now);
  const count = state.dailyPromptDate === today ? state.dailyPromptCount : 0;
  if (!bypassLimits) {
    if (count >= 2) return undefined;
    if (
      state.lastPromptAt &&
      now.getTime() - new Date(state.lastPromptAt).getTime() < MIN_PROMPT_GAP
    )
      return undefined;
  }
  const recent = new Set(
    state.dialogueHistory.slice(-6).map((item) => item.promptId),
  );
  const levelIndex = LEVEL_ORDER.indexOf(state.bondLevel);
  const candidates = dialoguePrompts.filter((prompt) => {
    const triggerMatches = bypassLimits
      ? prompt.trigger.includes('demo')
      : prompt.trigger.includes(trigger);
    const levelMatches =
      !prompt.minimumLevel ||
      levelIndex >= LEVEL_ORDER.indexOf(prompt.minimumLevel);
    return (
      triggerMatches &&
      levelMatches &&
      !recent.has(prompt.id) &&
      !state.answeredPromptIds.includes(prompt.id)
    );
  });
  if (candidates.length) return candidates[0];
  return dialoguePrompts.find((prompt) => {
    const triggerMatches = bypassLimits
      ? prompt.trigger.includes('demo')
      : prompt.trigger.includes(trigger);
    const levelMatches =
      !prompt.minimumLevel ||
      levelIndex >= LEVEL_ORDER.indexOf(prompt.minimumLevel);
    return triggerMatches && levelMatches && !recent.has(prompt.id);
  });
}

export function promptById(id: string | undefined): DialoguePrompt | undefined {
  return dialoguePrompts.find((prompt) => prompt.id === id);
}

export function markPromptShown(
  state: RelationshipState,
  prompt: DialoguePrompt,
  now: Date,
): RelationshipState {
  const today = localDateKey(now);
  return {
    ...state,
    dailyPromptDate: today,
    dailyPromptCount:
      state.dailyPromptDate === today ? state.dailyPromptCount + 1 : 1,
    lastPromptAt: now.toISOString(),
    pendingPromptId:
      state.pendingPromptId === prompt.id ? undefined : state.pendingPromptId,
  };
}

export function queuePrompt(
  state: RelationshipState,
  prompt: DialoguePrompt,
): RelationshipState {
  return { ...state, pendingPromptId: prompt.id };
}

export function applyDialogueChoice(
  state: RelationshipState,
  prompt: DialoguePrompt,
  choice: DialogueChoice,
  now: Date,
): { state: RelationshipState; newUnlocks: string[] } {
  if (state.answeredPromptIds.includes(prompt.id))
    return { state, newUnlocks: [] };
  const bond = clampBond(state.bond + choice.delta);
  const level = getBondLevel(bond);
  const unlocked = [...new Set([...state.unlocked, ...unlocksForBond(bond)])];
  const newUnlocks = unlocked.filter((item) => !state.unlocked.includes(item));
  const preferences = choice.preference
    ? { ...state.preferences, [choice.preference.key]: choice.preference.value }
    : state.preferences;
  return {
    state: {
      ...state,
      bond,
      bondLevel: level,
      preferences,
      answeredPromptIds: [
        ...state.answeredPromptIds.filter((id) => id !== prompt.id),
        prompt.id,
      ].slice(-40),
      dialogueHistory: [
        ...state.dialogueHistory,
        {
          promptId: prompt.id,
          choiceId: choice.id,
          answeredAt: now.toISOString(),
          delta: choice.delta,
        },
      ].slice(-20),
      unlocked,
    },
    newUnlocks,
  };
}

export function bondProgressLabel(state: RelationshipState): string {
  const next =
    state.bondLevel === '初识'
      ? 25
      : state.bondLevel === '熟悉'
        ? 50
        : state.bondLevel === '默契'
          ? 75
          : 100;
  return state.bondLevel === '知心'
    ? '默契继续积累'
    : `再 ${Math.max(0, next - state.bond)} 点解锁新互动`;
}

function unlocksForBond(bond: number): string[] {
  return rewards
    .filter((reward) => bond >= reward.threshold)
    .map((reward) => reward.id);
}

function clampBond(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}
