'use client';
import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import {
  isSupportMode,
  proactiveLine,
  supportModes,
  type ChatMessage,
  type SupportMode,
} from '@/lib/companion-chat';
import { localDate, updateBuddy, type Buddy } from '@/lib/sbuddy-state';
import { useStudy } from './provider';

type Invitation = { key: string; value: string; text: string };
export function CompanionChat({
  buddy,
  open,
  blocked,
  now,
  onOpen,
  onClose,
}: {
  buddy: Buddy;
  open: boolean;
  blocked: boolean;
  now: Date;
  onOpen: () => void;
  onClose: () => void;
}) {
  const { data, setData, notify } = useStudy();
  const [mode, setMode] = useState<SupportMode>(() =>
    isSupportMode(buddy.relationship.preferences.supportStyle)
      ? buddy.relationship.preferences.supportStyle
      : 'listen',
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [bubble, setBubble] = useState<Invitation>();
  const [pending, setPending] = useState<Invitation | undefined>(() => ({
    key: buddy.id + ':entry',
    value: localDate(now),
    text: proactiveLine('entry', buddy.personality),
  }));
  const historyIds = useRef(new Set(data.focusHistory.map((f) => f.id)));
  const controller = useRef<AbortController | undefined>(undefined);
  const input = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const enabled = data.settings.proactiveDialogue !== false;
  const focused = !!data.focus && data.focus.status !== 'complete';
  useEffect(() => {
    const timer = setTimeout(() => {
      const fresh = data.focusHistory.find(
        (f) =>
          !historyIds.current.has(f.id) &&
          f.buddyId === buddy.id &&
          f.completedNormally,
      );
      historyIds.current = new Set(data.focusHistory.map((f) => f.id));
      if (fresh && enabled)
        setPending({
          key: buddy.id + ':focus',
          value: fresh.id,
          text: proactiveLine('focus', buddy.personality),
        });
    }, 0);
    return () => clearTimeout(timer);
  }, [data.focusHistory, buddy.id, buddy.personality, enabled]);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!enabled) {
        setBubble(undefined);
        setPending(undefined);
        return;
      }
      if (!pending || focused || blocked || open) return;
      if (data.proactiveSeen?.[pending.key] !== pending.value) {
        setBubble(pending);
        setData((d) => ({
          ...d,
          proactiveSeen: { ...d.proactiveSeen, [pending.key]: pending.value },
        }));
      }
      setPending(undefined);
    }, 0);
    return () => clearTimeout(timer);
  }, [pending, enabled, focused, blocked, open, data.proactiveSeen, setData]);
  useEffect(() => {
    if (open) input.current?.focus();
    else {
      controller.current?.abort();
      controller.current = undefined;
    }
  }, [open]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [messages, busy]);
  const close = () => {
    if (controller.current) setError('已暂停等待，想继续时可以重试。');
    controller.current?.abort();
    controller.current = undefined;
    setBusy(false);
    onClose();
  };
  const send = async (retry = false) => {
    if (controller.current || (!retry && !draft.trim())) return;
    const next: ChatMessage[] = retry
      ? messages
      : [...messages, { role: 'user', text: draft.trim() }];
    if (!next.length || next.at(-1)?.role !== 'user') return;
    setMessages(next);
    if (!retry) setDraft('');
    setError('');
    setBusy(true);
    const request = new AbortController();
    controller.current = request;
    const timer = setTimeout(() => request.abort(), 65000);
    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buddyName: buddy.name,
          personality: buddy.personality,
          mode,
          messages: next.slice(-16),
        }),
        signal: request.signal,
      });
      if (!response.headers.get('content-type')?.includes('application/json'))
        throw new Error('聊天服务暂时未响应，可以稍后重试。');
      const result = (await response.json()) as {
        source?: string;
        text?: string;
        error?: string;
      };
      if (
        !response.ok ||
        result.source !== 'ai' ||
        typeof result.text !== 'string'
      )
        throw new Error(result.error || '暂时没有收到回复，可以重试。');
      if (controller.current === request)
        setMessages([...next, { role: 'assistant', text: result.text }]);
    } catch (failure) {
      if (controller.current === request)
        setError(
          request.signal.aborted
            ? '回复等待超时，你的话还在，可以重试。'
            : failure instanceof Error
              ? failure.message
              : '暂时连不上，可以重试。',
        );
    } finally {
      clearTimeout(timer);
      if (controller.current === request) {
        controller.current = undefined;
        setBusy(false);
      }
    }
  };
  if (!open)
    return enabled && bubble && !blocked && !focused ? (
      <div className="companion-invitation">
        <button
          onClick={() => {
            if (!messages.length)
              setMessages([{ role: 'assistant', text: bubble.text }]);
            setBubble(undefined);
            onOpen();
          }}
        >
          <MessageCircle size={18} />
          <span>{bubble.text}</span>
        </button>
        <button
          className="icon-button"
          aria-label="略过这次主动对话"
          onClick={() => setBubble(undefined)}
        >
          <X size={16} />
        </button>
      </div>
    ) : null;
  return (
    <div className="game-interaction companion-chat-wrap">
      <dialog
        open
        className="dialogue-box companion-chat"
        tabIndex={-1}
        aria-label="和搭子说说话"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            close();
          }
        }}
      >
        <header>
          <strong>和{buddy.name}说说话</strong>
          <button
            className="icon-button"
            aria-label="收起倾诉窗口"
            onClick={close}
          >
            <X size={18} />
          </button>
        </header>
        <fieldset className="support-modes" aria-label="希望怎样陪伴">
          {Object.entries(supportModes).map(([key, label]) => (
            <button
              key={key}
              aria-pressed={mode === key}
              disabled={busy}
              onClick={() => setMode(key as SupportMode)}
            >
              {label}
            </button>
          ))}
        </fieldset>
        <button
          className="text-button support-remember"
          onClick={() => {
            setData((d) =>
              updateBuddy(d, buddy.id, (b) => ({
                ...b,
                relationship: {
                  ...b.relationship,
                  preferences: {
                    ...b.relationship.preferences,
                    supportStyle: mode,
                  },
                },
              })),
            );
            notify('已记住你选择的陪伴方式，聊天内容不会写入人物印象。');
          }}
        >
          记住这种方式
        </button>
        <div
          className="support-chat-log"
          ref={log}
          role="log"
          aria-live="polite"
          aria-relevant="additions"
        >
          {!messages.length && (
            <p className="support-welcome">
              想从哪里说起都可以，不用急着整理好。
            </p>
          )}
          {messages.map((message, index) => (
            <p key={index} className={'support-message is-' + message.role}>
              <span>{message.role === 'user' ? '我' : buddy.name}</span>
              {message.text}
            </p>
          ))}
          {busy && <p className="support-pending">{buddy.name}正在回复…</p>}
        </div>
        {error && (
          <output className="support-error">
            {error}
            <button
              className="text-button"
              disabled={busy}
              onClick={() => void send(true)}
            >
              重试
            </button>
          </output>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <textarea
            ref={input}
            value={draft}
            maxLength={2000}
            rows={2}
            aria-label="想对搭子说的话"
            placeholder="今天有什么让你挂心的事？"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <button className="primary-button" disabled={busy || !draft.trim()}>
            <Send size={17} />
            发送
          </button>
        </form>
        <small>
          聊天不加减默契，仅在本次页面保留；发送的内容用于 AI 回复。
        </small>
      </dialog>
    </div>
  );
}
