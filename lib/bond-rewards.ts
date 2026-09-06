export const rewards = [
  {
    id: '昵称「小搭子」',
    threshold: 25,
    title: '专属昵称',
    text: '从今天开始，就叫我「小搭子」吧。',
    animation: 'greet',
  },
  {
    id: '新回应「轻轻敲门」',
    threshold: 50,
    title: '轻轻敲门',
    text: '叩叩，我可以陪你开始今天的第一小步吗？',
    animation: 'think',
  },
  {
    id: '庆祝动作「像素击掌」',
    threshold: 75,
    title: '像素击掌',
    text: '又完成了一小步！伸出手，和我击个掌。',
    animation: 'cheer',
  },
  {
    id: '隐藏问题',
    threshold: 100,
    title: '课间悄悄话',
    text: '如果今天只留一件让自己开心的小事，你想做什么？',
    animation: 'idle',
  },
  {
    id: '特殊欢迎动画',
    threshold: 125,
    title: '等你回来',
    text: '你回来啦。我把旁边的位置一直留着。',
    animation: 'greet',
  },
  {
    id: '知心完成语',
    threshold: 150,
    title: '一起走过的路',
    text: '我记得你每一次开始的勇气。今天也辛苦啦。',
    animation: 'cheer',
  },
] as const;
