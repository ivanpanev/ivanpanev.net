import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { analyze } from '@/lib/text-count';

const STORAGE_KEY = 'ivp.tools.counter';

export default function TextCounter() {
  const [text, setText] = useState('');
  // Prerendered empty; restore this tab's draft after hydration.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) setText(saved);
    } catch {
      /* storage unavailable */
    }
  }, []);
  const deferred = useDeferredValue(text);
  const stats = useMemo(() => analyze(deferred), [deferred]);

  function update(v: string) {
    setText(v);
    try {
      sessionStorage.setItem(STORAGE_KEY, v);
    } catch {
      /* ignore */
    }
  }

  const n = (v: number) => v.toLocaleString('en-US');

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <label htmlFor="counter-text" className="label !mb-0">
            Text
          </label>
          <button type="button" className="text-xs text-fg-muted underline hover:text-fg" onClick={() => update('')} disabled={!text}>
            Clear
          </button>
        </div>
        <textarea
          id="counter-text"
          className="field min-h-56 resize-y font-mono text-sm"
          value={text}
          onChange={(e) => update(e.target.value)}
          placeholder="Paste or type. Nothing leaves your browser; the text is kept in this tab only."
          spellCheck={false}
        />
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-live="polite">
        <Stat k="Words" v={n(stats.words)} />
        <Stat k="Characters" v={n(stats.characters)} sub={`${n(stats.charactersNoSpaces)} without spaces`} />
        <Stat k="Sentences" v={n(stats.sentences)} />
        <Stat k="Paragraphs" v={n(stats.paragraphs)} sub={`${n(stats.lines)} lines`} />
        <Stat k="Bytes (UTF-8)" v={n(stats.bytesUtf8)} sub={`${n(stats.bytesUtf16)} as UTF-16`} />
        <Stat k="Graphemes" v={n(stats.graphemes)} sub="user-perceived characters" />
        <Stat k="Reading" v={stats.readingMinutes ? `${stats.readingMinutes} min` : '–'} sub="at 230 wpm" />
        <Stat k="Speaking" v={stats.speakingMinutes ? `${stats.speakingMinutes} min` : '–'} sub="at 150 wpm" />
      </dl>

      {stats.topWords.length > 0 && (
        <section className="card p-4" aria-label="Most frequent words">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-subtle">Frequent words</h2>
          <ul className="flex flex-wrap gap-2 text-sm">
            {stats.topWords.map(([w, c]) => (
              <li key={w} className="pill">
                {w} <span className="text-fg-subtle">{c}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-fg-muted">Average word length {stats.averageWordLength.toFixed(1)} characters.</p>
        </section>
      )}
    </div>
  );
}

function Stat({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="card p-3" data-stat={k}>
      <dt className="text-xs text-fg-muted">{k}</dt>
      <dd className="mt-0.5 text-xl font-semibold tabular-nums">{v}</dd>
      {sub && <dd className="text-xs text-fg-subtle">{sub}</dd>}
    </div>
  );
}
