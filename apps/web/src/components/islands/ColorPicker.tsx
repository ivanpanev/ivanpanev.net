import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CSS_NAMED,
  contrastRatio,
  dominantPalette,
  formats,
  harmonies,
  loadColorNames,
  nearestName,
  parseColor,
  sampleAverage,
  tintsAndShades,
  toHex,
  type NamedColor,
} from '@/lib/color';
import CopyButton from './CopyButton';

const PALETTE_KEY = 'ivp.color.palettes';

type SavedPalette = { name: string; hexes: string[] };

function loadPalettes(): SavedPalette[] {
  try {
    const raw = localStorage.getItem(PALETTE_KEY);
    return raw ? (JSON.parse(raw) as SavedPalette[]) : [];
  } catch {
    return [];
  }
}

export default function ColorPicker() {
  const [input, setInput] = useState('#0c6e17');
  const [names, setNames] = useState<NamedColor[]>(CSS_NAMED);
  const [palettes, setPalettes] = useState<SavedPalette[]>([]);
  const [paletteName, setPaletteName] = useState('Untitled');
  const [builder, setBuilder] = useState<string[]>(['#0c6e17']);
  const [sample, setSample] = useState<1 | 3 | 5>(3);
  const [eyedropper, setEyedropper] = useState(false);
  const [loupe, setLoupe] = useState<{ x: number; y: number; hex: string } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgData = useRef<ImageData | null>(null);

  useEffect(() => {
    setPalettes(loadPalettes());
    void loadColorNames().then(setNames);
    setEyedropper('EyeDropper' in window);
  }, []);

  const color = useMemo(() => parseColor(input), [input]);
  const hex = color ? toHex(color) : '#000000';
  const fmt = color ? formats(color) : undefined;
  const named = color ? nearestName(color, names) : undefined;
  const harm = color ? harmonies(color) : undefined;
  const ramp = color ? tintsAndShades(color) : undefined;
  const canvasColor = parseColor('#f7f5ef');
  const contrast = color && canvasColor ? contrastRatio(color, canvasColor) : 0;

  function persist(next: SavedPalette[]) {
    setPalettes(next);
    try {
      localStorage.setItem(PALETTE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  function onFile(file: File) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const c = canvasRef.current;
      if (!c) return;
      const max = 720;
      const scale = Math.min(1, max / img.width);
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      imgData.current = ctx.getImageData(0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  function canvasPoint(e: React.MouseEvent<HTMLCanvasElement>) {
    const c = canvasRef.current;
    const data = imgData.current;
    if (!c || !data) return;
    const rect = c.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * c.width);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * c.height);
    const avg = sampleAverage(data.data, x, y, c.width, c.height, sample);
    return { x, y, avg, left: e.clientX - rect.left, top: e.clientY - rect.top };
  }

  function pickFromCanvas(e: React.MouseEvent<HTMLCanvasElement>) {
    const p = canvasPoint(e);
    if (!p) return;
    setInput(`rgb(${Math.round(p.avg.r)} ${Math.round(p.avg.g)} ${Math.round(p.avg.b)})`);
  }

  function moveLoupe(e: React.MouseEvent<HTMLCanvasElement>) {
    const p = canvasPoint(e);
    if (!p) return;
    setLoupe({
      x: p.left,
      y: p.top,
      hex: toHex({ mode: 'rgb', r: p.avg.r / 255, g: p.avg.g / 255, b: p.avg.b / 255 }),
    });
  }

  async function nativeDropper() {
    const ED = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
    if (!ED) return;
    const { sRGBHex } = await new ED().open();
    setInput(sRGBHex);
  }

  function exportCss(): string {
    return builder.map((h, i) => `--swatch-${i + 1}: ${h};`).join('\n');
  }

  function exportSvg(): string {
    const w = builder.length * 48;
    const rects = builder.map((h, i) => `<rect x="${i * 48}" y="0" width="48" height="48" fill="${h}"/>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="48">${rects}</svg>`;
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-[8rem_1fr] sm:items-start">
        <div className="h-24 w-full border border-line" style={{ background: hex }} aria-hidden="true" />
        <div>
          <label htmlFor="color-input" className="label">
            Any CSS colour
          </label>
          <input id="color-input" className="field font-mono" value={input} onChange={(e) => setInput(e.target.value)} />
          <p className="mt-2 text-sm text-fg-muted">
            {named ? (
              <>
                {named.exact ? 'Exact name: ' : 'Nearest name: '}
                <strong className="text-fg">{named.name}</strong> ({named.hex}
                {!named.exact && `, ΔE ${named.delta.toFixed(1)}`})
              </>
            ) : (
              'Could not parse that colour.'
            )}
          </p>
          {eyedropper && (
            <button type="button" className="btn mt-2" onClick={() => void nativeDropper()}>
              System eyedropper
            </button>
          )}
        </div>
      </div>

      {fmt && (
        <section aria-label="Conversions">
          <h2 className="kicker mb-3">Conversions</h2>
          <dl className="kv">
            {Object.entries(fmt).map(([k, v]) => (
              <div key={k} className="contents">
                <dt>{k.toUpperCase()}</dt>
                <dd>
                  {v} <CopyButton text={v} className="ml-2" />
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-sm text-fg-muted">
            Contrast on washi canvas: {contrast.toFixed(2)}:1 {contrast >= 4.5 ? '(AA body)' : contrast >= 3 ? '(AA large)' : '(fails AA)'}
          </p>
        </section>
      )}

      {harm && ramp && (
        <section aria-label="Harmonies">
          <h2 className="kicker mb-3">Harmonies</h2>
          {Object.entries(harm).map(([name, hexes]) => (
            <SwatchRow key={name} label={name} hexes={hexes} onPick={setInput} />
          ))}
          <SwatchRow label="tints" hexes={ramp.tints} onPick={setInput} />
          <SwatchRow label="shades" hexes={ramp.shades} onPick={setInput} />
        </section>
      )}

      <section aria-label="Palette builder">
        <h2 className="kicker mb-3">Palette</h2>
        <div className="flex flex-wrap gap-2">
          {builder.map((h, i) => (
            <button key={`${h}-${i}`} type="button" className="h-10 w-10 border border-line" style={{ background: h }} onClick={() => setInput(h)} aria-label={h} />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn" onClick={() => setBuilder((b) => [...b, hex])}>
            Add current
          </button>
          <input className="field max-w-48" value={paletteName} onChange={(e) => setPaletteName(e.target.value)} aria-label="Palette name" />
          <button
            type="button"
            className="btn"
            onClick={() => persist([...palettes, { name: paletteName || 'Untitled', hexes: builder }])}
          >
            Save
          </button>
          <CopyButton text={exportCss()} label="Copy CSS" />
          <CopyButton text={JSON.stringify(builder)} label="Copy JSON" />
          <CopyButton text={exportSvg()} label="Copy SVG" />
        </div>
        {palettes.length > 0 && (
          <ul className="mt-4 space-y-2">
            {palettes.map((p) => (
              <li key={p.name} className="flex flex-wrap items-center gap-2">
                <button type="button" className="underline" onClick={() => setBuilder(p.hexes)}>
                  {p.name}
                </button>
                {p.hexes.map((h) => (
                  <span key={h} className="inline-block h-4 w-4 border border-line" style={{ background: h }} />
                ))}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Image sampler">
        <h2 className="kicker mb-3">From an image</h2>
        <p className="mb-2 text-sm text-fg-muted">Drop or choose an image, then click to sample. Sample size {sample}×{sample}.</p>
        <div className="flex flex-wrap gap-2">
          <input
            type="file"
            accept="image/*"
            aria-label="Image"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />
          {([1, 3, 5] as const).map((n) => (
            <button key={n} type="button" className={`btn ${sample === n ? 'btn-primary' : ''}`} onClick={() => setSample(n)}>
              {n}×{n}
            </button>
          ))}
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (!imgData.current) return;
              setBuilder(dominantPalette(imgData.current.data));
            }}
          >
            Dominant palette
          </button>
        </div>
        <div className="relative mt-3 inline-block max-w-full">
          <canvas
            ref={canvasRef}
            className="max-w-full cursor-crosshair border border-line"
            onClick={pickFromCanvas}
            onMouseMove={moveLoupe}
            onMouseLeave={() => setLoupe(null)}
          />
          {loupe ? (
            <div
              className="pointer-events-none absolute z-10 h-16 w-16 rounded-full border-2 border-fg shadow"
              style={{
                left: loupe.x + 16,
                top: loupe.y - 40,
                background: loupe.hex,
              }}
              aria-hidden="true"
            >
              <span className="sr-only">{loupe.hex}</span>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function SwatchRow({ label, hexes, onPick }: { label: string; hexes: string[]; onPick: (h: string) => void }) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <span className="w-28 text-xs uppercase tracking-wider text-fg-subtle">{label}</span>
      {hexes.map((h) => (
        <button key={h} type="button" className="h-8 w-8 border border-line" style={{ background: h }} title={h} onClick={() => onPick(h)} />
      ))}
    </div>
  );
}
