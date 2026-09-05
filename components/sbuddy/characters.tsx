'use client';
import { useState } from 'react';
import { Check, Plus, Trash2, Upload } from 'lucide-react';
import { useStudy } from './provider';
import { BuddyStage, Dialog, PageTitle } from './app';
import { createBuddy, updateBuddy } from '@/lib/sbuddy-state';
import {
  defaultAvatarStyle,
  hairStyleOptions,
  normalizeAvatarStyle,
} from '@/lib/avatar-style';
import { analyzeLocalAvatarStyle, pixelatePhoto } from '@/lib/pixelate';
import { assetTransaction } from '@/lib/sbuddy-storage';
import { PixelCompanionCanvas } from '@/components/pixel-companion-canvas';

const preferenceLabels: Record<string, string> = {
  reminderStyle: '提醒方式',
  taskApproach: '开始任务',
  socialTone: '相处语气',
  breakStyle: '休息偏好',
};
const values: Record<string, string> = {
  gentle: '温柔提醒',
  direct: '直接一点',
  quiet: '安静陪伴',
  tiny: '从小事开始',
  plan: '先列个计划',
  playful: '轻松一点',
  warm: '温暖鼓励',
  walk: '起来走走',
  rest: '安静休息',
  'tiny-step': '从最小的一步开始',
  overview: '先理清全局',
  space: '留一点缓冲空间',
  'urgent-first': '先处理紧急的事',
  'easy-first': '先做容易启动的',
  'important-first': '先看最重要的',
  continue: '再来一小段专注',
  short: '先休息五分钟',
  done: '适时停下来',
  'resume-direct': '提醒我上次的进度',
  'warm-welcome': '回来时打个招呼',
  'quiet-return': '安静地接着做',
  music: '听一首歌',
  phone: '刷一会儿手机',
  'single-entry': '每次只给一个起点',
  'draft-first': '先有草稿，再慢慢完善',
  'sprint-boring': '用短冲刺完成任务',
};
export function Characters() {
  const { data, setData, notify } = useStudy();
  const buddy = data.buddies.find((b) => b.id === data.activeBuddyId)!;
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [personality, setPersonality] = useState('温柔鼓励');
  const [impression, setImpression] = useState('');
  const [busyId, setBusyId] = useState('');
  const change = (update: Parameters<typeof updateBuddy>[2]) =>
    setData((d) => updateBuddy(d, buddy.id, update));
  const upload = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) {
      notify('请选择 10 MB 以内的图片。');
      return;
    }
    const id = buddy.id;
    setBusyId(id);
    try {
      const form = new FormData();
      form.set('image', file);
      let style = await analyzeLocalAvatarStyle(file);
      let message = '已按照片的色彩更新像素造型。';
      try {
        const response = await fetch('/api/ai/avatar-style', {
          method: 'POST',
          body: form,
        });
        const result = (await response.json()) as {
          style?: typeof style;
          source?: string;
        };
        if (response.ok && result.style) {
          style = normalizeAvatarStyle(result.style);
          if (result.source === 'ai') message = '已根据照片分析更新像素造型。';
        }
      } catch {
        /* Local color extraction remains usable. */
      }
      const photo = await pixelatePhoto(file);
      const photoKey = 'photo-' + id + '-' + Date.now();
      await assetTransaction({ [photoKey]: photo });
      setData((d) => updateBuddy(d, id, (b) => ({ ...b, style, photoKey })));
      notify(message);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : '照片处理失败，请换一张图片。',
      );
    } finally {
      setBusyId('');
    }
  };
  return (
    <>
      <PageTitle
        title="认识你的学习搭子"
        description="不一样的性格，一样认真地陪着你。"
      />
      <div className="character-columns">
        <aside className="candidate-rail">
          <div className="section-heading">
            <h2>候选角色</h2>
            <span>{data.buddies.length} 位</span>
          </div>
          {data.buddies.map((b) => (
            <button
              key={b.id}
              className={'candidate ' + (b.id === buddy.id ? 'selected' : '')}
              onClick={() => setData((d) => ({ ...d, activeBuddyId: b.id }))}
            >
              <PixelCompanionCanvas
                state="idle"
                avatarStyle={b.style}
                compact
              />
              <span>
                <strong>{b.name}</strong>
                <small>{b.personality}</small>
              </span>
              {b.id === buddy.id && <Check size={17} />}
            </button>
          ))}
          <button className="add-candidate" onClick={() => setCreating(true)}>
            <Plus size={26} />
            <span>认识一位新搭子</span>
          </button>
        </aside>
        <section className="current-character">
          <h2>当前角色</h2>
          <BuddyStage buddy={buddy} animation="greet" />
          <div className="character-name">
            <h3>{buddy.name}</h3>
            <span className="pill">{buddy.personality}</span>
          </div>
          <div className="character-editor">
            <label>
              搭子的名字
              <input
                value={buddy.name}
                maxLength={24}
                onChange={(e) =>
                  change((b) => ({
                    ...b,
                    name: e.target.value || '未命名搭子',
                  }))
                }
              />
            </label>
            <label>
              相处方式
              <select
                value={buddy.personality}
                onChange={(e) =>
                  change((b) => ({ ...b, personality: e.target.value }))
                }
              >
                <option>温柔鼓励</option>
                <option>理性规划</option>
                <option>活力陪伴</option>
              </select>
            </label>
            <label>
              发型
              <select
                value={buddy.style.hairStyleId}
                onChange={(e) =>
                  change((b) => ({
                    ...b,
                    style: normalizeAvatarStyle({
                      ...b.style,
                      hairStyleId: e.target.value as typeof b.style.hairStyleId,
                    }),
                  }))
                }
              >
                {hairStyleOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              配饰
              <select
                value={buddy.style.accessory}
                onChange={(e) =>
                  change((b) => ({
                    ...b,
                    style: {
                      ...b.style,
                      accessory:
                        e.target.value === 'glasses' ? 'glasses' : 'none',
                    },
                  }))
                }
              >
                <option value="none">无配饰</option>
                <option value="glasses">眼镜</option>
              </select>
            </label>
            <div className="color-controls">
              {(
                [
                  ['hairColor', '发色'],
                  ['skinTone', '肤色'],
                  ['topColor', '上衣'],
                  ['bottomColor', '下装'],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    aria-label={label}
                    type="color"
                    value={buddy.style[key]}
                    onChange={(e) =>
                      change((b) => ({
                        ...b,
                        style: { ...b.style, [key]: e.target.value },
                      }))
                    }
                  />
                </label>
              ))}
            </div>
          </div>
          <div className="button-row">
            <label
              className={
                'secondary-button upload-label ' + (busyId ? 'disabled' : '')
              }
            >
              <Upload size={17} />
              {busyId === buddy.id ? '正在处理照片…' : '照片生成造型'}
              <input
                type="file"
                accept="image/*"
                disabled={!!busyId}
                onChange={(e) => {
                  void upload(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
            {!buddy.preset && (
              <button
                className="text-button danger"
                onClick={() => {
                  if (
                    data.focus?.buddyId === buddy.id &&
                    data.focus.status !== 'complete'
                  ) {
                    notify('这位搭子正在陪你专注，请先结束或重置本轮。');
                    return;
                  }
                  if (confirm('删除「' + buddy.name + '」及其养成记录？'))
                    setData((d) => ({
                      ...d,
                      buddies: d.buddies.filter((b) => b.id !== buddy.id),
                      activeBuddyId: d.buddies[0].id,
                    }));
                }}
              >
                <Trash2 size={16} />
                删除搭子
              </button>
            )}
          </div>
          <p className="muted small">
            照片用于提取配色与造型，搭子保留统一的像素动画骨架。
          </p>
        </section>
        <aside className="impression-rail">
          <h2>对我的印象</h2>
          <p>相处中的小细节，TA 都记着。</p>
          <div className="impression-bond">
            <span>{buddy.relationship.bondLevel}</span>
            <strong>
              {buddy.relationship.bond}
              <small> 默契</small>
            </strong>
          </div>
          {Object.entries(buddy.relationship.preferences).map(
            ([key, value]) => (
              <div className="impression" key={key}>
                <small>{preferenceLabels[key] ?? key} · 来自对话</small>
                <p>{values[value] ?? value}</p>
              </div>
            ),
          )}
          {buddy.impressions.map((text, index) => (
            <div className="impression" key={index}>
              <small>你告诉 TA 的</small>
              <p>{text}</p>
              <button
                className="icon-button"
                aria-label={'删除印象 ' + text}
                onClick={() =>
                  change((b) => ({
                    ...b,
                    impressions: b.impressions.filter((_, i) => i !== index),
                  }))
                }
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {data.focusHistory
            .filter((record) => record.buddyId === buddy.id && record.feedback)
            .slice(-3)
            .reverse()
            .map((record) => (
              <div className="impression" key={record.id}>
                <small>
                  学习反馈 · {new Date(record.at).toLocaleDateString('zh-CN')}
                </small>
                <p>
                  {record.minutes} 分钟专注后，你说：
                  {(
                    {
                      steady: '节奏刚好，状态不错',
                      tired: '有些累，需要休息',
                      distracted: '容易分心，下次缩短一点',
                    } as Record<string, string>
                  )[record.feedback!] ?? record.feedback}
                </p>
              </div>
            ))}
          {!data.focusHistory.some(
            (record) => record.buddyId === buddy.id && record.feedback,
          ) &&
            !buddy.impressions.length &&
            !Object.keys(buddy.relationship.preferences).length && (
              <div className="empty-compact">
                还在慢慢了解你。
                <br />
                聊聊天，让 TA 更懂你的节奏。
              </div>
            )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (impression.trim()) {
                change((b) => ({
                  ...b,
                  impressions: [...b.impressions, impression.trim()],
                }));
                setImpression('');
              }
            }}
          >
            <label>
              告诉 TA 一件关于你的事
              <textarea
                placeholder="例如：我喜欢在晚饭后去图书馆。"
                value={impression}
                maxLength={120}
                onChange={(e) => setImpression(e.target.value)}
              />
            </label>
            <button className="secondary-button" disabled={!impression.trim()}>
              <Plus size={16} />
              记住这件事
            </button>
          </form>
        </aside>
      </div>
      {creating && (
        <Dialog title="认识一位新搭子" onClose={() => setCreating(false)}>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              const next = createBuddy(
                name.trim(),
                personality,
                undefined,
                false,
                {
                  ...defaultAvatarStyle,
                  hairColor: '#554330',
                  topColor: '#748b64',
                },
              );
              setData((d) => ({
                ...d,
                buddies: [...d.buddies, next],
                activeBuddyId: next.id,
              }));
              setCreating(false);
              setName('');
            }}
          >
            <label>
              名字
              <input
                required
                maxLength={24}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="想怎么称呼 TA？"
              />
            </label>
            <label>
              性格
              <select
                value={personality}
                onChange={(e) => setPersonality(e.target.value)}
              >
                <option>温柔鼓励</option>
                <option>理性规划</option>
                <option>活力陪伴</option>
              </select>
            </label>
            <p className="muted">
              见面后可以调整发型、配色，或上传照片生成造型。
            </p>
            <button className="primary-button">
              很高兴认识你
              <Check size={17} />
            </button>
          </form>
        </Dialog>
      )}
    </>
  );
}
