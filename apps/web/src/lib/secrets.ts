/**
 * Random secret generation. All randomness comes from an injectable
 * `randomBytes(n)` (WebCrypto in the browser; a seeded fake in tests) and every
 * selection uses rejection sampling, so the output distribution is uniform
 * regardless of alphabet size. Nothing here uses Math.random.
 */
import { EFF_SHORT_WORDLIST } from '@/data/eff-short-wordlist';

export type RandomBytes = (n: number) => Uint8Array;

export const webCryptoRandom: RandomBytes = (n) => {
  const out = new Uint8Array(n);
  // getRandomValues caps at 65536 bytes per call
  for (let i = 0; i < n; i += 65536) crypto.getRandomValues(out.subarray(i, Math.min(n, i + 65536)));
  return out;
};

export const CHARSETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.<>?/~',
  /** Characters that are easy to confuse in some fonts; excluded when `avoidAmbiguous` is set. */
  ambiguous: '0O1lI|`\'"',
} as const;
export type CharsetKey = Exclude<keyof typeof CHARSETS, 'ambiguous'>;

export interface StringOptions {
  length: number;
  charsets: CharsetKey[];
  avoidAmbiguous?: boolean;
  /** Guarantee at least one character from each selected charset (length permitting). */
  requireEach?: boolean;
  /** Extra characters to include. */
  extra?: string;
}

export interface PassphraseOptions {
  words: number;
  separator?: string;
  capitalize?: boolean;
  /** Append one random digit (adds log2(10) bits). */
  digit?: boolean;
}

export interface Generated {
  value: string;
  /** log2 of the number of equally likely outputs. */
  entropyBits: number;
}

/**
 * Uniform integer in [0, max) from a byte source using rejection sampling over
 * the smallest byte width that covers `max`.
 */
export function uniformInt(max: number, randomBytes: RandomBytes): number {
  if (!Number.isInteger(max) || max <= 0 || max > 2 ** 32) throw new RangeError('max must be an integer in (0, 2^32]');
  if (max === 1) return 0;
  const width = max <= 256 ? 1 : max <= 65536 ? 2 : max <= 16777216 ? 3 : 4;
  const range = 2 ** (8 * width);
  const limit = range - (range % max);
  for (;;) {
    const b = randomBytes(width);
    let v = 0;
    for (let i = 0; i < width; i++) v = v * 256 + b[i]!;
    if (v < limit) return v % max;
  }
}

export function buildAlphabet(opts: { charsets: CharsetKey[]; avoidAmbiguous?: boolean | undefined; extra?: string | undefined }): string {
  let s = opts.charsets.map((k) => CHARSETS[k]).join('') + (opts.extra ?? '');
  if (opts.avoidAmbiguous) s = [...s].filter((c) => !CHARSETS.ambiguous.includes(c)).join('');
  return [...new Set([...s])].join('');
}

export function generateString(opts: StringOptions, randomBytes: RandomBytes = webCryptoRandom): Generated {
  if (!Number.isInteger(opts.length) || opts.length < 1 || opts.length > 512) throw new RangeError('length must be 1..512');
  const alphabet = buildAlphabet(opts);
  if (alphabet.length < 2) throw new RangeError('Alphabet needs at least two characters');

  // Groups that must each contribute at least one character. Built-in charsets
  // are pairwise disjoint, which the inclusion-exclusion count below relies on;
  // `extra` characters are never part of a required group.
  const groups: string[] = opts.requireEach
    ? opts.charsets
        .map((k) => buildAlphabet({ charsets: [k], avoidAmbiguous: opts.avoidAmbiguous }))
        .filter((g) => g.length > 0)
    : [];
  if (groups.length > opts.length) {
    throw new RangeError(`Length ${opts.length} cannot include one character from each of ${groups.length} sets`);
  }

  // Rejection sampling: draw uniformly from the unconstrained space and keep
  // the first draw that satisfies the constraint. The result is exactly uniform
  // over the constrained set (pick-one-from-each-then-shuffle is not).
  const groupSets = groups.map((g) => new Set(g));
  for (let attempt = 0; attempt < 10_000; attempt++) {
    const chars: string[] = [];
    for (let i = 0; i < opts.length; i++) chars.push(alphabet[uniformInt(alphabet.length, randomBytes)]!);
    if (groupSets.every((g) => chars.some((c) => g.has(c)))) {
      return {
        value: chars.join(''),
        entropyBits: round1(log2Big(countConstrained(alphabet.length, groups.map((g) => g.length), opts.length))),
      };
    }
  }
  /* c8 ignore next */
  throw new Error('Could not satisfy the character-set constraint; loosen it or increase the length');
}

/**
 * Number of strings of length n over an alphabet of size a that contain at
 * least one character from each of the disjoint groups with sizes `sizes`
 * (inclusion-exclusion). Exact in BigInt.
 */
export function countConstrained(a: number, sizes: number[], n: number): bigint {
  let total = 0n;
  const k = sizes.length;
  for (let mask = 0; mask < 1 << k; mask++) {
    let excluded = 0;
    let bits = 0;
    for (let i = 0; i < k; i++) if (mask & (1 << i)) (excluded += sizes[i]!), bits++;
    const term = BigInt(a - excluded) ** BigInt(n);
    total += bits % 2 === 0 ? term : -term;
  }
  return total;
}

/** log2 of a positive BigInt with ~15 significant bits of fractional precision. */
export function log2Big(v: bigint): number {
  if (v <= 0n) return -Infinity;
  const bits = v.toString(2).length;
  if (bits <= 52) return Math.log2(Number(v));
  const shift = BigInt(bits - 52);
  return Math.log2(Number(v >> shift)) + Number(shift);
}

export function generatePassphrase(opts: PassphraseOptions, randomBytes: RandomBytes = webCryptoRandom): Generated {
  if (!Number.isInteger(opts.words) || opts.words < 1 || opts.words > 20) throw new RangeError('words must be 1..20');
  const list = EFF_SHORT_WORDLIST;
  const picked: string[] = [];
  for (let i = 0; i < opts.words; i++) {
    let w = list[uniformInt(list.length, randomBytes)]!;
    if (opts.capitalize) w = w[0]!.toUpperCase() + w.slice(1);
    picked.push(w);
  }
  let value = picked.join(opts.separator ?? '-');
  let bits = opts.words * Math.log2(list.length);
  if (opts.digit) {
    value += String(uniformInt(10, randomBytes));
    bits += Math.log2(10);
  }
  return { value, entropyBits: round1(bits) };
}

/** Rough strength label from entropy bits, for the UI only. */
export function strengthLabel(bits: number): { label: string; level: 0 | 1 | 2 | 3 | 4 } {
  if (bits < 40) return { label: 'Weak', level: 0 };
  if (bits < 60) return { label: 'Fair', level: 1 };
  if (bits < 80) return { label: 'Good', level: 2 };
  if (bits < 112) return { label: 'Strong', level: 3 };
  return { label: 'Very strong', level: 4 };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
