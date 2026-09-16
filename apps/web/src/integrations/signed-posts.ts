import type { AstroIntegration } from 'astro';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Publishes the canonical Markdown of every post at /raw/<id>.md and its
 * detached OpenPGP signature (when present) at /signatures/<id>.md.asc, so the
 * /verify page and any offline reader can check authorship with the WKD key.
 *
 * Rules enforced at build time (the build fails otherwise):
 *  - a post with `signed: true` must have a signature file;
 *  - a signature file must have a matching, `signed: true` post;
 *  - `src/content/signatures/<id>.md.sha256` must equal the current post bytes,
 *    so a post cannot be edited after signing without re-signing.
 *
 * The signature itself is produced offline by scripts/sign-post.sh (gpg); this
 * integration never touches private keys.
 */
export function signedPosts(): AstroIntegration {
  return {
    name: 'ivp:signed-posts',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const outDir = fileURLToPath(dir);
        const root = process.cwd();
        const postsDir = path.join(root, 'src', 'content', 'posts');
        const sigDir = path.join(root, 'src', 'content', 'signatures');
        const rawOut = path.join(outDir, 'raw');
        const sigOut = path.join(outDir, 'signatures');
        await fs.mkdir(rawOut, { recursive: true });
        await fs.mkdir(sigOut, { recursive: true });

        const postFiles = (await listFiles(postsDir)).filter((f) => /\.mdx?$/.test(f));
        const sigFiles = new Set(
          (await listFiles(sigDir).catch(() => [] as string[]))
            .map((f) => path.basename(f))
            .filter((f) => f !== 'README.md' && f !== '.gitkeep'),
        );
        const problems: string[] = [];
        let published = 0;
        let signed = 0;

        for (const file of postFiles) {
          const id = path.basename(file).replace(/\.mdx?$/, '');
          const bytes = await fs.readFile(file);
          const fm = parseFrontmatter(bytes.toString('utf8'));
          if (fm['draft'] === 'true') continue;
          await fs.writeFile(path.join(rawOut, `${id}.md`), bytes);
          published++;

          const ascName = `${id}.md.asc`;
          const shaName = `${id}.md.sha256`;
          const hasAsc = sigFiles.has(ascName);
          if (fm['signed'] === 'true' && !hasAsc) {
            problems.push(`${id}: frontmatter says signed: true but ${ascName} is missing`);
          }
          if (hasAsc) {
            if (fm['signed'] !== 'true') {
              problems.push(`${id}: ${ascName} exists but frontmatter lacks signed: true`);
            }
            const digest = createHash('sha256').update(bytes).digest('hex');
            const recorded = sigFiles.has(shaName)
              ? (await fs.readFile(path.join(sigDir, shaName), 'utf8')).trim().split(/\s+/)[0]
              : undefined;
            if (recorded !== digest) {
              problems.push(
                `${id}: post bytes changed since signing (sha256 ${digest.slice(0, 12)}… != recorded ${recorded?.slice(0, 12) ?? 'none'}); re-run scripts/sign-post.sh ${id}`,
              );
            }
            await fs.copyFile(path.join(sigDir, ascName), path.join(sigOut, ascName));
            signed++;
          }
          sigFiles.delete(ascName);
          sigFiles.delete(shaName);
        }
        for (const orphan of sigFiles) {
          if (orphan.endsWith('.asc') || orphan.endsWith('.sha256')) {
            problems.push(`signature ${orphan} has no matching published post`);
          }
        }

        if (problems.length) {
          for (const p of problems) logger.error(p);
          throw new Error(`signed-posts: ${problems.length} problem(s), see above`);
        }
        logger.info(`published ${published} raw post(s), ${signed} with signatures`);
      },
    },
  };
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listFiles(p)));
    else out.push(p);
  }
  return out;
}

/** Minimal frontmatter reader: only needs the scalar keys `draft` and `signed`. */
export function parseFrontmatter(src: string): Record<string, string> {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const out: Record<string, string> = {};
  if (!m) return out;
  for (const line of m[1]!.split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (kv) out[kv[1]!] = kv[2]!.trim().replace(/^["']|["']$/g, '');
  }
  return out;
}
