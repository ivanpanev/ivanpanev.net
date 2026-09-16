/**
 * OpenPGP helpers shared by the build (key introspection, WKD path) and the
 * browser (/verify). Only public-key material and signatures pass through here.
 */
import * as openpgp from 'openpgp';

export interface KeySummary {
  fingerprint: string;
  keyId: string;
  algorithm: string;
  created: Date;
  expires: Expiry;
  userIds: string[];
  subkeys: Array<{ fingerprint: string; algorithm: string; usage: string; created: Date; expires: Expiry }>;
}

export async function readPublicKey(armored: string): Promise<openpgp.PublicKey> {
  return openpgp.readKey({ armoredKey: armored });
}

type Expiry = Date | 'never' | 'invalid';

async function expiryOf(p: Promise<Date | typeof Infinity | null>): Promise<Expiry> {
  try {
    const e = await p;
    return e === null || e === Infinity ? 'never' : (e as Date);
  } catch {
    return 'invalid';
  }
}

export async function summarizeKey(key: openpgp.PublicKey): Promise<KeySummary> {
  const primary = key.getKeys()[0]!;
  const algo = key.getAlgorithmInfo();
  const subkeys = await Promise.all(
    key.getSubkeys().map(async (sk) => ({
      fingerprint: sk.getFingerprint().toUpperCase(),
      algorithm: describeAlgo(sk.getAlgorithmInfo()),
      usage: await subkeyUsage(sk),
      created: sk.getCreationTime(),
      expires: await expiryOf(sk.getExpirationTime()),
    })),
  );
  return {
    fingerprint: primary.getFingerprint().toUpperCase(),
    keyId: primary.getKeyID().toHex().toUpperCase(),
    algorithm: describeAlgo(algo),
    created: primary.getCreationTime(),
    expires: await expiryOf(key.getExpirationTime()),
    userIds: key.getUserIDs(),
    subkeys,
  };
}

async function subkeyUsage(sk: openpgp.Subkey): Promise<string> {
  // Key flags live on the binding signature; openpgp exposes them via the latest valid binding signature.
  try {
    const sig = await sk.verify();
    const f = sig.keyFlags?.[0] ?? 0;
    const out: string[] = [];
    if (f & 0x01) out.push('certify');
    if (f & 0x02) out.push('sign');
    if (f & (0x04 | 0x08)) out.push('encrypt');
    if (f & 0x20) out.push('authenticate');
    return out.join(', ') || 'unknown';
  } catch {
    return 'unknown';
  }
}

function describeAlgo(a: { algorithm: string; bits?: number; curve?: string }): string {
  const name = a.algorithm.replace(/([a-z])([A-Z])/g, '$1 $2');
  if (a.curve) return `${name} (${a.curve})`;
  if (a.bits) return `${name} ${a.bits}`;
  return name;
}

/** "ABCD EFGH IJKL ..." grouping for display. */
export function formatFingerprint(fp: string): string {
  return fp.replace(/\s+/g, '').toUpperCase().match(/.{1,4}/g)?.join(' ') ?? fp;
}

// ------------------------------------------------------------------ WKD

const ZB32 = 'ybndrfg8ejkmcpqxot1uwisza345h769';

/** z-base-32 (RFC 6189 §5.1.6 / draft-koch-openpgp-webkey-service) of a byte array. */
export function zbase32(bytes: Uint8Array): string {
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const b of bytes) {
    buffer = (buffer << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ZB32[(buffer >> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ZB32[(buffer << (5 - bits)) & 31];
  return out;
}

/**
 * WKD "hu" filename for a local part: zbase32(sha1(lowercase(localpart))).
 * Both Node and browsers expose SHA-1 via WebCrypto.
 */
export async function wkdHash(localPart: string): Promise<string> {
  const data = new TextEncoder().encode(localPart.toLowerCase());
  const digest = await crypto.subtle.digest('SHA-1', data);
  return zbase32(new Uint8Array(digest));
}

export function wkdDirectUrl(email: string): { url: string; hash: Promise<string> } {
  const [local, domain] = email.split('@') as [string, string];
  const hash = wkdHash(local);
  return {
    url: `https://${domain}/.well-known/openpgpkey/hu/`,
    hash,
  };
}

// ------------------------------------------------------------------ verification

export interface VerifyResult {
  valid: boolean;
  /** Fingerprint of the key that produced the signature, if any signature packet was found. */
  signerFingerprint?: string;
  signerKeyId?: string;
  signedAt?: Date;
  /** True when the signer matches the site key. */
  bySiteKey: boolean;
  error?: string;
}

/**
 * Verify a detached signature over `message` (bytes preserved exactly) with
 * the given public key(s).
 */
export async function verifyDetached(
  message: Uint8Array,
  armoredSignature: string,
  keys: openpgp.PublicKey[],
  siteKeyFingerprint?: string,
): Promise<VerifyResult> {
  try {
    const signature = await openpgp.readSignature({ armoredSignature });
    const msg = await openpgp.createMessage({ binary: message });
    const res = await openpgp.verify({ message: msg, signature, verificationKeys: keys, format: 'binary' });
    return await collect(res.signatures, keys, siteKeyFingerprint);
  } catch (e) {
    return { valid: false, bySiteKey: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Verify a cleartext-signed message ("-----BEGIN PGP SIGNED MESSAGE-----"). */
export async function verifyCleartext(
  armored: string,
  keys: openpgp.PublicKey[],
  siteKeyFingerprint?: string,
): Promise<VerifyResult & { text?: string }> {
  try {
    const message = await openpgp.readCleartextMessage({ cleartextMessage: armored });
    const res = await openpgp.verify({ message, verificationKeys: keys });
    return { ...(await collect(res.signatures, keys, siteKeyFingerprint)), text: res.data };
  } catch (e) {
    return { valid: false, bySiteKey: false, error: e instanceof Error ? e.message : String(e) };
  }
}

type VerificationResult = openpgp.VerifyMessageResult['signatures'][number];

async function collect(
  signatures: VerificationResult[],
  keys: openpgp.PublicKey[],
  siteKeyFingerprint: string | undefined,
): Promise<VerifyResult> {
  if (!signatures.length) return { valid: false, bySiteKey: false, error: 'No signature found' };
  const first = signatures[0]!;
  const keyId = first.keyID.toHex().toUpperCase();
  let valid = false;
  let error: string | undefined;
  try {
    await first.verified;
    valid = true;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  let signedAt: Date | undefined;
  let signerFingerprint: string | undefined;
  try {
    const sig = await first.signature;
    signedAt = sig.packets[0]?.created ?? undefined;
  } catch {
    /* unreadable signature packet */
  }
  for (const k of keys) {
    const match = k.getKeys().find((sub) => sub.getKeyID().toHex().toUpperCase() === keyId);
    if (match) {
      signerFingerprint = k.getFingerprint().toUpperCase();
      break;
    }
  }
  const bySiteKey = !!siteKeyFingerprint && signerFingerprint === siteKeyFingerprint.toUpperCase();
  const out: VerifyResult = { valid, bySiteKey, signerKeyId: keyId };
  if (signerFingerprint) out.signerFingerprint = signerFingerprint;
  if (signedAt) out.signedAt = signedAt;
  if (error) out.error = error;
  return out;
}
