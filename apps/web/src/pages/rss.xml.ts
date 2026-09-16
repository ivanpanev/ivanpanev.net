import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { SITE } from '@/site';
import { getPosts, postUrl } from '@/lib/content';

export async function GET(context: APIContext) {
  const posts = await getPosts();
  return rss({
    title: `${SITE.title} · Blog`,
    description: SITE.description,
    site: context.site!,
    trailingSlash: false,
    items: posts.map((p) => ({
      title: p.data.title,
      pubDate: p.data.date,
      description: p.data.summary,
      link: postUrl(p),
      categories: p.data.tags,
    })),
    customData: `<language>${SITE.locale}</language>`,
  });
}
