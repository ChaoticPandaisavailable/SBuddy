'use client';

import { ChevronRight, HeartHandshake, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { DialogueChoice, DialoguePrompt, RelationshipState } from '@/lib/relationship';
import { bondProgressLabel } from '@/lib/relationship';
import { playCompanionSound } from '@/lib/companion-sound';

type GalgameDialogueProps = {
  prompt: DialoguePrompt;
  relationship: RelationshipState;
  responseText?: string;
  unlocks?: string[];
  muted: boolean;
  onToggleMuted: () => void;
  onChoose: (choice: DialogueChoice) => void;
  onContinue: () => void;
};

export function GalgameDialogue({
  prompt,
  relationship,
  responseText,
  unlocks = [],
  muted,
  onToggleMuted,
  onChoose,
  onContinue,
}: GalgameDialogueProps) {
  const fullText = responseText ?? prompt.text;
  const [visibleCharacters, setVisibleCharacters] = useState(0);
  const complete = visibleCharacters >= fullText.length;
  const visibleText = useMemo(() => fullText.slice(0, visibleCharacters), [fullText, visibleCharacters]);

  useEffect(() => {
    playCompanionSound(responseText ? 'complete' : 'popup', muted);
    const timer = window.setInterval(() => {
      setVisibleCharacters((current) => {
        if (current >= fullText.length) {
          window.clearInterval(timer);
          return current;
        }
        const next = current + 1;
        if (next % 4 === 0) playCompanionSound('typing', muted);
        return next;
      });
    }, 36);
    return () => window.clearInterval(timer);
  }, [fullText, muted, responseText]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select')) return;
      if (!complete) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          setVisibleCharacters(fullText.length);
        }
        return;
      }
      if (responseText && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        onContinue();
        return;
      }
      const choiceIndex = Number(event.key) - 1;
      if (!responseText && choiceIndex >= 0 && choiceIndex < prompt.choices.length) {
        event.preventDefault();
        onChoose(prompt.choices[choiceIndex]);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [complete, fullText.length, onChoose, onContinue, prompt.choices, responseText]);

  return (
    <section className="gal-dialogue" aria-label="学习搭子对话" aria-live="polite">
      <div className="gal-dialogue-head">
        <span className="gal-name">{relationship.bondLevel === '初识' ? '学习搭子' : '小搭子'}</span>
        <span className="gal-bond-inline"><HeartHandshake />默契 {relationship.bond}</span>
        <button type="button" className="gal-sound" onClick={onToggleMuted} aria-label={muted ? '开启音效' : '关闭音效'}>
          {muted ? <VolumeX /> : <Volume2 />}
        </button>
      </div>
      <button
        type="button"
        className="gal-copy"
        onClick={() => setVisibleCharacters(fullText.length)}
        aria-label={complete ? '台词已显示完整' : '立即显示完整台词'}
      >
        <span>{visibleText}</span>
        {!complete && <i className="gal-cursor" />}
      </button>
      {unlocks.length > 0 && complete && (
        <div className="gal-unlock">解锁：{unlocks.join('、')}</div>
      )}
      <div className="gal-choices" data-visible={complete}>
        {complete && !responseText && prompt.choices.map((choice, index) => (
          <button key={choice.id} type="button" onClick={() => onChoose(choice)}>
            <kbd>{index + 1}</kbd>
            <span>{choice.label}</span>
            <small data-delta={choice.delta}>{choice.delta > 0 ? `+${choice.delta}` : choice.delta}</small>
          </button>
        ))}
        {complete && responseText && (
          <button type="button" className="gal-continue" onClick={onContinue}>
            <span>{bondProgressLabel(relationship)}</span><ChevronRight />
          </button>
        )}
      </div>
    </section>
  );
}
