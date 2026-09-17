import {
  converter,
  formatHex,
  parse,
  wcagContrast,
  differenceCiede2000,
  type Color,
} from 'culori';

export type NamedColor = { name: string; hex: string };

const toRgb = converter('rgb');
const toHsl = converter('hsl');
const toHwb = converter('hwb');
const toLab = converter('lab');
const toLch = converter('lch');
const toOklch = converter('oklch');

export function parseColor(input: string): Color | undefined {
  return parse(input.trim()) ?? undefined;
}

export function toHex(c: Color): string {
  return formatHex(c) ?? '#000000';
}

export interface ColorFormats {
  hex: string;
  rgb: string;
  hsl: string;
  hwb: string;
  lab: string;
  lch: string;
  oklch: string;
  cmyk: string;
}

function fmt(n: number, d = 1): string {
  return n.toFixed(d).replace(/\.0$/, '');
}

export function formats(c: Color): ColorFormats {
  const hex = toHex(c);
  const rgb = toRgb(c);
  const hsl = toHsl(c);
  const hwb = toHwb(c);
  const lab = toLab(c);
  const lch = toLch(c);
  const oklch = toOklch(c);
  const r = rgb?.r ?? 0;
  const g = rgb?.g ?? 0;
  const b = rgb?.b ?? 0;
  const k = 1 - Math.max(r, g, b);
  const cmy = k >= 1 ? [0, 0, 0] : [(1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k)];
  return {
    hex,
    rgb: `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`,
    hsl: `hsl(${fmt(hsl?.h ?? 0)} ${fmt((hsl?.s ?? 0) * 100)}% ${fmt((hsl?.l ?? 0) * 100)}%)`,
    hwb: `hwb(${fmt(hwb?.h ?? 0)} ${fmt((hwb?.w ?? 0) * 100)}% ${fmt((hwb?.b ?? 0) * 100)}%)`,
    lab: `lab(${fmt(lab?.l ?? 0)} ${fmt(lab?.a ?? 0)} ${fmt(lab?.b ?? 0)})`,
    lch: `lch(${fmt(lch?.l ?? 0)} ${fmt(lch?.c ?? 0)} ${fmt(lch?.h ?? 0)})`,
    oklch: `oklch(${fmt((oklch?.l ?? 0) * 100)}% ${fmt(oklch?.c ?? 0, 3)} ${fmt(oklch?.h ?? 0)})`,
    cmyk: `cmyk(${fmt(cmy[0]! * 100)}% ${fmt(cmy[1]! * 100)}% ${fmt(cmy[2]! * 100)}% ${fmt(k * 100)}%)`,
  };
}

export function contrastRatio(fg: Color, bg: Color): number {
  return wcagContrast(fg, bg);
}

export function nearestName(c: Color, names: NamedColor[]): { name: string; hex: string; exact: boolean; delta: number } {
  const hex = toHex(c).toLowerCase();
  let best = names[0] ?? { name: 'unknown', hex: '#000000' };
  let bestD = Number.POSITIVE_INFINITY;
  for (const n of names) {
    if (n.hex.toLowerCase() === hex) return { name: n.name, hex: n.hex, exact: true, delta: 0 };
    const d = differenceCiede2000()(c, n.hex);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return { name: best.name, hex: best.hex, exact: false, delta: bestD };
}

export function rotateHue(c: Color, deg: number): Color {
  const hsl = toHsl(c);
  return { mode: 'hsl', h: ((hsl?.h ?? 0) + deg + 360) % 360, s: hsl?.s ?? 0, l: hsl?.l ?? 0 };
}

export function tintsAndShades(c: Color, steps = 5): { tints: string[]; shades: string[] } {
  const hsl = toHsl(c);
  const tints: string[] = [];
  const shades: string[] = [];
  for (let i = 1; i <= steps; i++) {
    tints.push(toHex({ mode: 'hsl', h: hsl?.h ?? 0, s: hsl?.s ?? 0, l: Math.min(0.97, (hsl?.l ?? 0.5) + i * 0.08) }));
    shades.push(toHex({ mode: 'hsl', h: hsl?.h ?? 0, s: hsl?.s ?? 0, l: Math.max(0.06, (hsl?.l ?? 0.5) - i * 0.08) }));
  }
  return { tints, shades };
}

export function harmonies(c: Color): Record<string, string[]> {
  return {
    complementary: [toHex(c), toHex(rotateHue(c, 180))],
    analogous: [toHex(rotateHue(c, -30)), toHex(c), toHex(rotateHue(c, 30))],
    triadic: [toHex(c), toHex(rotateHue(c, 120)), toHex(rotateHue(c, 240))],
    split: [toHex(c), toHex(rotateHue(c, 150)), toHex(rotateHue(c, 210))],
  };
}

export function sampleAverage(data: Uint8ClampedArray, cx: number, cy: number, w: number, h: number, size: 1 | 3 | 5): { r: number; g: number; b: number } {
  const half = Math.floor(size / 2);
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = cy - half; y <= cy + half; y++) {
    for (let x = cx - half; x <= cx + half; x++) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const i = (y * w + x) * 4;
      r += data[i]!;
      g += data[i + 1]!;
      b += data[i + 2]!;
      n++;
    }
  }
  n = Math.max(1, n);
  return { r: r / n, g: g / n, b: b / n };
}

/** k-means on a downsampled pixel set. */
export function dominantPalette(data: Uint8ClampedArray, k = 6, samples = 800): string[] {
  const pixels: [number, number, number][] = [];
  const step = Math.max(1, Math.floor(data.length / 4 / samples));
  for (let i = 0; i < data.length; i += 4 * step) {
    pixels.push([data[i]!, data[i + 1]!, data[i + 2]!]);
  }
  if (pixels.length === 0) return [];
  const cents = pixels.slice(0, k).map((p) => [...p] as [number, number, number]);
  for (let iter = 0; iter < 8; iter++) {
    const buckets: [number, number, number, number][] = Array.from({ length: k }, () => [0, 0, 0, 0]);
    for (const p of pixels) {
      let bi = 0, bd = Infinity;
      for (let c = 0; c < k; c++) {
        const d = (p[0] - cents[c]![0]) ** 2 + (p[1] - cents[c]![1]) ** 2 + (p[2] - cents[c]![2]) ** 2;
        if (d < bd) {
          bd = d;
          bi = c;
        }
      }
      const b = buckets[bi]!;
      b[0] += p[0];
      b[1] += p[1];
      b[2] += p[2];
      b[3]++;
    }
    for (let c = 0; c < k; c++) {
      const b = buckets[c]!;
      if (b[3] > 0) cents[c] = [b[0] / b[3], b[1] / b[3], b[2] / b[3]];
    }
  }
  return cents.map(([r, g, b]) => formatHex({ mode: 'rgb', r: r / 255, g: g / 255, b: b / 255 }) ?? '#000000');
}

let namesPromise: Promise<NamedColor[]> | undefined;

export function loadColorNames(): Promise<NamedColor[]> {
  namesPromise ??= import('color-name-list/bestof').then((m) => {
    const raw = (m.default ?? m.colornames) as { name: string; hex: string }[];
    return raw.map((n) => ({ name: n.name, hex: n.hex.startsWith('#') ? n.hex : `#${n.hex}` }));
  });
  return namesPromise;
}

export const CSS_NAMED: NamedColor[] = [
  { name: 'black', hex: '#000000' },
  { name: 'white', hex: '#ffffff' },
  { name: 'red', hex: '#ff0000' },
  { name: 'lime', hex: '#00ff00' },
  { name: 'blue', hex: '#0000ff' },
  { name: 'yellow', hex: '#ffff00' },
  { name: 'cyan', hex: '#00ffff' },
  { name: 'magenta', hex: '#ff00ff' },
  { name: 'silver', hex: '#c0c0c0' },
  { name: 'gray', hex: '#808080' },
  { name: 'maroon', hex: '#800000' },
  { name: 'olive', hex: '#808000' },
  { name: 'green', hex: '#008000' },
  { name: 'purple', hex: '#800080' },
  { name: 'teal', hex: '#008080' },
  { name: 'navy', hex: '#000080' },
  { name: 'orange', hex: '#ffa500' },
  { name: 'rebeccapurple', hex: '#663399' },
];
