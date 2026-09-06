'use client';

import { useEffect, useId, useState } from 'react';
import { Camera, CameraOff, Hand, X } from 'lucide-react';
import {
  useGestureCamera,
  type CameraStatus,
} from '@/hooks/use-gesture-camera';
import { gameGestureAction } from '@/lib/game-gestures';
import { useStudy } from './provider';

const cameraMessages: Record<CameraStatus, string> = {
  off: '开启摄像头后，将一只手放入画面并保持约 1 秒。',
  requesting: '等待摄像头授权…',
  loading: '正在加载手势识别…',
  active: '识别已开启。连续操作前，请先放下手再做手势。',
  denied: '摄像头权限被拒绝，请在浏览器站点权限中允许后重试。',
  unsupported:
    '当前环境不支持摄像头识别，请使用 localhost 或 HTTPS 地址及支持摄像头的浏览器。',
  error: '摄像头或识别模型未能启动，请检查设备是否被占用，再重试。',
};

export function GameGestures({
  buddyId,
  onGreet,
  onFocus,
}: {
  buddyId: string;
  onGreet: () => boolean;
  onFocus: () => void;
}) {
  const { data, startFocus, toggleFocus, finishFocus } = useStudy();
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const id = useId();
  const { videoRef, status, start, stop } = useGestureCamera({
    onGesture: (gesture) => {
      const result = gameGestureAction(gesture, buddyId, data.focus);
      if (result.action === 'greet' && !onGreet()) {
        setFeedback('搭子正在忙，请稍后再打招呼。');
        return;
      }
      if (result.action === 'start') startFocus(10);
      if (result.action === 'toggle') toggleFocus();
      if (result.action === 'finish') finishFocus();
      if (['start', 'toggle', 'finish'].includes(result.action)) onFocus();
      setFeedback(result.message);
    },
  });
  const pending = status === 'requesting' || status === 'loading';
  const close = () => {
    stop();
    setOpen(false);
    setFeedback('');
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        stop();
        setOpen(false);
        setFeedback('');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, stop]);
  return (
    <div className="game-gestures">
      <button
        className="immersion-toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <Hand size={17} />
        手势互动{status === 'active' ? ' · 开启中' : ''}
      </button>
      <section
        id={id}
        hidden={!open}
        className="game-gesture-panel"
        aria-label="游戏手势识别"
      >
        <div className="game-gesture-heading">
          <strong>用手势陪伴学习</strong>
          <button
            className="icon-button"
            aria-label="关闭手势识别"
            onClick={close}
          >
            <X size={18} />
          </button>
        </div>
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          aria-label="手势摄像头预览"
        />
        <output>{cameraMessages[status]}</output>
        <button
          className="primary-button"
          disabled={pending}
          onClick={() => {
            setFeedback('');
            if (status === 'active') stop();
            else void start();
          }}
        >
          {status === 'active' ? <CameraOff size={16} /> : <Camera size={16} />}
          {pending
            ? '正在开启…'
            : status === 'active'
              ? '停止摄像头'
              : '开启摄像头'}
        </button>
        <ul>
          <li>🖐 张开手掌：打招呼、打开对话</li>
          <li>✌ 比 V：开始 10 分钟专注</li>
          <li>✊ 握拳：暂停 / 继续专注</li>
          <li>👍 拇指向上：结束本轮专注</li>
          <li>👎 拇指向下：暂停并休息</li>
        </ul>
        <output className="game-gesture-feedback">{feedback}</output>
        <small>
          画面仅在本机识别，不录音。关闭面板或离开游戏即停止摄像头。
        </small>
      </section>
    </div>
  );
}
