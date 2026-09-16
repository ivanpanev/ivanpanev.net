import { getViteConfig } from 'astro/config';

// Uses Astro's Vite config so `@/` aliases and astro:* virtual modules resolve.
export default getViteConfig({
  test: {
    globals: true,
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts', 'src/integrations/**/*.ts'],
      exclude: ['src/lib/og.ts', 'src/lib/site-key.ts', 'src/lib/content.ts', 'src/lib/tools.ts'],
      thresholds: { lines: 85, functions: 85, branches: 75 },
    },
  },
});
