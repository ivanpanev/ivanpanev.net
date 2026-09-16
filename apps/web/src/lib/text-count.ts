/** Text statistics. Pure; used by the TextCounter island and its tests. */

export interface TextStats {
  characters: number;
  charactersNoSpaces: number;
  /** Unicode grapheme clusters (what a user perceives as characters). */
  graphemes: number;
  words: number;
  sentences: number;
  paragraphs: number;
  lines: number;
  bytesUtf8: number;
  bytesUtf16: number;
  readingMinutes: number;
  speakingMinutes: number;
  /** Top words by frequency, lower-cased, stop-words removed. */
  topWords: Array<[string, number]>;
  /** Average word length in characters. */
  averageWordLength: number;
}

const STOP = new Set(
  'a an and are as at be but by for from has have he her his i if in into is it its of on or she so that the their them then there these they this to was we were what when which who will with you your'.split(
    ' ',
  ),
);

export function analyze(text: string, options: { wpm?: number; spokenWpm?: number; top?: number } = {}): TextStats {
  const { wpm = 230, spokenWpm = 150, top = 5 } = options;
  const characters = [...text].length; // code points
  const charactersNoSpaces = [...text.replace(/\s/gu, '')].length;
  const graphemes = countGraphemes(text);
  const wordList = words(text);
  const sentences = countSentences(text);
  const paragraphs = text.trim() ? text.trim().split(/\n\s*\n/).filter((p) => p.trim()).length : 0;
  const lines = text ? text.split(/\r\n|\r|\n/).length : 0;
  const bytesUtf8 = new TextEncoder().encode(text).length;
  const bytesUtf16 = text.length * 2;

  const freq = new Map<string, number>();
  for (const w of wordList) {
    const k = w.toLowerCase();
    if (k.length < 3 || STOP.has(k) || /^\d+$/.test(k)) continue;
    freq.set(k, (freq.get(k) ?? 0) + 1);
  }
  const topWords = [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, top);
  const averageWordLength = wordList.length ? wordList.reduce((s, w) => s + [...w].length, 0) / wordList.length : 0;

  return {
    characters,
    charactersNoSpaces,
    graphemes,
    words: wordList.length,
    sentences,
    paragraphs,
    lines,
    bytesUtf8,
    bytesUtf16,
    readingMinutes: wordList.length ? Math.max(1, Math.round(wordList.length / wpm)) : 0,
    speakingMinutes: wordList.length ? Math.max(1, Math.round(wordList.length / spokenWpm)) : 0,
    topWords,
    averageWordLength,
  };
}

export function words(text: string): string[] {
  const Seg = (globalThis as { Intl?: typeof Intl }).Intl?.Segmenter;
  if (Seg) {
    const seg = new Seg(undefined, { granularity: 'word' });
    const out: string[] = [];
    for (const s of seg.segment(text)) if (s.isWordLike) out.push(s.segment);
    return out;
  }
  return text.match(/[\p{L}\p{N}_'’]+(?:-[\p{L}\p{N}]+)*/gu) ?? [];
}

export function countGraphemes(text: string): number {
  const Seg = (globalThis as { Intl?: typeof Intl }).Intl?.Segmenter;
  if (!Seg) return [...text].length;
  let n = 0;
  for (const _ of new Seg(undefined, { granularity: 'grapheme' }).segment(text)) n++;
  return n;
}

export function countSentences(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  const Seg = (globalThis as { Intl?: typeof Intl }).Intl?.Segmenter;
  if (Seg) {
    let n = 0;
    for (const s of new Seg(undefined, { granularity: 'sentence' }).segment(t)) if (/[\p{L}\p{N}]/u.test(s.segment)) n++;
    return n;
  }
  return (t.match(/[^.!?…]+[.!?…]+(\s|$)|[^.!?…]+$/g) ?? []).length;
}
