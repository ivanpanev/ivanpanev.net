import { describe, expect, it } from 'vitest';
import { CSS_NAMED, dominantPalette, formats, nearestName, parseColor, rotateHue, toHex } from './color';

describe('color', () => {
  it('parses hex and reports formats', () => {
    const c = parseColor('#0c6e17');
    expect(c).toBeTruthy();
    const f = formats(c!);
    expect(f.hex).toBe('#0c6e17');
    expect(f.rgb).toMatch(/^rgb\(/);
    expect(f.oklch).toMatch(/^oklch\(/);
  });
  it('finds an exact CSS name', () => {
    const n = nearestName(parseColor('#ff0000')!, CSS_NAMED);
    expect(n.exact).toBe(true);
    expect(n.name).toBe('red');
  });
  it('rotates hue 180 for complementary', () => {
    const c = parseColor('hsl(0 100% 50%)')!;
    expect(toHex(rotateHue(c, 180))).toBe('#00ffff');
  });
  it('extracts a dominant palette from solid pixels', () => {
    const data = new Uint8ClampedArray(12);
    data.set([12, 110, 23, 255, 12, 110, 23, 255, 255, 0, 0, 255]);
    const pal = dominantPalette(data, 2, 3);
    expect(pal).toHaveLength(2);
    expect(pal[0]).toMatch(/^#/);
  });
});
