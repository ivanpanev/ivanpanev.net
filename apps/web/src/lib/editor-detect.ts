export const LANGUAGES = [
  'text',
  'javascript',
  'typescript',
  'json',
  'html',
  'css',
  'markdown',
  'python',
  'go',
  'rust',
  'java',
  'c',
  'cpp',
  'yaml',
  'toml',
  'xml',
  'sql',
  'shell',
  'php',
] as const;
export type EditorLanguage = (typeof LANGUAGES)[number];

const EXT: Record<string, EditorLanguage> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  json: 'json',
  html: 'html',
  htm: 'html',
  css: 'css',
  md: 'markdown',
  markdown: 'markdown',
  py: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  hpp: 'cpp',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'toml',
  xml: 'xml',
  sql: 'sql',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  php: 'php',
  txt: 'text',
};

export function languageFromFilename(name: string): EditorLanguage | undefined {
  const ext = name.split('.').pop()?.toLowerCase();
  return ext ? EXT[ext] : undefined;
}

export function languageFromContent(text: string): EditorLanguage | undefined {
  const head = text.slice(0, 400);
  if (/^#!/.test(head) && /python/.test(head)) return 'python';
  if (/^#!/.test(head) && /(bash|sh|zsh)/.test(head)) return 'shell';
  if (/^<\?php/.test(head)) return 'php';
  if (/^<!DOCTYPE\s+html/i.test(head) || /^<html[\s>]/i.test(head)) return 'html';
  if (/^<\?xml/.test(head)) return 'xml';
  if (/^---\s*\n/.test(head)) return 'yaml';
  const trimmed = text.trim();
  if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && looksJson(trimmed)) return 'json';
  return undefined;
}

function looksJson(s: string): boolean {
  try {
    JSON.parse(s);
    return true;
  } catch {
    return false;
  }
}

export function detectLanguage(filename: string, text: string): EditorLanguage {
  return languageFromFilename(filename) ?? languageFromContent(text) ?? 'text';
}
