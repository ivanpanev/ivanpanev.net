import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { PROJECT_SECTIONS } from './site';

const sectionIds = PROJECT_SECTIONS.map((s) => s.id) as [string, ...string[]];

const posts = defineCollection({
  loader: glob({ base: './src/content/posts', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    title: z.string().min(1).max(120),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    summary: z.string().min(1).max(300),
    tags: z.array(z.string().regex(/^[a-z0-9-]+$/)).default([]),
    draft: z.boolean().default(false),
    /**
     * True when src/content/signatures/<id>.md.asc exists and was produced from
     * the exact bytes of this file. The signed-posts integration verifies the
     * pairing at build time and fails the build on a mismatch.
     */
    signed: z.boolean().default(false),
  }),
});

const projects = defineCollection({
  loader: glob({ base: './src/content/projects', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    title: z.string().min(1).max(120),
    section: z.enum(sectionIds),
    order: z.number().int().default(100),
    status: z.enum(['idea', 'active', 'done', 'archived']).default('active'),
    stack: z.array(z.string()).default([]),
    repo: z.url({ protocol: /^https$/ }).optional(),
    summary: z.string().min(1).max(300),
    updated: z.coerce.date().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { posts, projects };
