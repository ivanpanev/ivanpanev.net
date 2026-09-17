import { useEffect, useId, useState } from 'react';
import {
  SKINS,
  STORAGE_KEYS,
  isSkinId,
  isThemePref,
  resolveTheme,
  type SkinId,
  type ThemePref,
} from '@/lib/theme';

/**
 * Theme (system/light/dark) and skin picker. The head script already applied
 * the persisted choice before first paint; this island only edits it.
 */
export default function ThemeToggle() {
  const [pref, setPref] = useState<ThemePref>('system');
  const [skin, setSkin] = useState<SkinId>('koke');
  const [open, setOpen] = useState(false);
  const menuId = useId();

  useEffect(() => {
    const root = document.documentElement;
    const p = root.getAttribute('data-theme-pref');
    const s = root.getAttribute('data-skin');
    if (isThemePref(p)) setPref(p);
    if (isSkinId(s)) setSkin(s);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-theme-menu]')) setOpen(false);
    };
    addEventListener('keydown', onKey);
    addEventListener('mousedown', onClick);
    return () => {
      removeEventListener('keydown', onKey);
      removeEventListener('mousedown', onClick);
    };
  }, [open]);

  function applyPref(next: ThemePref) {
    setPref(next);
    const root = document.documentElement;
    root.setAttribute('data-theme-pref', next);
    root.setAttribute('data-theme', resolveTheme(next, matchMedia('(prefers-color-scheme: dark)').matches));
    try {
      if (next === 'system') localStorage.removeItem(STORAGE_KEYS.theme);
      else localStorage.setItem(STORAGE_KEYS.theme, next);
    } catch {
      /* private mode: in-memory only */
    }
  }

  function applySkin(next: SkinId) {
    setSkin(next);
    document.documentElement.setAttribute('data-skin', next);
    try {
      localStorage.setItem(STORAGE_KEYS.skin, next);
    } catch {
      /* ignore */
    }
  }

  const themeLabel = pref === 'system' ? 'System theme' : pref === 'dark' ? 'Dark theme' : 'Light theme';

  return (
    <div className="relative" data-theme-menu>
      <button
        type="button"
        className="btn !px-2.5"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Appearance: ${themeLabel}, ${skin} skin`}
        title="Appearance"
        onClick={() => setOpen((o) => !o)}
      >
        <ThemeIcon pref={pref} />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Appearance"
          className="card absolute right-0 mt-2 w-56 p-2 text-sm shadow-card"
        >
          <p className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-wider text-fg-subtle">Theme</p>
          <div className="grid grid-cols-3 gap-1 px-1" role="group" aria-label="Theme">
            {(['system', 'light', 'dark'] as const).map((p) => (
              <button
                key={p}
                type="button"
                role="menuitemradio"
                aria-checked={pref === p}
                className={`rounded px-2 py-1 capitalize hover:bg-surface-2 ${pref === p ? 'bg-accent-soft font-medium' : ''}`}
                onClick={() => applyPref(p)}
              >
                {p}
              </button>
            ))}
          </div>
          <p className="px-2 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-fg-subtle">Skin</p>
          <div role="group" aria-label="Skin" className="px-1">
            {SKINS.map((s) => (
              <button
                key={s.id}
                type="button"
                role="menuitemradio"
                aria-checked={skin === s.id}
                className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-surface-2 ${skin === s.id ? 'bg-accent-soft font-medium' : ''}`}
                onClick={() => applySkin(s.id)}
              >
                <span
                  aria-hidden="true"
                  className="inline-block h-3 w-3 rounded-full border border-line"
                  style={{ background: `var(--swatch-${s.id})` }}
                />
                <span>{s.label}</span>
                <span className="ml-auto text-xs text-fg-subtle">{s.description.split(',')[0]}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ThemeIcon({ pref }: { pref: ThemePref }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (pref === 'dark') return <svg {...common}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>;
  if (pref === 'light') return <svg {...common}><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" /></svg>;
  return <svg {...common}><rect x="2" y="4" width="20" height="14" rx="2" /><path d="M8 22h8M12 18v4" /></svg>;
}
