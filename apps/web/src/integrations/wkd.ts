import type { AstroIntegration } from 'astro';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { readPublicKey, wkdHash } from '../lib/pgp';

const execFileAsync = promisify(execFile);

/** True when git tracks `rel` in `cwd`. Missing git or an untracked path is false. */
export async function isGitTracked(rel: string, cwd: string = process.cwd()): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('git', ['ls-files', '--error-unmatch', '--', rel], { cwd });
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

export interface WkdOptions {
  /** Path (relative to the project root) of the armoured public key. */
  keyFile: string;
  /** Address the key is published for; local part selects the WKD filename. */
  email: string;
}

/**
 * Publishes the site's OpenPGP public key:
 *  - /pgp/<local>.asc                             armoured, for humans and links
 *  - /.well-known/openpgpkey/hu/<zbase32(sha1)>   binary, WKD direct method
 *  - /.well-known/openpgpkey/policy               empty file, required by WKD
 *
 * When the key file is absent and is not tracked in git, the build still
 * succeeds (pre-ceremony). After `publickey.asc` is committed, deleting it
 * fails the build. `IVP_REQUIRE_WKD=1` forces the hard fail even before that.
 * An unparsable or private key always fails the build.
 */
export function wkd(opts: WkdOptions): AstroIntegration {
  return {
    name: 'ivp:wkd',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const outDir = fileURLToPath(dir);
        const keyPath = path.resolve(process.cwd(), opts.keyFile);
        const [local] = opts.email.split('@') as [string, string];
        let armored: string;
        try {
          armored = await fs.readFile(keyPath, 'utf8');
        } catch {
          const required = process.env['IVP_REQUIRE_WKD'] === '1' || (await isGitTracked(opts.keyFile));
          if (required) {
            throw new Error(
              `no public key at ${opts.keyFile}; WKD is required (file is git-tracked or IVP_REQUIRE_WKD=1)`,
            );
          }
          logger.warn(`no public key at ${opts.keyFile}; skipping /pgp/${local}.asc and WKD`);
          return;
        }
        const key = await readPublicKey(armored); // throws -> build fails
        if (key.isPrivate()) throw new Error(`${opts.keyFile} contains PRIVATE key material; refusing to publish`);
        const uids = key.getUserIDs();
        if (!uids.some((u) => u.toLowerCase().includes(`<${opts.email.toLowerCase()}>`) || u.toLowerCase() === opts.email.toLowerCase())) {
          throw new Error(`${opts.keyFile} has no user ID for ${opts.email} (found: ${uids.join('; ')})`);
        }

        const pgpDir = path.join(outDir, 'pgp');
        const huDir = path.join(outDir, '.well-known', 'openpgpkey', 'hu');
        await fs.mkdir(pgpDir, { recursive: true });
        await fs.mkdir(huDir, { recursive: true });
        await fs.writeFile(path.join(pgpDir, `${local}.asc`), armored);
        const hash = await wkdHash(local);
        await fs.writeFile(path.join(huDir, hash), key.write());
        await fs.writeFile(path.join(outDir, '.well-known', 'openpgpkey', 'policy'), '');
        logger.info(`published ${key.getFingerprint().toUpperCase()} at /pgp/${local}.asc and /.well-known/openpgpkey/hu/${hash}`);
      },
    },
  };
}
