'use client';
import { useState } from 'react';
import Image from 'next/image';
import { summarizeImpression } from '@/lib/impression-summary';
import { Check, Heart, Plus, Trash2, Upload } from 'lucide-react';
import { useStudy } from './provider';
import { BuddyStage, Dialog, PageTitle } from './app';
import { createBuddy, updateBuddy } from '@/lib/sbuddy-state';
import { defaultAvatarStyle } from '@/lib/avatar-style';
import { validateGeneratedRig } from '@/lib/rig-assets';
import type { BodyPreset } from '@/lib/companion-rig';
import { assetTransaction } from '@/lib/sbuddy-storage';
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
  const [preview, setPreview] = useState<{
    buddyId: string;
    buddyName: string;
    preset: BodyPreset;
    imageUrl: string;
    file: File;
    photoMode?: 'full-body' | 'head-only';
  }>();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const upload = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 8 * 1024 * 1024) {
      notify('请选择 8 MB 以内的单人照片，只有人头也可以。');
      return;
    }
    const id = buddy.id,
      buddyName = buddy.name,
      preset = buddy.appearance?.preset ?? 'female';
    setBusyId(id);
    try {
      const form = new FormData();
      form.set('image', file);
      form.set('preset', preset);
      form.set('mode', 'portrait');
      notify('正在生成单个人物，完成后先预览，再决定是否应用。');
      const response = await fetch('/api/ai/avatar', {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(320000),
      });
      if (!response.headers.get('content-type')?.includes('application/json'))
        throw new Error('人物服务返回异常，请稍后重试。原人物已保留。');
      const result = (await response.json()) as {
        imageUrl?: string;
        rigVersion?: number;
        photoMode?: 'full-body' | 'head-only';
        error?: string;
      };
      if (
        !response.ok ||
        result.rigVersion !== 4 ||
        !result.imageUrl?.startsWith('data:image/png;base64,')
      )
        throw new Error(result.error || '未取得可用人物图片，原人物已保留。');
      setPreview({
        buddyId: id,
        buddyName,
        preset,
        imageUrl: result.imageUrl,
        file,
        photoMode: result.photoMode,
      });
      setPreviewOpen(true);
      notify('人物已生成，请预览后应用。当前为静态显示。');
    } catch (error) {
      notify(
        error instanceof Error &&
          ['TimeoutError', 'AbortError'].includes(error.name)
          ? '人物生成等待超时，原人物已保留。'
          : error instanceof Error
            ? error.message
            : '人物生成失败。',
      );
    } finally {
      setBusyId('');
    }
  };
  const applyPreview = async () => {
    if (!preview || applying) return;
    if (!data.buddies.some((b) => b.id === preview.buddyId)) {
      notify('这位搭子已被删除，仍可下载生成图片。');
      return;
    }
    setApplying(true);
    try {
      await validateGeneratedRig(preview.imageUrl, 4);
      const atlasKey = 'portrait-' + preview.buddyId + '-' + Date.now(),
        photoKey = 'photo-' + preview.buddyId + '-' + Date.now();
      const originalPhoto = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          typeof reader.result === 'string'
            ? resolve(reader.result)
            : reject(new Error('原照片无法读取。'));
        reader.onerror = () => reject(new Error('原照片无法读取。'));
        reader.readAsDataURL(preview.file);
      });
      await assetTransaction({
        [atlasKey]: preview.imageUrl,
        [photoKey]: originalPhoto,
      });
      setData((d) =>
        updateBuddy(d, preview.buddyId, (b) => ({
          ...b,
          photoKey,
          appearance: {
            preset: preview.preset,
            atlasKey,
            rigVersion: 4,
            photoMode: preview.photoMode,
          },
        })),
      );
      setPreviewOpen(false);
      notify(
        '已为「' +
          preview.buddyName +
          '」应用静态人物。对话、默契和专注功能继续可用。',
      );
    } catch (error) {
      notify(
        error instanceof Error ? error.message : '人物保存失败，原人物已保留。',
      );
    } finally {
      setApplying(false);
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
              {busyId === buddy.id ? '正在生成人物…' : '照片生成静态人物'}
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
          {preview?.buddyId === buddy.id && (
            <button
              className="text-button"
              onClick={() => setPreviewOpen(true)}
            >
              查看上次生成的图片
            </button>
          )}
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
      {previewOpen && preview && (
        <Dialog
          title={'预览「' + preview.buddyName + '」的新人物'}
          onClose={() => {
            if (!applying) setPreviewOpen(false);
          }}
        >
          <div className="portrait-preview">
            <Image
              width={384}
              height={512}
              unoptimized
              src={preview.imageUrl}
              alt={'为' + preview.buddyName + '生成的静态人物预览'}
            />
          </div>
          <p>
            确认外观满意后再应用。这张人物图暂时静态显示，不播放写字、挥手等动作。
          </p>
          <p className="muted small">
            对话、默契、日程和专注不受影响。刷新前可以先下载图片保存。
          </p>
          <div className="button-row">
            <button
              className="primary-button"
              disabled={applying}
              onClick={() => void applyPreview()}
            >
              {applying ? '正在保存…' : '应用静态人物'}
            </button>
            <a
              className="secondary-button"
              href={preview.imageUrl}
              download="SBuddy-人物.png"
            >
              下载图片
            </a>
            <button
              className="text-button"
              disabled={applying}
              onClick={() => setPreviewOpen(false)}
            >
              暂不应用
            </button>
          </div>
        </Dialog>
      )}
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
