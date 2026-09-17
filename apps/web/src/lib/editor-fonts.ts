/** Editor font stack. `local()` first; self-hosted files only if dropped in src/fonts/editor/. */
export const EDITOR_FONTS = [
  { id: 'jetbrains', label: 'JetBrains Mono', css: '"JetBrains Mono", ui-monospace, monospace' },
  { id: 'exocet', label: 'Exocet', css: 'Exocet, "Palatino Linotype", serif' },
  { id: 'chinese-rocks', label: 'Chinese Rocks', css: '"Chinese Rocks", "Impact", sans-serif' },
  { id: 'futura-condensed', label: 'Futura Condensed', css: '"Futura Condensed", Futura, sans-serif' },
  { id: 'tw-cen', label: 'Tw Cen MT', css: '"Tw Cen MT", "Century Gothic", sans-serif' },
  { id: 'beckett', label: 'Beckett', css: 'Beckett, Georgia, serif' },
  { id: 'monaco', label: 'Monaco', css: 'Monaco, Menlo, monospace' },
  { id: 'monofonto', label: 'Monofonto', css: 'Monofonto, "Courier New", monospace' },
] as const;

export type EditorFontId = (typeof EDITOR_FONTS)[number]['id'];
