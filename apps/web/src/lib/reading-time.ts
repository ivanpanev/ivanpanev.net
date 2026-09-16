/**
 * Reading time from Markdown source. 230 wpm is a conservative average for
 * technical prose; code blocks count at half weight because they are skimmed.
 * Pure function so it is unit-tested without Astro.
 */
export function readingTime(body: string | undefined): { minutes: number; words: number } {
  if (!body) return { minutes: 1, words: 0 };
  let code = 0;
  const prose = body.replace(/```[\s\S]*?```/g, (block) => {
    code += countWords(block);
    return ' ';
  });
  const words = countWords(prose) + Math.round(code / 2);
  return { minutes: Math.max(1, Math.round(words / 230)), words };
}

export function countWords(s: string): number {
  const m = s.match(/[\p{L}\p{N}_'’-]+/gu);
  return m ? m.length : 0;
}
