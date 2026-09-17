declare module 'culori' {
  export interface Color {
    mode: string;
    alpha?: number;
    r?: number;
    g?: number;
    b?: number;
    h?: number;
    s?: number;
    l?: number;
    w?: number;
    a?: number;
    c?: number;
  }

  export function parse(input: string): Color | undefined;
  export function formatHex(color: Color): string | undefined;
  export function wcagContrast(a: Color | string, b: Color | string): number;
  export function differenceCiede2000(): (a: Color | string, b: Color | string) => number;
  export function converter(mode: string): (color: Color | string) => Color | undefined;
}
