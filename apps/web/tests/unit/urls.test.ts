import { describe, expect, it } from 'vitest';
import { canonicalPath, ogImagePath } from '@/lib/urls';

describe('canonicalPath', () => {
  it('maps the home page', () => {
    expect(canonicalPath('/')).toBe('/');
    expect(canonicalPath('/index.html')).toBe('/');
    expect(canonicalPath('')).toBe('/');
  });

  it('strips the file-format suffix and trailing slashes', () => {
    expect(canonicalPath('/blog/hello-world.html')).toBe('/blog/hello-world');
    expect(canonicalPath('/blog/hello-world/')).toBe('/blog/hello-world');
    expect(canonicalPath('/projects/site-platform.html')).toBe('/projects/site-platform');
  });
});

describe('ogImagePath', () => {
  it('maps / to /og/index.png and other paths to /og/<path>.png', () => {
    expect(ogImagePath('/')).toBe('/og/index.png');
    expect(ogImagePath('/index.html')).toBe('/og/index.png');
    expect(ogImagePath('/blog/hello-world.html')).toBe('/og/blog/hello-world.png');
  });
});
