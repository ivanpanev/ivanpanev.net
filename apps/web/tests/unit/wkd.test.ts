import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as openpgp from 'openpgp';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { wkd } from '@/integrations/wkd';
import { wkdHash } from '@/lib/pgp';

const EMAIL = 'ivan@ivanpanev.net';
let armoredPub: string;
let armoredPriv: string;
let armoredWrongUid: string;
let root: string;
let out: string;

beforeAll(async () => {
  const k = await openpgp.generateKey({ type: 'curve25519', userIDs: [{ name: 'Ivan', email: EMAIL }] });
  armoredPub = k.publicKey;
  armoredPriv = k.privateKey;
  armoredWrongUid = (await openpgp.generateKey({ type: 'curve25519', userIDs: [{ email: 'nobody@example.org' }] })).publicKey;
}, 30_000);

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'ivp-wkd-'));
  out = path.join(root, 'dist');
  await fs.mkdir(path.join(root, 'src', 'pgp'), { recursive: true });
  await fs.mkdir(out, { recursive: true });
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

async function run() {
  const warns: string[] = [];
  const infos: string[] = [];
  const hook = wkd({ keyFile: 'src/pgp/publickey.asc', email: EMAIL }).hooks['astro:build:done']!;
  const cwd = process.cwd();
  process.chdir(root);
  let thrown: Error | undefined;
  try {
    await hook({
      dir: pathToFileURL(out + path.sep),
      logger: { warn: (m: string) => warns.push(m), info: (m: string) => infos.push(m), error: () => {} },
    } as never);
  } catch (e) {
    thrown = e as Error;
  } finally {
    process.chdir(cwd);
  }
  return { warns, infos, thrown };
}

describe('wkd integration', () => {
  it('warns and skips when no key is present', async () => {
    const r = await run();
    expect(r.thrown).toBeUndefined();
    expect(r.warns[0]).toMatch(/no public key/);
    await expect(fs.access(path.join(out, 'pgp'))).rejects.toThrow();
  });

  it('publishes armoured, binary WKD and policy files', async () => {
    await fs.writeFile(path.join(root, 'src/pgp/publickey.asc'), armoredPub);
    const r = await run();
    expect(r.thrown).toBeUndefined();
    expect(r.infos[0]).toMatch(/published [0-9A-F]{40}/);
    const asc = await fs.readFile(path.join(out, 'pgp', 'ivan.asc'), 'utf8');
    expect(asc).toBe(armoredPub);
    const hu = path.join(out, '.well-known', 'openpgpkey', 'hu', await wkdHash('ivan'));
    const bin = await fs.readFile(hu);
    const parsed = await openpgp.readKey({ binaryKey: bin });
    expect(parsed.getFingerprint()).toBe((await openpgp.readKey({ armoredKey: armoredPub })).getFingerprint());
    expect(await fs.readFile(path.join(out, '.well-known', 'openpgpkey', 'policy'), 'utf8')).toBe('');
  });

  it('refuses private key material', async () => {
    await fs.writeFile(path.join(root, 'src/pgp/publickey.asc'), armoredPriv);
    const r = await run();
    expect(r.thrown?.message).toMatch(/PRIVATE/);
  });

  it('refuses a key without the site user ID', async () => {
    await fs.writeFile(path.join(root, 'src/pgp/publickey.asc'), armoredWrongUid);
    const r = await run();
    expect(r.thrown?.message).toMatch(/no user ID/);
  });

  it('fails the build on an unparsable key', async () => {
    await fs.writeFile(path.join(root, 'src/pgp/publickey.asc'), 'garbage');
    const r = await run();
    expect(r.thrown).toBeDefined();
  });
});
