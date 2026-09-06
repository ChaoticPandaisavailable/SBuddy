'use client';
import { useState } from 'react';
import { summarizeImpression } from '@/lib/impression-summary';
import { Check, Heart, Plus, Trash2, Upload } from 'lucide-react';
import { useStudy } from './provider';
import { BuddyStage, Dialog, PageTitle } from './app';
import { createBuddy, updateBuddy } from '@/lib/sbuddy-state';
import { defaultAvatarStyle } from '@/lib/avatar-style';
import { validateGeneratedRig } from '@/lib/rig-assets';
import type { BodyPreset } from '@/lib/companion-rig';
import { assetTransaction } from '@/lib/sbuddy-storage';
import { validateSpriteManifest } from '@/lib/sprite-animation';
import { PixelCompanionCanvas } from '@/components/pixel-companion-canvas';

export function Characters() {
  const { data, setData, notify } = useStudy();
  const buddy = data.buddies.find((b) => b.id === data.activeBuddyId)!;
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [personality, setPersonality] = useState('温柔鼓励');
  const [impression, setImpression] = useState('');
  const [busyId, setBusyId] = useState('');
  const [bodyPreset, setBodyPreset] = useState<BodyPreset>('female');
  const change = (update: Parameters<typeof updateBuddy>[2]) =>
    setData((d) => updateBuddy(d, buddy.id, update));
  const upload = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 8 * 1024 * 1024) {
      notify('请选择 8 MB 以内的单人照片，只有人头也可以。');
      return;
    }
    const id = buddy.id;
    setBusyId(id);
    try {
      const form = new FormData();
      form.set('image', file);
      const preset = buddy.appearance?.preset ?? 'female';
      form.set('preset', preset);
      notify(
        '正在识别照片并生成完整人物，可能需要几分钟；原人物会保留到生成成功。',
      );
      const response = await fetch('/api/ai/avatar', {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(300000),
      });
      if (!response.headers.get('content-type')?.includes('application/json')) {
        throw new Error(
          '无法生成：服务返回异常，请检查访问地址或稍后重试。原人物已保留。',
        );
      }
      const result = (await response.json()) as {
        imageUrl?: string;
        rigVersion?: number;
        spriteManifest?: unknown;
        photoMode?: 'full-body' | 'head-only';
        error?: string;
      };
      if (
        !response.ok ||
        !result.imageUrl ||
        (result.rigVersion !== 1 &&
          result.rigVersion !== 2 &&
          result.rigVersion !== 3)
      )
        throw new Error(
          result.error || '无法生成完整人物，请换一张清晰的单人照片。',
        );
      const rigVersion = result.rigVersion;
      const spriteManifest =
        rigVersion === 3
          ? validateSpriteManifest(result.spriteManifest)
          : undefined;
      await validateGeneratedRig(result.imageUrl, rigVersion);
      const atlasKey = 'rig-' + id + '-' + Date.now();
      const photoKey = 'photo-' + id + '-' + Date.now();
      const originalPhoto = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          typeof reader.result === 'string'
            ? resolve(reader.result)
            : reject(new Error('原照片格式无法读取。'));
        reader.onerror = () =>
          reject(new Error('原照片无法读取，未替换人物。'));
        reader.readAsDataURL(file);
      });
      await assetTransaction({
        [atlasKey]: result.imageUrl,
        [photoKey]: originalPhoto,
      });
      setData((d) =>
        updateBuddy(d, id, (b) => ({
          ...b,
          photoKey,
          appearance: {
            preset,
            atlasKey,
            rigVersion,
            ...(spriteManifest ? { spriteManifest } : {}),
            photoMode: result.photoMode,
          },
        })),
      );
      notify(
        result.photoMode === 'head-only'
          ? '已根据人头生成完整人物，缺少的身体部分使用所选基础人物补全。'
          : '完整人物已生成，已应用到全部活动和连接动作。',
      );
    } catch (error) {
      notify(
        error instanceof Error &&
          ['TimeoutError', 'AbortError'].includes(error.name)
          ? '生成等待超时，请稍后重试。原人物已保留。'
          : error instanceof TypeError
            ? '无法连接人物生成服务，请检查网络。原人物已保留。'
            : error instanceof Error
              ? error.message
              : '照片处理失败，请换一张图片。',
      );
    } finally {
      setBusyId('');
    }
  };
  return (
    <>
      <PageTitle title="角色" />
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
                appearance={b.appearance}
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
          <BuddyStage buddy={buddy} animation="greet" scene={false} />
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
                <option value="未知">未知（可塑）</option>
              </select>
            </label>
          </div>
          <div className="button-row">
            <label
              className={
                'secondary-button upload-label ' + (busyId ? 'disabled' : '')
              }
            >
              <Upload size={17} />
              {busyId === buddy.id ? '正在生成完整人物…' : '照片生成完整人物'}
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
        </section>
        <aside className="impression-rail">
          <h2>对我的印象</h2>
          <div className="impression-bond">
            <div
              className="bond-heart"
              aria-label={`默契值 ${buddy.relationship.bond}`}
            >
              <Heart aria-hidden="true" />
              <span
                style={{
                  fontSize: `${Math.max(10, 24 - Math.max(0, String(buddy.relationship.bond).length - 2) * 2)}px`,
                }}
              >
                {buddy.relationship.bond}
              </span>
            </div>
          </div>
          <p className="impression-description" aria-live="polite">
            {summarizeImpression(buddy, data.focusHistory)}
          </p>
          {!!buddy.impressions.length && (
            <details className="memory-manager">
              <summary>管理记忆</summary>
              {buddy.impressions.map((text, index) => (
                <div className="impression" key={index}>
                  <p>{text}</p>
                  <button
                    className="icon-button"
                    aria-label={'删除记忆 ' + text}
                    onClick={() =>
                      change((b) => ({
                        ...b,
                        impressions: b.impressions.filter(
                          (_, i) => i !== index,
                        ),
                      }))
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </details>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (impression.trim()) {
                change((b) => ({
                  ...b,
                  impressions: [
                    ...new Set([...b.impressions, impression.trim()]),
                  ],
                }));
                setImpression('');
              }
            }}
          >
            <label>
              补充学习习惯
              <textarea
                placeholder="例如：我喜欢在晚饭后去图书馆。"
                value={impression}
                maxLength={120}
                onChange={(e) => setImpression(e.target.value)}
              />
            </label>
            <button className="secondary-button" disabled={!impression.trim()}>
              <Plus size={16} />
              更新印象
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
              next.appearance = { preset: bodyPreset };
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
                <option value="未知">未知（可塑）</option>
              </select>
            </label>
            <label>
              初始外观
              <select
                value={bodyPreset}
                onChange={(e) => setBodyPreset(e.target.value as BodyPreset)}
              >
                <option value="female">女生 · 小禾</option>
                <option value="male">男生 · 知序</option>
              </select>
            </label>

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
