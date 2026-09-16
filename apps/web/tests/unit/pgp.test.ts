import { beforeAll, describe, expect, it } from 'vitest';
import * as openpgp from 'openpgp';
import {
  formatFingerprint,
  readPublicKey,
  summarizeKey,
  verifyCleartext,
  verifyDetached,
  wkdHash,
  zbase32,
} from '@/lib/pgp';

let priv: openpgp.PrivateKey;
let pub: openpgp.PublicKey;
let other: openpgp.PublicKey;

beforeAll(async () => {
  const a = await openpgp.generateKey({ type: 'curve25519', userIDs: [{ name: 'Test Site', email: 'ivan@ivanpanev.net' }], format: 'object' });
  priv = a.privateKey;
  pub = a.publicKey;
  const b = await openpgp.generateKey({ type: 'curve25519', userIDs: [{ name: 'Someone Else', email: 'x@example.org' }], format: 'object' });
  other = b.publicKey;
}, 30_000);

describe('WKD', () => {
  it('z-base-32 encodes known vectors', () => {
    // From the WKD draft: "Joe.Doe" -> iy9q119eutrkn8s1mk4r39qejnbu3n5q
    expect(zbase32(new Uint8Array([]))).toBe('');
    expect(zbase32(new Uint8Array([0xff]))).toBe('9h');
  });
  it('hashes local parts per draft-koch-openpgp-webkey-service', async () => {
    expect(await wkdHash('Joe.Doe')).toBe('iy9q119eutrkn8s1mk4r39qejnbu3n5q');
    expect(await wkdHash('joe.doe')).toBe('iy9q119eutrkn8s1mk4r39qejnbu3n5q');
  });
  it('formats fingerprints in groups of four', () => {
    expect(formatFingerprint('0123456789abcdef0123456789abcdef01234567')).toBe('0123 4567 89AB CDEF 0123 4567 89AB CDEF 0123 4567');
  });
});

describe('key summary', () => {
  it('describes a generated key', async () => {
    const s = await summarizeKey(await readPublicKey(pub.armor()));
    expect(s.fingerprint).toBe(pub.getFingerprint().toUpperCase());
    expect(s.keyId).toHaveLength(16);
    expect(s.userIds).toEqual(['Test Site <ivan@ivanpanev.net>']);
    expect(s.expires).toBe('never');
    expect(s.algorithm.toLowerCase()).toMatch(/ed25519|eddsa/);
    expect(s.subkeys).toHaveLength(1);
    expect(s.subkeys[0]!.usage).toContain('encrypt');
  });
});

describe('verification', () => {
  const text = 'hello world\n';
  const bytes = new TextEncoder().encode(text);

  it('accepts a good detached signature from the site key', async () => {
    const sig = await openpgp.sign({ message: await openpgp.createMessage({ binary: bytes }), signingKeys: priv, detached: true });
    const r = await verifyDetached(bytes, sig, [pub], pub.getFingerprint());
    expect(r.valid).toBe(true);
    expect(r.bySiteKey).toBe(true);
    expect(r.signerFingerprint).toBe(pub.getFingerprint().toUpperCase());
    expect(r.signedAt).toBeInstanceOf(Date);
  });

  it('rejects when the bytes changed', async () => {
    const sig = await openpgp.sign({ message: await openpgp.createMessage({ binary: bytes }), signingKeys: priv, detached: true });
    const r = await verifyDetached(new TextEncoder().encode('hello world!\n'), sig, [pub], pub.getFingerprint());
    expect(r.valid).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it('flags a good signature from a key that is not the site key', async () => {
    const otherPriv = (await openpgp.generateKey({ type: 'curve25519', userIDs: [{ name: 'O', email: 'o@example.org' }], format: 'object' })).privateKey;
    const sig = await openpgp.sign({ message: await openpgp.createMessage({ binary: bytes }), signingKeys: otherPriv, detached: true });
    const r = await verifyDetached(bytes, sig, [pub, otherPriv.toPublic()], pub.getFingerprint());
    expect(r.valid).toBe(true);
    expect(r.bySiteKey).toBe(false);
  });

  it('reports an unknown signer when no key matches', async () => {
    const sig = await openpgp.sign({ message: await openpgp.createMessage({ binary: bytes }), signingKeys: priv, detached: true });
    const r = await verifyDetached(bytes, sig, [other]);
    expect(r.valid).toBe(false);
    expect(r.signerFingerprint).toBeUndefined();
    expect(r.signerKeyId).toBeTruthy();
  });

  it('returns a readable error for garbage input', async () => {
    const r = await verifyDetached(bytes, 'not a signature', [pub]);
    expect(r.valid).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it('verifies clear-signed messages', async () => {
    const clear = await openpgp.sign({ message: await openpgp.createCleartextMessage({ text: 'signed statement' }), signingKeys: priv });
    const r = await verifyCleartext(clear, [pub], pub.getFingerprint());
    expect(r.valid).toBe(true);
    expect(r.bySiteKey).toBe(true);
    expect(r.text).toBe('signed statement');
    const bad = await verifyCleartext(clear.replace('signed statement', 'forged statement'), [pub], pub.getFingerprint());
    expect(bad.valid).toBe(false);
  });
});
