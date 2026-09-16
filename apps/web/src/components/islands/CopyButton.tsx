import { useEffect, useRef, useState } from 'react';

export default function CopyButton({ text, label = 'Copy', className = '' }: { text: string; label?: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'err'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState('ok');
    } catch {
      setState('err');
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 1500);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={`inline-flex items-center rounded border border-line bg-surface px-1.5 py-0.5 text-[11px] font-medium text-fg-muted hover:bg-surface-2 hover:text-fg ${className}`}
      aria-live="polite"
    >
      {state === 'ok' ? 'Copied' : state === 'err' ? 'Copy failed' : label}
    </button>
  );
}
