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

type State = {
  data: AppData;
  setData: Dispatch<SetStateAction<AppData>>;
  ready: boolean;
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
  const [notice, notify] = useState('');
  const saved = useRef('');
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const next = raw
          ? validateAppData(JSON.parse(raw))
          : migrateLegacy((key) => localStorage.getItem(key));
        const legacyPhoto =
          !raw && localStorage.getItem('study-buddies-avatar');
        if (legacyPhoto) {
          try {
            await assetTransaction({ 'legacy-xiaohe': legacyPhoto });
            next.buddies[0].photoKey = 'legacy-xiaohe';
          } catch {
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
      localStorage.setItem(STORAGE_KEY, serialized);
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
    const warned = new Set<string>();
    const tick = () => {
      const now = Date.now();
      const due = data.campus.todos.find(
        (todo) =>
          !todo.completedAt &&
          todo.dueAt &&
          new Date(todo.dueAt).getTime() <= now &&
          new Date(todo.dueAt).getTime() > now - 60000 &&
          !warned.has(todo.id),
      );
      if (due) {
        warned.add(due.id);
        notify('待办到时间了：' + due.title);
      }
    };
    const id = setInterval(tick, 10000);
    return () => clearInterval(id);
  }, [data.campus.todos, ready]);
  const startFocus = (minutes = data.settings.focusMinutes) => {
    if (data.focus && data.focus.status !== 'complete') {
      notify('已有专注会话，请继续或重置后再开始。');
      return;
    }
    const duration = Math.max(1, Math.min(180, minutes)) * 60;
    setData((current) => ({
      ...current,
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
        recover: (next) => {
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
