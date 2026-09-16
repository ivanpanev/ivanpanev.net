import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseFrontmatter, signedPosts } from '@/integrations/signed-posts';

/**
 * Drives the integration's build:done hook against a temporary project
 * directory. Only the pieces of the hook context the integration reads are
 * provided.
 */
async function runHook(root: string, outDir: string) {
  const errors: string[] = [];
  const infos: string[] = [];
  const hook = signedPosts().hooks['astro:build:done']!;
  const cwd = process.cwd();
  process.chdir(root);
  let thrown: Error | undefined;
  try {
    await hook({
      dir: pathToFileURL(outDir + path.sep),
      logger: { error: (m: string) => errors.push(m), info: (m: string) => infos.push(m), warn: () => {} },
    } as never);
  } catch (e) {
    thrown = e as Error;
  } finally {
    process.chdir(cwd);
  }
  return { errors, infos, thrown };
}

let root: string;
let out: string;
const post = (fm: string, body = 'Body.\n') => `---\n${fm}\n---\n\n${body}`;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'ivp-signed-'));
  out = path.join(root, 'dist');
  await fs.mkdir(path.join(root, 'src', 'content', 'posts'), { recursive: true });
  await fs.mkdir(path.join(root, 'src', 'content', 'signatures'), { recursive: true });
  await fs.mkdir(out, { recursive: true });
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const write = (rel: string, data: string | Buffer) => fs.writeFile(path.join(root, rel), data);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

describe('parseFrontmatter', () => {
  it('reads scalar keys, tolerant of CRLF and quotes', () => {
    expect(parseFrontmatter('---\r\ntitle: "X"\r\nsigned: true\r\n---\r\nbody')).toEqual({ title: 'X', signed: 'true' });
    expect(parseFrontmatter('no frontmatter')).toEqual({});
  });
});

describe('signed-posts integration', () => {
  it('publishes raw posts and skips drafts', async () => {
    await write('src/content/posts/a.md', post('title: A\ndraft: false'));
    await write('src/content/posts/b.md', post('title: B\ndraft: true'));
    const { errors, infos } = await runHook(root, out);
    expect(errors).toEqual([]);
    expect(infos[0]).toMatch(/published 1 raw post/);
    await expect(fs.readFile(path.join(out, 'raw', 'a.md'), 'utf8')).resolves.toContain('title: A');
    await expect(fs.access(path.join(out, 'raw', 'b.md'))).rejects.toThrow();
  });

  it('copies a valid signature when the digest matches', async () => {
    const src = post('title: A\nsigned: true');
    await write('src/content/posts/a.md', src);
    await write('src/content/signatures/a.md.asc', '-----BEGIN PGP SIGNATURE-----\n...\n');
    await write('src/content/signatures/a.md.sha256', `${sha(src)}  a.md\n`);
    const { errors, infos } = await runHook(root, out);
    expect(errors).toEqual([]);
    expect(infos[0]).toMatch(/1 with signatures/);
    await expect(fs.access(path.join(out, 'signatures', 'a.md.asc'))).resolves.toBeUndefined();
  });

  it('fails when the post changed after signing', async () => {
    await write('src/content/posts/a.md', post('title: A\nsigned: true', 'edited\n'));
    await write('src/content/signatures/a.md.asc', 'sig');
    await write('src/content/signatures/a.md.sha256', `${sha('something else')}\n`);
    const r = await runHook(root, out);
    expect(r.thrown?.message).toMatch(/1 problem/);
    expect(r.errors[0]).toMatch(/changed since signing/);
  });

  it('fails when signed: true has no signature, or a signature has no signed: true', async () => {
    await write('src/content/posts/a.md', post('title: A\nsigned: true'));
    const r1 = await runHook(root, out);
    expect(r1.thrown).toBeDefined();
    expect(r1.errors[0]).toMatch(/is missing/);

    const src = post('title: B');
    await fs.rm(path.join(root, 'src/content/posts/a.md'));
    await write('src/content/posts/b.md', src);
    await write('src/content/signatures/b.md.asc', 'sig');
    await write('src/content/signatures/b.md.sha256', sha(src));
    const r2 = await runHook(root, out);
    expect(r2.thrown).toBeDefined();
    expect(r2.errors[0]).toMatch(/lacks signed: true/);
  });

  it('fails on orphan signatures and ignores the README', async () => {
    await write('src/content/posts/a.md', post('title: A'));
    await write('src/content/signatures/README.md', '# notes');
    const ok = await runHook(root, out);
    expect(ok.thrown).toBeUndefined();
    expect(ok.errors).toEqual([]);
    await write('src/content/signatures/zzz.md.asc', 'sig');
    const bad = await runHook(root, out);
    expect(bad.thrown).toBeDefined();
    expect(bad.errors[0]).toMatch(/no matching published post/);
  });
});
