import { describe, expect, it } from 'vitest';
import { analyze, countGraphemes, countSentences, words } from '@/lib/text-count';
import { readingTime } from '@/lib/reading-time';

describe('analyze', () => {
  it('returns zeros for empty input', () => {
    const s = analyze('');
    expect(s.words).toBe(0);
    expect(s.characters).toBe(0);
    expect(s.sentences).toBe(0);
    expect(s.paragraphs).toBe(0);
    expect(s.lines).toBe(0);
    expect(s.bytesUtf8).toBe(0);
    expect(s.readingMinutes).toBe(0);
    expect(s.topWords).toEqual([]);
  });
  it('counts a plain paragraph', () => {
    const s = analyze('The quick brown fox jumps over the lazy dog. It was quick!');
    expect(s.words).toBe(12);
    expect(s.sentences).toBe(2);
    expect(s.paragraphs).toBe(1);
    expect(s.lines).toBe(1);
    expect(s.characters).toBe(58);
    expect(s.charactersNoSpaces).toBe(47);
    expect(s.topWords[0]).toEqual(['quick', 2]);
    expect(s.readingMinutes).toBe(1);
  });
  it('counts paragraphs and lines across blank lines', () => {
    const s = analyze('one\n\ntwo\nthree\r\n\r\nfour');
    expect(s.paragraphs).toBe(3);
    expect(s.lines).toBe(6);
  });
  it('is Unicode aware', () => {
    const flag = '🇧🇬';
    const family = '👨‍👩‍👧';
    const text = `Здравей, свят! ${flag} ${family}`;
    const s = analyze(text);
    expect(s.words).toBe(2);
    expect(countGraphemes(flag)).toBe(1);
    expect(countGraphemes(family)).toBe(1);
    expect(s.bytesUtf8).toBe(new TextEncoder().encode(text).length);
    expect(s.bytesUtf16).toBe(text.length * 2);
    expect(s.characters).toBe([...text].length);
  });
  it('drops stop words and short tokens from the frequency list', () => {
    const s = analyze('the the the cat cat a an is');
    expect(s.topWords).toEqual([['cat', 2]]);
  });
});

describe('words / sentences', () => {
  it('handles contractions and hyphens', () => {
    expect(words("don't stop-believing").length).toBeGreaterThanOrEqual(2);
  });
  it('counts sentences with varied terminators', () => {
    expect(countSentences('One. Two? Three! Four')).toBe(4);
    expect(countSentences('e.g. this is one sentence. And two.')).toBe(2);
    expect(countSentences('   ')).toBe(0);
  });
});

describe('readingTime', () => {
  it('weights code at half', () => {
    const prose = Array(230).fill('word').join(' ');
    expect(readingTime(prose)).toEqual({ minutes: 1, words: 230 });
    const withCode = prose + '\n```\n' + Array(460).fill('cmd').join(' ') + '\n```\n';
    expect(readingTime(withCode)).toEqual({ minutes: 2, words: 460 });
    expect(readingTime(undefined)).toEqual({ minutes: 1, words: 0 });
    expect(readingTime('').minutes).toBe(1);
  });
});
