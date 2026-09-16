import type { APIRoute, GetStaticPaths } from 'astro';
import { SITE } from '@/site';
import { getPosts, getProjects, tagCounts } from '@/lib/content';
import { TOOLS } from '@/lib/tools';
import { renderOgPng, type OgInput } from '@/lib/og';

/**
 * One PNG per page at /og/<path>.png, referenced by <Head>. Static pages are
 * listed here explicitly; collections are enumerated.
 */
type OgProps = OgInput & Record<string, unknown>;

export const getStaticPaths: GetStaticPaths = async () => {
  const out: Array<{ params: { slug: string }; props: OgProps }> = [];
  const add = (slug: string, props: Omit<OgInput, 'site'>) => out.push({ params: { slug }, props: { ...props, site: SITE.title } });

  add('index', { title: SITE.title, subtitle: SITE.description });
  add('blog', { title: 'Blog', subtitle: 'Essays on reliability, networking, security and building things carefully.', kicker: SITE.title });
  add('projects', { title: 'Projects', subtitle: 'Design notes: decisions, alternatives, what broke.', kicker: SITE.title });
  add('tools', { title: 'Tools', subtitle: 'Small calculators that run entirely in your browser.', kicker: SITE.title });
  add('pgp', { title: 'PGP', subtitle: 'OpenPGP key for encrypted mail and verifying what I publish.', kicker: SITE.title });
  add('verify', { title: 'Verify a signature', subtitle: 'In-browser OpenPGP verification against the site key.', kicker: SITE.title });
  add('about', { title: 'About', subtitle: SITE.description, kicker: SITE.title });
  add('notes', { title: 'Notes', subtitle: 'Passcode-protected encrypted notebook. Ciphertext only on the server.', kicker: SITE.title });
  add('404', { title: 'Not found', kicker: SITE.title });

  for (const t of TOOLS) add(`tools/${t.id}`, { title: t.name, subtitle: t.description, kicker: 'Tools' });
  const posts = await getPosts();
  for (const p of posts) add(`blog/${p.id}`, { title: p.data.title, subtitle: p.data.summary, kicker: 'Blog' });
  for (const [tag, n] of tagCounts(posts)) add(`blog/tags/${tag}`, { title: `#${tag}`, subtitle: `${n} ${n === 1 ? 'post' : 'posts'}`, kicker: 'Blog' });
  for (const p of await getProjects()) add(`projects/${p.id}`, { title: p.data.title, subtitle: p.data.summary, kicker: 'Projects' });
  return out;
};

export const GET: APIRoute<OgProps> = async ({ props }) => {
  const png = await renderOgPng(props);
  return new Response(new Blob([png as BlobPart]), { headers: { 'Content-Type': 'image/png' } });
};
