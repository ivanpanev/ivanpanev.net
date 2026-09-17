import { useCallback, useEffect, useState } from 'react';
import {
  generatePassphrase,
  generateString,
  strengthLabel,
  type CharsetKey,
  type Generated,
} from '@/lib/secrets';
import CopyButton from './CopyButton';

type Mode = 'string' | 'passphrase';

const CHARSET_LABELS: Record<CharsetKey, string> = {
  lower: 'a–z',
  upper: 'A–Z',
  digits: '0–9',
  symbols: '!@#$…',
};

export default function SecretGenerator() {
  const [mode, setMode] = useState<Mode>('string');
  const [length, setLength] = useState(24);
  const [charsets, setCharsets] = useState<CharsetKey[]>(['lower', 'upper', 'digits', 'symbols']);
  const [avoidAmbiguous, setAvoidAmbiguous] = useState(false);
  const [requireEach, setRequireEach] = useState(true);
  const [words, setWords] = useState(6);
  const [separator, setSeparator] = useState('-');
  const [capitalize, setCapitalize] = useState(false);
  const [digit, setDigit] = useState(false);
  const [count, setCount] = useState(1);
  const [out, setOut] = useState<Generated[]>([]);
  const [error, setError] = useState<string>();

  const generate = useCallback(() => {
    try {
      const n = Math.min(Math.max(count, 1), 20);
      const items: Generated[] = [];
      for (let i = 0; i < n; i++) {
        items.push(
          mode === 'string'
            ? generateString({ length, charsets, avoidAmbiguous, requireEach })
            : generatePassphrase({ words, separator, capitalize, digit }),
        );
      }
      setOut(items);
      setError(undefined);
    } catch (e) {
      setOut([]);
      setError(e instanceof Error ? e.message : 'Could not generate');
    }
  }, [mode, length, charsets, avoidAmbiguous, requireEach, words, separator, capitalize, digit, count]);

  useEffect(generate, [generate]);

  function toggleCharset(k: CharsetKey) {
    setCharsets((cs) => (cs.includes(k) ? cs.filter((c) => c !== k) : [...cs, k]));
  }

  const first = out[0];
  const strength = first ? strengthLabel(first.entropyBits) : undefined;

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Mode" className="inline-flex rounded-md border border-line p-0.5">
        {(['string', 'passphrase'] as const).map((m) => (
          <button
            key={m}
            role="tab"
            type="button"
            aria-selected={mode === m}
            className={`rounded px-3 py-1 text-sm capitalize ${mode === m ? 'bg-accent-fill text-accent-fg' : 'text-fg-muted hover:text-fg'}`}
            onClick={() => setMode(m)}
          >
            {m === 'string' ? 'Random string' : 'Passphrase'}
          </button>
        ))}
      </div>

      {mode === 'string' ? (
        <fieldset className="card grid gap-4 p-4 sm:grid-cols-2">
          <legend className="sr-only">Random string options</legend>
          <div>
            <label htmlFor="sg-length" className="label">
              Length: {length}
            </label>
            <input id="sg-length" type="range" min={4} max={128} value={length} onChange={(e) => setLength(Number(e.target.value))} className="w-full" />
          </div>
          <div>
            <span className="label">Character sets</span>
            <div className="flex flex-wrap gap-3 text-sm">
              {(Object.keys(CHARSET_LABELS) as CharsetKey[]).map((k) => (
                <label key={k} className="inline-flex items-center gap-1.5 font-mono">
                  <input type="checkbox" checked={charsets.includes(k)} onChange={() => toggleCharset(k)} />
                  {CHARSET_LABELS[k]}
                </label>
              ))}
            </div>
          </div>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={requireEach} onChange={(e) => setRequireEach(e.target.checked)} />
            At least one from each set
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={avoidAmbiguous} onChange={(e) => setAvoidAmbiguous(e.target.checked)} />
            Avoid ambiguous <span className="font-mono text-fg-muted">0O1lI|</span>
          </label>
        </fieldset>
      ) : (
        <fieldset className="card grid gap-4 p-4 sm:grid-cols-2">
          <legend className="sr-only">Passphrase options</legend>
          <div>
            <label htmlFor="sg-words" className="label">
              Words: {words}
            </label>
            <input id="sg-words" type="range" min={3} max={12} value={words} onChange={(e) => setWords(Number(e.target.value))} className="w-full" />
          </div>
          <div>
            <label htmlFor="sg-sep" className="label">
              Separator
            </label>
            <input id="sg-sep" className="field font-mono" value={separator} maxLength={3} onChange={(e) => setSeparator(e.target.value)} />
          </div>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={capitalize} onChange={(e) => setCapitalize(e.target.checked)} />
            Capitalise words
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={digit} onChange={(e) => setDigit(e.target.checked)} />
            Append a digit
          </label>
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" onClick={generate}>
          Generate
        </button>
        <label className="inline-flex items-center gap-2 text-sm">
          <span>How many</span>
          <input type="number" min={1} max={20} value={count} onChange={(e) => setCount(Number(e.target.value) || 1)} className="field !w-20" />
        </label>
        {first && strength && (
          <span className="ml-auto text-sm text-fg-muted" aria-live="polite">
            {first.entropyBits} bits · <Strength level={strength.level} label={strength.label} />
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {out.length > 0 && (
        <ul className="space-y-2" aria-label="Generated secrets">
          {out.map((g, i) => (
            <li key={i} className="card flex items-center gap-3 p-3">
              <output className="min-w-0 flex-1 break-all font-mono text-sm">{g.value}</output>
              <CopyButton text={g.value} />
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-fg-muted">
        Generated with <code>crypto.getRandomValues</code> and rejection sampling, so every output is equally likely. Entropy is the
        exact log₂ of the number of possible outputs under the chosen options. Passphrases use the{' '}
        <a className="underline" href="https://www.eff.org/dice" rel="noopener">
          EFF short wordlist
        </a>{' '}
        (1,296 words, 10.3 bits each). Nothing is sent anywhere.
      </p>
    </div>
  );
}

function Strength({ level, label }: { level: 0 | 1 | 2 | 3 | 4; label: string }) {
  const color = ['bg-danger', 'bg-warn', 'bg-warn', 'bg-ok', 'bg-ok'][level];
  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      <span className="inline-flex gap-0.5" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className={`h-2 w-3 rounded-sm ${i <= level ? color : 'bg-line'}`} />
        ))}
      </span>
      {label}
    </span>
  );
}
