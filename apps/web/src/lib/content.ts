import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'posts'>;
export type Project = CollectionEntry<'projects'>;

const isProd = import.meta.env.PROD;

/** Published posts, newest first. Drafts are visible in dev only. */
export async function getPosts(): Promise<Post[]> {
  const all = await getCollection('posts', (p) => !isProd || !p.data.draft);
  return all.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

/** Published projects ordered by `order` then title. */
export async function getProjects(): Promise<Project[]> {
  const all = await getCollection('projects', (p) => !isProd || !p.data.draft);
  return all.sort(
    (a, b) => a.data.order - b.data.order || a.data.title.localeCompare(b.data.title),
  );
}

export function postUrl(post: Post): string {
  return `/blog/${post.id}`;
}
export function projectUrl(project: Project): string {
  return `/projects/${project.id}`;
}

export function tagCounts(posts: Post[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of posts) for (const t of p.data.tags) m.set(t, (m.get(t) ?? 0) + 1);
  return new Map([...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

export function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: '2-digit' });
}
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
