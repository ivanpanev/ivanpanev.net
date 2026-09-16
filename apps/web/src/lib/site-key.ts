/**
 * Build-time access to the site's public key (server/frontmatter only; never
 * imported by islands). Returns undefined when no key is committed yet.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { readPublicKey, summarizeKey, type KeySummary } from './pgp';

export const SITE_KEY_FILE = 'src/pgp/publickey.asc';

let cache: Promise<KeySummary | undefined> | undefined;

export function getSiteKey(): Promise<KeySummary | undefined> {
  cache ??= (async () => {
    try {
      const armored = await fs.readFile(path.resolve(process.cwd(), SITE_KEY_FILE), 'utf8');
      return await summarizeKey(await readPublicKey(armored));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw e;
    }
  })();
  return cache;
}
