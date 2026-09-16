/**
 * Theme (light/dark) and skin (colour family) model shared by the no-flash head
 * script, the ThemeToggle island and tests. Keep this file dependency-free: the
 * head script is generated from it and must stay tiny.
 */

export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

/** What the user asked for; 'system' follows prefers-color-scheme. */
export const THEME_PREFS = ['system', 'light', 'dark'] as const;
export type ThemePref = (typeof THEME_PREFS)[number];

export const SKINS = [
  { id: 'graphite', label: 'Graphite', description: 'Neutral greys, blue accent' },
  { id: 'ember', label: 'Ember', description: 'Warm paper, copper accent' },
  { id: 'tide', label: 'Tide', description: 'Cool slate, teal accent' },
] as const;
export type SkinId = (typeof SKINS)[number]['id'];
export const SKIN_IDS = SKINS.map((s) => s.id) as readonly SkinId[];

export const STORAGE_KEYS = { theme: 'ivp.theme', skin: 'ivp.skin' } as const;

export function isThemePref(v: unknown): v is ThemePref {
  return typeof v === 'string' && (THEME_PREFS as readonly string[]).includes(v);
}
export function isSkinId(v: unknown): v is SkinId {
  return typeof v === 'string' && (SKIN_IDS as readonly string[]).includes(v);
}

export function resolveTheme(pref: ThemePref, systemPrefersDark: boolean): Theme {
  if (pref === 'system') return systemPrefersDark ? 'dark' : 'light';
  return pref;
}

/**
 * Pick a skin index from a random byte with rejection sampling so the choice
 * is unbiased for any skin count that does not divide 256.
 */
export function pickRandomSkin(randomByte: () => number, count: number = SKIN_IDS.length): number {
  const limit = 256 - (256 % count);
  let r = randomByte();
  while (r >= limit) r = randomByte();
  return r % count;
}

/**
 * Source of the inline <script> placed in <head> before any stylesheet. It is
 * built here so that the CSP hash in BaseLayout is always computed from the
 * exact bytes that are rendered.
 */
export function buildHeadScript(): string {
  const skins = JSON.stringify(SKIN_IDS);
  // Plain ES5-ish, no template literals, so the minifier cannot change it
  // between hash computation and rendering (we do not minify it at all).
  // Attributes are painted first; persistence is best-effort. A single outer
  // try/catch around localStorage.setItem used to skip setAttribute entirely
  // when storage threw (Safari private mode), leaving --canvas/--fg unset.
  return (
    '(function(){' +
    `var d=document.documentElement,s=${skins},k='${STORAGE_KEYS.skin}',t='${STORAGE_KEYS.theme}';` +
    'var skin=null;try{skin=localStorage.getItem(k)}catch(e){}' +
    'if(s.indexOf(skin)<0){skin=s[0];try{var b=new Uint8Array(1),l=256-(256%s.length);do{crypto.getRandomValues(b)}while(b[0]>=l);skin=s[b[0]%s.length]}catch(e){}try{localStorage.setItem(k,skin)}catch(e){}}' +
    'd.setAttribute("data-skin",skin);' +
    'var p="system";try{var stored=localStorage.getItem(t);if(stored==="light"||stored==="dark")p=stored}catch(e){}' +
    'var m=matchMedia("(prefers-color-scheme: dark)");' +
    'var apply=function(){d.setAttribute("data-theme",p==="system"?(m.matches?"dark":"light"):p);d.setAttribute("data-theme-pref",p)};' +
    'apply();' +
    'try{m.addEventListener("change",function(){if(p==="system")apply()});' +
    'addEventListener("storage",function(e){if(e.key===t){p=(e.newValue==="light"||e.newValue==="dark")?e.newValue:"system";apply()}else if(e.key===k&&s.indexOf(e.newValue)>=0){d.setAttribute("data-skin",e.newValue)}})}catch(e){}' +
    '})();'
  );
}
