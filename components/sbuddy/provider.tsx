'use client';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  createAppData,
  migrateLegacy,
  validateAppData,
  STORAGE_KEY,
  settleFocus,
  remainingSeconds,
  type AppData,
} from '@/lib/sbuddy-state';
import { assetTransaction } from '@/lib/sbuddy-storage';
import { calendarReminders } from '@/lib/calendar-layout';
import {
  completionSnapshot,
  detectCompletions,
  type Completion,
  type CompletionSnapshot,
} from '@/lib/companion-behavior';
import { updateBuddy } from '@/lib/sbuddy-state';
import {
  createShowcaseData,
  isShowcase,
  SHOWCASE_STORAGE_KEY,
} from '@/lib/showcase';

type State = {
  data: AppData;
  setData: Dispatch<SetStateAction<AppData>>;
  ready: boolean;
  showcase: boolean;
  resetShowcase: () => void;
  recoveryVersion: number;
  completion: { sequence: number; items: Completion[] };
  recover: (data: AppData) => void;
  notice: string;
  notify: (text: string) => void;
  startFocus: (minutes?: number) => void;
  toggleFocus: () => void;
  finishFocus: () => void;
};
const Context = createContext<State | null>(null);
export function StudyProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState(createAppData);
  const [ready, setReady] = useState(false);
  const [showcase, setShowcase] = useState(false);
  const storageKey = useRef(STORAGE_KEY);
  const [recoveryVersion, setRecoveryVersion] = useState(0);
  const [completion, setCompletion] = useState({
    sequence: 0,
    items: [] as Completion[],
  });
  const observed = useRef<CompletionSnapshot | undefined>(undefined);
  const completed = useRef(new Set<string>());
  const [notice, notify] = useState('');
  const saved = useRef('');
  const reminderWarnings = useRef(new Set<string>());
  useEffect(() => {
    if (!ready) return;
    const sample = () => {
      const next = completionSnapshot(data, Date.now());
      const items =
        observed.current && !document.hidden
          ? detectCompletions(observed.current, next).filter(
              (e) => !completed.current.has(e.id),
            )
          : [];
      observed.current = next;
      if (items.length) {
        items.forEach((e) => completed.current.add(e.id));
        setCompletion((c) => ({ sequence: c.sequence + 1, items }));
      }
    };
    sample();
    const timer = setInterval(sample, 1000);
    const visibility = () => {
      observed.current = completionSnapshot(data, Date.now());
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [data, ready]);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const demo = isShowcase(location.search);
        storageKey.current = demo ? SHOWCASE_STORAGE_KEY : STORAGE_KEY;
        setShowcase(demo);
        const raw = localStorage.getItem(storageKey.current);
        const next = raw
          ? validateAppData(JSON.parse(raw))
          : demo
            ? createShowcaseData()
            : migrateLegacy((key) => localStorage.getItem(key));
        const legacyPhoto =
          !demo &&
          (!raw || next.legacyPhotoPending) &&
          localStorage.getItem('study-buddies-avatar');
        const legacyBuddy = next.buddies.find((b) => b.id === 'xiaohe');
        if (legacyPhoto && legacyBuddy) {
          try {
            await assetTransaction({ 'legacy-xiaohe': legacyPhoto });
            legacyBuddy.photoKey = 'legacy-xiaohe';
            next.legacyPhotoPending = false;
          } catch {
            next.legacyPhotoPending = true;
            if (live)
              notify('原照片仍保留在旧数据中，但暂时无法迁移到照片库。');
          }
        }
        if (live) {
          setData(settleFocus(next));
          setReady(true);
        }
      } catch {
        if (live) {
          notify(
            '已有数据无法读取，已保留原始记录。请在设置中恢复有效备份后再保存。',
          );
          setReady(false);
        }
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const serialized = JSON.stringify(data);
    if (saved.current === serialized) return;
    try {
      localStorage.setItem(storageKey.current, serialized);
      saved.current = serialized;
    } catch {
      queueMicrotask(() =>
        notify(
          '保存失败：浏览器存储空间不足或被禁用。当前改动尚未保存，请导出备份。',
        ),
      );
    }
  }, [data, ready]);
  useEffect(() => {
    const tick = window.setInterval(
      () => setData((current) => settleFocus(current)),
      1000,
    );
    return () => clearInterval(tick);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.reduceMotion = String(
      data.settings.reducedMotion,
    );
    window.dispatchEvent(new Event('sbuddy-motion'));
  }, [data.settings.reducedMotion]);
  useEffect(() => {
    if (!ready) return;
    const warned = reminderWarnings.current;
    const tick = () => {
      for (const due of calendarReminders(
        data.events,
        data.campus.todos,
        Date.now(),
      )) {
        if (warned.has(due.id)) continue;
        warned.add(due.id);
        notify('日程提醒：' + due.title);
      }
    };
    const id = setInterval(tick, 10000);
    return () => clearInterval(id);
  }, [data.events, data.campus.todos, ready]);
  const startFocus = (minutes = data.settings.focusMinutes) => {
    if (data.focus && data.focus.status !== 'complete') {
      notify('已有专注会话，请继续或重置后再开始。');
      return;
    }
    const duration = Math.max(1, Math.min(180, minutes)) * 60;
    setData((current) => ({
      ...updateBuddy(current, current.activeBuddyId, (b) => ({
        ...b,
        behavior: { ...b.behavior, mode: 'manual', activity: 'study' },
      })),
      focus: {
        id: crypto.randomUUID(),
        buddyId: current.activeBuddyId,
        duration,
        remaining: duration,
        endsAt: Date.now() + duration * 1000,
        status: 'running',
      },
    }));
  };
  const toggleFocus = () =>
    setData((current) => {
      const focus = current.focus;
      if (!focus || focus.status === 'complete') return current;
      if (focus.status === 'running') {
        const remaining = remainingSeconds(focus);
        if (remaining === 0) return settleFocus(current);
        return {
          ...current,
          focus: { ...focus, status: 'paused', remaining, endsAt: undefined },
        };
      }
      return {
        ...current,
        focus: {
          ...focus,
          status: 'running',
          endsAt: Date.now() + focus.remaining * 1000,
        },
      };
    });
  return (
    <Context.Provider
      value={{
        data,
        setData,
        ready,
        showcase,
        resetShowcase: () => {
          if (!showcase) return;
          const next = createShowcaseData();
          observed.current = completionSnapshot(next, Date.now());
          completed.current.clear();
          reminderWarnings.current.clear();
          setCompletion({ sequence: 0, items: [] });
          setRecoveryVersion((v) => v + 1);
          setData(next);
          setReady(true);
          notify('展示已重置，可以开始下一轮。');
        },
        recoveryVersion,
        completion,
        recover: (next) => {
          observed.current = completionSnapshot(next, Date.now());
          completed.current.clear();
          setRecoveryVersion((v) => v + 1);
          setData(next);
          setReady(true);
        },
        notice,
        notify,
        startFocus,
        toggleFocus,
        finishFocus: () =>
          setData((current) => settleFocus(current, Date.now(), true)),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useStudy() {
  const value = useContext(Context);
  if (!value) throw new Error('StudyProvider is required');
  return value;
}
