'use client';
import { useState } from 'react';
import { Check, Download, RotateCcw, Upload } from 'lucide-react';
import { useStudy } from './provider';
import { Dialog, PageTitle } from './app';
import { assetTransaction, clearAssets } from '@/lib/sbuddy-storage';
import {
  createAppData,
  localDate,
  mergeEvents,
  STORAGE_KEY,
  validateAppData,
  validDate,
  type AppData,
} from '@/lib/sbuddy-state';
type Backup = {
  format: 'sbuddy-backup';
  version: 1;
  exportedAt: string;
  data: AppData;
  assets: Record<string, string>;
};
export function SettingsPage() {
  const { data, setData, notify, recover } = useStudy();
  const [backup, setBackup] = useState<Backup>();
  const [busy, setBusy] = useState(false);
  const settings = (value: Partial<AppData['settings']>) =>
    setData((d) => ({ ...d, settings: { ...d.settings, ...value } }));
  const exportData = async () => {
    setBusy(true);
    try {
      const stored = await assetTransaction();
      const assets: Record<string, string> = {};
      for (const b of data.buddies) {
        if (b.photoKey) {
          if (!stored[b.photoKey])
            throw new Error('有一张角色照片无法读取，请稍后重试备份。');
          assets[b.photoKey] = stored[b.photoKey];
        }
      }
      const value: Backup = {
        format: 'sbuddy-backup',
        version: 1,
        exportedAt: new Date().toISOString(),
        data,
        assets,
      };
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(value, null, 2)], {
          type: 'application/json',
        }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = 'SBuddy-backup-' + localDate() + '.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify('备份已导出，包含学习记录、全部搭子和照片素材。');
    } catch (error) {
      notify(error instanceof Error ? error.message : '备份导出失败。');
    } finally {
      setBusy(false);
    }
  };
  const preview = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 50 * 1024 * 1024)
        throw new Error('备份文件不能超过 50 MB。');
      const result = JSON.parse(await file.text()) as Backup;
      if (
        result.format !== 'sbuddy-backup' ||
        result.version !== 1 ||
        !result.assets ||
        typeof result.assets !== 'object' ||
        Array.isArray(result.assets)
      )
        throw new Error('请选择 SBuddy 导出的有效备份。');
      result.data = validateAppData(result.data);
      if (
        !Object.entries(result.assets).every(
          ([key, value]) =>
            key.length < 200 &&
            typeof value === 'string' &&
            /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(
              value,
            ),
        )
      )
        throw new Error('备份中的照片格式无效。');
      if (
        result.data.buddies.some(
          (b) => b.photoKey && !result.assets[b.photoKey],
        )
      )
        throw new Error('备份缺少角色照片。');
      setBackup(result);
    } catch (error) {
      notify(error instanceof Error ? error.message : '无法读取备份。');
    }
  };
  const restore = async () => {
    if (!backup) return;
    setBusy(true);
    try {
      // Stage under new keys; a failed write cannot overwrite existing photo references.
      const stamp = Date.now();
      const assets: Record<string, string> = {};
      const next = {
        ...backup.data,
        buddies: backup.data.buddies.map((b) => {
          if (!b.photoKey) return b;
          const key = 'restore-' + stamp + '-' + b.id;
          assets[key] = backup.assets[b.photoKey];
          return { ...b, photoKey: key };
        }),
      };
      await assetTransaction(assets);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      recover(next);
      setBackup(undefined);
      notify('备份已恢复。');
    } catch (error) {
      notify(
        error instanceof Error ? error.message : '恢复失败，现有数据未替换。',
      );
    } finally {
      setBusy(false);
    }
  };
  const clear = async () => {
    if (
      !confirm(
        '清空此浏览器中的 SBuddy 学习记录、照片、角色养成和旧版数据？此操作不可撤销，请先导出备份。',
      )
    )
      return;
    try {
      await clearAssets();
      for (const key of [
        'study-buddies-events',
        'study-buddies-campus-data',
        'study-buddies-avatar',
        'study-buddies-avatar-source',
        'study-buddies-avatar-style',
        'study-buddies-profile',
        'study-buddies-relationship',
        'study-buddies-sound-muted',
      ])
        localStorage.removeItem(key);
      const next = createAppData();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      recover(next);
      notify('已清空数据，欢迎重新开始。');
    } catch {
      notify('清空未能全部完成，请检查浏览器存储权限。');
    }
  };
  return (
    <>
      <PageTitle
        title="找到舒服的相处方式"
        description="按你的习惯，调整这个小小的学习空间。"
      />
      <div className="settings-layout">
        <section className="settings-section">
          <h2>陪伴偏好</h2>
          <div className="setting-row">
            <div>
              <strong>搭子音效</strong>
              <p>互动时播放轻柔的反馈音。</p>
            </div>
            <input
              aria-label="搭子音效"
              className="switch"
              type="checkbox"
              checked={!data.settings.muted}
              onChange={(e) => settings({ muted: !e.target.checked })}
            />
          </div>
          <div className="setting-row">
            <div>
              <strong>减少动画</strong>
              <p>让角色保持静态，减少界面动效。</p>
            </div>
            <input
              aria-label="减少动画"
              className="switch"
              type="checkbox"
              checked={data.settings.reducedMotion}
              onChange={(e) => settings({ reducedMotion: e.target.checked })}
            />
          </div>
          <div className="setting-row">
            <div>
              <strong>默认专注时长</strong>
              <p>每次开始时，留一段刚刚好的时间。</p>
            </div>
            <label className="inline-label">
              <input
                aria-label="默认专注时长"
                type="number"
                min={1}
                max={180}
                value={data.settings.focusMinutes}
                onChange={(e) =>
                  settings({
                    focusMinutes: Math.max(
                      1,
                      Math.min(180, Number(e.target.value) || 25),
                    ),
                  })
                }
              />
              分钟
            </label>
          </div>
        </section>
        <section className="settings-section">
          <h2>校园日历</h2>
          <div className="setting-row">
            <div>
              <strong>当前学期</strong>
              <p>用于整理课程和导入数据。</p>
            </div>
            <input
              aria-label="当前学期"
              value={data.campus.activeSemester}
              onChange={(e) =>
                setData((d) => ({
                  ...d,
                  campus: { ...d.campus, activeSemester: e.target.value },
                }))
              }
            />
          </div>
          <div className="setting-row">
            <div>
              <strong>第 1 周的周一</strong>
              <p>课程周次会从这一天开始计算。</p>
            </div>
            <input
              aria-label="学期开始日期"
              type="date"
              value={data.campus.semesterStart}
              onChange={(e) => {
                if (
                  validDate(e.target.value) &&
                  new Date(e.target.value + 'T12:00:00').getDay() === 1
                )
                  setData((d) => ({
                    ...d,
                    campus: { ...d.campus, semesterStart: e.target.value },
                  }));
                else notify('请选择有效的周一日期。');
              }}
            />
          </div>
        </section>
        <section className="settings-section">
          <h2>数据与备份</h2>
          <p className="muted">
            数据保存在当前浏览器，清理浏览器数据会移除这些记录。换设备前，请先导出备份。
          </p>
          <div className="button-row">
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => void exportData()}
            >
              <Download size={17} />
              导出完整备份
            </button>
            <label className="secondary-button upload-label">
              <Upload size={17} />
              恢复备份
              <input
                type="file"
                accept=".json"
                disabled={busy}
                onChange={(e) => {
                  void preview(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        </section>
        <section className="settings-section">
          <h2>体验与重新开始</h2>
          <div className="setting-row">
            <div>
              <strong>载入演示日程</strong>
              <p>添加三项标明用途的示例，不覆盖你的安排。</p>
            </div>
            <button
              className="secondary-button"
              onClick={() => {
                const today = localDate();
                setData((d) => ({
                  ...d,
                  demo: true,
                  events: mergeEvents(d.events, [
                    {
                      id: 'demo-class-' + today,
                      date: today,
                      day: new Date().getDate(),
                      title: '演示 · 交互设计课',
                      time: '10:00',
                      end: '11:30',
                      kind: 'class',
                      location: '教学楼 B203',
                    },
                    {
                      id: 'demo-study-' + today,
                      date: today,
                      day: new Date().getDate(),
                      title: '演示 · 图书馆自习',
                      time: '14:00',
                      end: '15:00',
                      kind: 'study',
                      location: '图书馆三层',
                    },
                    {
                      id: 'demo-meeting-' + today,
                      date: today,
                      day: new Date().getDate(),
                      title: '演示 · 小组讨论',
                      time: '16:00',
                      end: '17:00',
                      kind: 'meeting',
                    },
                  ]),
                }));
                notify('已载入今天的演示日程。');
              }}
            >
              <PlusIcon />
              载入示例
            </button>
          </div>
          <div className="setting-row">
            <div>
              <strong>清空本地数据</strong>
              <p>清除全部记录，恢复三位初始搭子。</p>
            </div>
            <button className="text-button danger" onClick={() => void clear()}>
              <RotateCcw size={17} />
              清空数据
            </button>
          </div>
        </section>
        <section className="settings-about">
          <strong>SBuddy</strong>
          <p>完蛋！我被学习搭子包围了</p>
          <span>本地陪伴版 · 学习是你的，陪伴是我们的。</span>
          <p className="small">
            AI
            服务为可选项。照片、截图与录音只在主动使用对应功能时提交到所配置的服务；摄像头手势在本机处理。关闭页面后不发送定时提醒。
          </p>
        </section>
      </div>
      {backup && (
        <Dialog title="确认恢复这份备份" onClose={() => setBackup(undefined)}>
          <p>
            包含 {backup.data.buddies.length} 位搭子、
            {backup.data.events.length} 项日程、
            {backup.data.campus.todos.length} 条待办、
            {Object.keys(backup.assets).length} 张照片。
          </p>
          <p className="muted">恢复会替换当前记录。建议先导出当前备份。</p>
          <button
            className="primary-button"
            disabled={busy}
            onClick={() => void restore()}
          >
            <Check size={17} />
            {busy ? '正在恢复…' : '确认替换并恢复'}
          </button>
        </Dialog>
      )}
    </>
  );
}
function PlusIcon() {
  return <Upload size={16} />;
}
