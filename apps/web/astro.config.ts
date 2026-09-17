import { defineConfig, fontProviders } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import pagefind from 'astro-pagefind';
import tailwindcss from '@tailwindcss/vite';
import { signedPosts } from './src/integrations/signed-posts';
import { wkd } from './src/integrations/wkd';
import { SITE } from './src/site';

// https://docs.astro.build/en/reference/configuration-reference/
export default defineConfig({
  site: 'https://ivanpanev.net',
  output: 'static',
  // /blog/post -> dist/blog/post.html. Workers Static Assets serves that at
  // /blog/post and redirects /blog/post/ to it (html_handling: auto-trailing-slash).
  build: { format: 'file', inlineStylesheets: 'auto' },
  trailingSlash: 'never',
  // Astro 7 default; kept explicit because it changes inline-element spacing rules.
  compressHTML: 'jsx',
  prefetch: { prefetchAll: false, defaultStrategy: 'hover' },
  devToolbar: { enabled: false },

  integrations: [
    react(),
    mdx(),
    sitemap({ filter: (page) => !page.includes('/raw/') && !page.includes('/signatures/') }),
    pagefind({ indexConfig: { verbose: false } }),
    signedPosts(),
    wkd({ keyFile: 'src/pgp/publickey.asc', email: SITE.email }),
  ],

  vite: { plugins: [tailwindcss()] },

  markdown: {
    // Sätteri (Astro 7 default): GFM + smartypants + heading ids, no remark/rehype.
    shikiConfig: {
      // The *-default variants meet 4.5:1 for comments (github-dark's #6a737d
      // on #24292e is 3.0:1 and fails axe on every code block).
      themes: { light: 'github-light-default', dark: 'github-dark-default' },
      // Emit CSS variables per token instead of a default colour so the
      // active theme is chosen by CSS (see global.css), not by JS.
      defaultColor: false,
    },
  },

  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: 'Zen Kaku Gothic New',
      cssVariable: '--font-zen-kaku',
      weights: [300, 400, 500],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['system-ui', 'sans-serif'],
    },
    {
      provider: fontProviders.fontsource(),
      name: 'Zen Old Mincho',
      cssVariable: '--font-zen-mincho',
      weights: [400, 500],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['Georgia', 'serif'],
    },
    {
      provider: fontProviders.fontsource(),
      name: 'JetBrains Mono',
      cssVariable: '--font-jetbrains-mono',
      weights: ['400 700'],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['ui-monospace', 'monospace'],
    },
  ],

  security: {
    // Astro emits a <meta http-equiv="content-security-policy"> per page with a
    // hash for every inline script/style it renders. Directives that a meta
    // tag cannot carry (frame-ancestors, report-to) live in public/_headers.
    csp: {
      algorithm: 'SHA-256',
      directives: [
        "default-src 'none'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "connect-src 'self' https://notes-api.ivanpanev.net",
        "media-src 'self'",
        "worker-src 'self' blob:",
        "manifest-src 'self'",
        "base-uri 'none'",
        "form-action 'none'",
        "object-src 'none'",
        'upgrade-insecure-requests',
      ],
      scriptDirective: {
        // 'wasm-unsafe-eval' is required by Pagefind's WebAssembly index.
        resources: ["'self'", "'wasm-unsafe-eval'"],
      },
      styleDirective: {
        // Shiki emits per-token style attributes; allow inline style *attributes*
        // only, while <style> elements stay hash-protected (Astro 7.1+). Once any
        // -attr resource exists, browsers stop falling back to style-src for the
        // element scope, so 'self' must be declared on style-src-elem explicitly.
        resources: [
          { resource: "'self'", kind: 'element' },
          { resource: "'unsafe-inline'", kind: 'attribute' },
        ],
      },
    },
  },
});
