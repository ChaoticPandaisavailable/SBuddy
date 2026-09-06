import { ArrowLeft } from 'lucide-react';
import guide from '@/docs/INTERACTION-GUIDE.md?raw';

export function InteractionGuide({ onBack }: { onBack: () => void }) {
  return (
    <section className="interaction-guide">
      <header className="auxiliary-heading">
        <button className="secondary-button auxiliary-back" onClick={onBack}>
          <ArrowLeft size={18} />
          返回
        </button>
        <h1>好感度与互动说明</h1>
      </header>
      <article>
        {guide
          .trim()
          .split(/\r?\n\r?\n/)
          .slice(1)
          .map((block, index) =>
            block.startsWith('## ') ? (
              <h2 key={index}>{block.slice(3)}</h2>
            ) : block.startsWith('- ') ? (
              <ul key={index}>
                {block.split(/\r?\n/).map((line) => (
                  <li key={line}>{line.slice(2)}</li>
                ))}
              </ul>
            ) : (
              <p key={index}>{block}</p>
            ),
          )}
      </article>
    </section>
  );
}
