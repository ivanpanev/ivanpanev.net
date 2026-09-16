import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { buildHeadScript, isSkinId, isThemePref, pickRandomSkin, resolveTheme, SKIN_IDS, STORAGE_KEYS } from '@/lib/theme';

describe('theme model', () => {
  it('validates prefs and skins', () => {
    expect(isThemePref('system')).toBe(true);
    expect(isThemePref('dark')).toBe(true);
    expect(isThemePref('blue')).toBe(false);
    expect(isThemePref(null)).toBe(false);
    expect(isSkinId('ember')).toBe(true);
    expect(isSkinId('neon')).toBe(false);
  });
  it('resolves system preference', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
  it('pickRandomSkin rejects the biased tail', () => {
    // 3 skins: limit = 255; byte 255 must be rejected, then 254 % 3 = 2
    const bytes = [255, 254];
    let i = 0;
    expect(pickRandomSkin(() => bytes[i++]!, 3)).toBe(2);
    expect(i).toBe(2);
  });
});

/** Minimal DOM double for the head script. */
function fakeWindow(opts: { storage?: Record<string, string>; prefersDark?: boolean; noStorage?: boolean }) {
  const attrs: Record<string, string> = {};
  const store = new Map(Object.entries(opts.storage ?? {}));
  const listeners: Record<string, Array<(e: unknown) => void>> = {};
  const ctx = {
    document: { documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) } },
    localStorage: opts.noStorage
      ? {
          getItem() {
            throw new Error('SecurityError');
          },
          setItem() {
            throw new Error('SecurityError');
          },
        }
      : { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
    matchMedia: () => ({ matches: !!opts.prefersDark, addEventListener: (t: string, f: (e: unknown) => void) => ((listeners[t] ??= []).push(f)) }),
    addEventListener: (t: string, f: (e: unknown) => void) => ((listeners[t] ??= []).push(f)),
    crypto: { getRandomValues: (b: Uint8Array) => ((b[0] = 1), b) },
    Uint8Array,
  };
  return { ctx, attrs, store, listeners };
}

describe('head script', () => {
  const src = buildHeadScript();

  it('is stable so its CSP hash can be precomputed', () => {
    expect(buildHeadScript()).toBe(src);
    expect(src).not.toMatch(/`/);
    const hash = createHash('sha256').update(src, 'utf8').digest('base64');
    expect(hash).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it('applies stored theme and skin before first paint', () => {
    const w = fakeWindow({ storage: { [STORAGE_KEYS.theme]: 'dark', [STORAGE_KEYS.skin]: 'tide' }, prefersDark: false });
    vm.runInNewContext(src, w.ctx);
    expect(w.attrs['data-theme']).toBe('dark');
    expect(w.attrs['data-theme-pref']).toBe('dark');
    expect(w.attrs['data-skin']).toBe('tide');
  });

  it('follows the system theme when nothing is stored and picks + persists a random skin', () => {
    const w = fakeWindow({ prefersDark: true });
    vm.runInNewContext(src, w.ctx);
    expect(w.attrs['data-theme']).toBe('dark');
    expect(w.attrs['data-theme-pref']).toBe('system');
    expect(SKIN_IDS).toContain(w.attrs['data-skin']);
    expect(w.store.get(STORAGE_KEYS.skin)).toBe(w.attrs['data-skin']);
  });

  it('ignores garbage in storage', () => {
    const w = fakeWindow({ storage: { [STORAGE_KEYS.theme]: 'purple', [STORAGE_KEYS.skin]: 'nope' } });
    vm.runInNewContext(src, w.ctx);
    expect(w.attrs['data-theme']).toBe('light');
    expect(w.attrs['data-theme-pref']).toBe('system');
    expect(SKIN_IDS).toContain(w.attrs['data-skin']);
  });

  it('reacts to system changes and cross-tab storage events', () => {
    const w = fakeWindow({ prefersDark: false });
    vm.runInNewContext(src, w.ctx);
    expect(w.attrs['data-theme']).toBe('light');
    w.listeners['storage']![0]!({ key: STORAGE_KEYS.theme, newValue: 'dark' });
    expect(w.attrs['data-theme']).toBe('dark');
    w.listeners['storage']![0]!({ key: STORAGE_KEYS.skin, newValue: 'ember' });
    expect(w.attrs['data-skin']).toBe('ember');
    w.listeners['storage']![0]!({ key: STORAGE_KEYS.skin, newValue: 'bogus' });
    expect(w.attrs['data-skin']).toBe('ember');
  });

  it('paints theme and skin when storage is blocked', () => {
    const w = fakeWindow({ noStorage: true, prefersDark: true });
    expect(() => vm.runInNewContext(src, w.ctx)).not.toThrow();
    expect(w.attrs['data-theme']).toBe('dark');
    expect(w.attrs['data-theme-pref']).toBe('system');
    expect(SKIN_IDS).toContain(w.attrs['data-skin']);
  });

  it('falls back to the first skin if crypto is also unavailable', () => {
    const w = fakeWindow({ noStorage: true, prefersDark: false });
    (w.ctx as { crypto?: unknown }).crypto = undefined;
    expect(() => vm.runInNewContext(src, w.ctx)).not.toThrow();
    expect(w.attrs['data-theme']).toBe('light');
    expect(w.attrs['data-skin']).toBe(SKIN_IDS[0]);
  });
});
