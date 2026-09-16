/**
 * Open Graph image rendering (build time only). Satori turns a small JSX-like
 * object tree into SVG; resvg rasterises it to PNG. Fonts are read from the
 * fontsource package already installed for the site so the card matches it.
 */
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

type Font = { name: string; data: ArrayBuffer; weight: 400 | 700; style: 'normal' };
let fontsPromise: Promise<Font[]> | undefined;

async function loadFonts(): Promise<Font[]> {
  fontsPromise ??= (async () => {
    const dir = path.dirname(require.resolve('@fontsource/inter/package.json'));
    const read = async (file: string) => {
      const b = await fs.readFile(path.join(dir, 'files', file));
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    };
    return [
      { name: 'Inter', data: await read('inter-latin-400-normal.woff'), weight: 400, style: 'normal' },
      { name: 'Inter', data: await read('inter-latin-700-normal.woff'), weight: 700, style: 'normal' },
    ];
  })();
  return fontsPromise;
}

export interface OgInput {
  title: string;
  subtitle?: string | undefined;
  kicker?: string | undefined;
  site: string;
}

/** Satori accepts a React-element-shaped object tree; we build it without React. */
type Node = { type: string; props: { style?: Record<string, string | number>; children?: unknown } };
const el = (type: string, props: Node['props']): Node => ({ type, props });

export function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}

export async function renderOgPng(input: OgInput): Promise<Uint8Array> {
  const fonts = await loadFonts();
  const title = truncate(input.title, 90);
  const subtitle = input.subtitle ? truncate(input.subtitle, 160) : undefined;
  const tree = el('div', {
    style: {
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '64px 72px',
      background: 'linear-gradient(135deg, #101215 0%, #1a1f2a 100%)',
      color: '#e8eaed',
      fontFamily: 'Inter',
    },
    children: [
      el('div', {
        style: { display: 'flex', alignItems: 'center', gap: 14, fontSize: 26, color: '#a7aeb8' },
        children: [
          el('div', { style: { width: 16, height: 16, borderRadius: 999, background: '#7aa7ff' } }),
          el('div', { children: input.kicker ?? input.site }),
        ],
      }),
      el('div', {
        style: { display: 'flex', flexDirection: 'column', gap: 22 },
        children: [
          el('div', {
            style: { fontSize: title.length > 50 ? 56 : 68, fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em' },
            children: title,
          }),
          subtitle ? el('div', { style: { fontSize: 30, lineHeight: 1.35, color: '#a7aeb8' }, children: subtitle }) : null,
        ],
      }),
      el('div', {
        style: { display: 'flex', justifyContent: 'space-between', fontSize: 24, color: '#737b86' },
        children: [el('div', { children: input.site }), el('div', { children: 'ivanpanev.net' })],
      }),
    ],
  });
  // Satori's parameter type is React.ReactNode, but it only reads {type, props}.
  const svg = await satori(tree as unknown as Parameters<typeof satori>[0], { width: 1200, height: 630, fonts });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
  return new Uint8Array(png);
}
