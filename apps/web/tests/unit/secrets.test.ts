import { describe, expect, it } from 'vitest';
import {
  buildAlphabet,
  CHARSETS,
  countConstrained,
  generatePassphrase,
  generateString,
  log2Big,
  strengthLabel,
  uniformInt,
  type RandomBytes,
} from '@/lib/secrets';
import { EFF_SHORT_WORDLIST } from '@/data/eff-short-wordlist';

/** Deterministic byte source: returns the given sequence then wraps. */
function seq(bytes: number[]): RandomBytes {
  let i = 0;
  return (n) => {
    const out = new Uint8Array(n);
    for (let k = 0; k < n; k++) out[k] = bytes[i++ % bytes.length]!;
    return out;
  };
}

/** xorshift32 PRNG for statistical tests: fast, reproducible, not for production. */
function xorshift(seed: number): RandomBytes {
  let s = seed >>> 0 || 1;
  return (n) => {
    const out = new Uint8Array(n);
    for (let k = 0; k < n; k++) {
      s ^= s << 13;
      s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5;
      s >>>= 0;
      out[k] = s & 0xff;
    }
    return out;
  };
}

describe('uniformInt', () => {
  it('rejects values in the biased tail', () => {
    // max=10 over one byte: limit is 250; bytes 250..255 must be discarded.
    const r = uniformInt(10, seq([255, 250, 249]));
    expect(r).toBe(249 % 10);
  });
  it('uses wider draws for larger ranges', () => {
    // 1296 needs two bytes; 0x0500 = 1280 < limit(65536 - 65536%1296 = 64800)
    expect(uniformInt(1296, seq([0x05, 0x00]))).toBe(1280);
    expect(uniformInt(1, seq([]))).toBe(0);
  });
  it('validates max', () => {
    expect(() => uniformInt(0, seq([0]))).toThrow(RangeError);
    expect(() => uniformInt(1.5, seq([0]))).toThrow(RangeError);
    expect(() => uniformInt(2 ** 33, seq([0]))).toThrow(RangeError);
  });
  it('is approximately uniform (chi-square, 6 buckets)', () => {
    const rnd = xorshift(12345);
    const counts = new Array<number>(6).fill(0);
    const N = 60_000;
    for (let i = 0; i < N; i++) counts[uniformInt(6, rnd)]!++;
    const expected = N / 6;
    const chi2 = counts.reduce((s, c) => s + (c - expected) ** 2 / expected, 0);
    // 5 degrees of freedom; 20.5 is the 0.1% critical value.
    expect(chi2).toBeLessThan(20.5);
  });
});

describe('buildAlphabet', () => {
  it('concatenates and de-duplicates', () => {
    expect(buildAlphabet({ charsets: ['digits'] })).toBe('0123456789');
    expect(buildAlphabet({ charsets: ['digits'], extra: '9ab' })).toBe('0123456789ab');
  });
  it('removes ambiguous glyphs on request', () => {
    const a = buildAlphabet({ charsets: ['lower', 'upper', 'digits'], avoidAmbiguous: true });
    for (const c of CHARSETS.ambiguous) expect(a).not.toContain(c);
    // 0 O 1 l I are the ambiguous glyphs present in these three sets.
    expect(a).toHaveLength(26 + 26 + 10 - 5);
  });
});

describe('generateString', () => {
  it('produces the requested length from the requested alphabet', () => {
    const g = generateString({ length: 32, charsets: ['lower', 'digits'] }, xorshift(1));
    expect(g.value).toHaveLength(32);
    expect(g.value).toMatch(/^[a-z0-9]+$/);
    expect(g.entropyBits).toBeCloseTo(32 * Math.log2(36), 1);
  });
  it('honours requireEach', () => {
    const rnd = xorshift(7);
    for (let i = 0; i < 200; i++) {
      const g = generateString({ length: 8, charsets: ['lower', 'upper', 'digits', 'symbols'], requireEach: true }, rnd);
      expect(g.value).toMatch(/[a-z]/);
      expect(g.value).toMatch(/[A-Z]/);
      expect(g.value).toMatch(/[0-9]/);
      expect(g.value).toMatch(new RegExp(`[${CHARSETS.symbols.replace(/[\]\\^-]/g, '\\$&')}]`));
    }
  });
  it('reports lower entropy when constrained, matching the exact count', () => {
    const free = generateString({ length: 8, charsets: ['lower', 'digits'] }, xorshift(3));
    const constrained = generateString({ length: 8, charsets: ['lower', 'digits'], requireEach: true }, xorshift(3));
    expect(constrained.entropyBits).toBeLessThan(free.entropyBits);
    const exact = log2Big(countConstrained(36, [26, 10], 8));
    expect(constrained.entropyBits).toBeCloseTo(exact, 1);
  });
  it('rejects impossible or out-of-range requests', () => {
    expect(() => generateString({ length: 0, charsets: ['lower'] }, xorshift(1))).toThrow(RangeError);
    expect(() => generateString({ length: 513, charsets: ['lower'] }, xorshift(1))).toThrow(RangeError);
    expect(() => generateString({ length: 8, charsets: [] }, xorshift(1))).toThrow(RangeError);
    expect(() => generateString({ length: 2, charsets: ['lower', 'upper', 'digits'], requireEach: true }, xorshift(1))).toThrow(
      /cannot include/,
    );
  });
});

describe('countConstrained', () => {
  it('matches brute force for small cases', () => {
    // alphabet "ab|c" (groups a,b of size 1 and c of size 1) length 3: strings over {a,b,c} containing a, b and c: 3! = 6
    expect(countConstrained(3, [1, 1, 1], 3)).toBe(6n);
    // alphabet size 3, one group of size 1, length 2: total 9 minus 4 without that char = 5
    expect(countConstrained(3, [1], 2)).toBe(5n);
    // no groups: a^n
    expect(countConstrained(10, [], 4)).toBe(10000n);
  });
  it('log2Big handles very large values', () => {
    expect(log2Big(1n << 200n)).toBeCloseTo(200, 6);
    expect(log2Big(1024n)).toBe(10);
    expect(log2Big(0n)).toBe(-Infinity);
  });
});

describe('generatePassphrase', () => {
  it('uses the EFF short wordlist and reports 10.34 bits per word', () => {
    expect(EFF_SHORT_WORDLIST).toHaveLength(1296);
    expect(new Set(EFF_SHORT_WORDLIST).size).toBe(1296);
    const g = generatePassphrase({ words: 6 }, xorshift(9));
    const parts = g.value.split('-');
    expect(parts).toHaveLength(6);
    for (const w of parts) expect(EFF_SHORT_WORDLIST).toContain(w);
    expect(g.entropyBits).toBeCloseTo(6 * Math.log2(1296), 1);
  });
  it('supports separator, capitalisation and a trailing digit', () => {
    const g = generatePassphrase({ words: 4, separator: ' ', capitalize: true, digit: true }, xorshift(11));
    expect(g.value).toMatch(/^(?:[A-Z][a-z]+ ){3}[A-Z][a-z]+\d$/);
    expect(g.entropyBits).toBeCloseTo(4 * Math.log2(1296) + Math.log2(10), 1);
  });
  it('validates word count', () => {
    expect(() => generatePassphrase({ words: 0 }, xorshift(1))).toThrow(RangeError);
    expect(() => generatePassphrase({ words: 21 }, xorshift(1))).toThrow(RangeError);
  });
});

describe('strengthLabel', () => {
  it('maps bits to bands', () => {
    expect(strengthLabel(20).level).toBe(0);
    expect(strengthLabel(50).level).toBe(1);
    expect(strengthLabel(70).level).toBe(2);
    expect(strengthLabel(100).level).toBe(3);
    expect(strengthLabel(128).level).toBe(4);
  });
});
