/**
 * Client-side notebook crypto (ADR-0009).
 *
 * passcode -> Argon2id (64 MiB, 3, 1, salt = SHA-256("ivanpanev.net/notebook/v1"))
 * -> 96 bytes split into lookupKey / authKey / encKey.
 * notebookId = base64url(SHA-256(lookupKey))
 * authProof  = base64url(SHA-256(authKey))
 * Items are AES-256-GCM under encKey with a random 96-bit nonce.
 *
 * The KDF is injectable so unit tests can skip the memory-hard path.
 */
import { argon2id } from 'hash-wasm';

export const NOTEBOOK_SALT_INFO = 'ivanpanev.net/notebook/v1';
export const ARGON2 = { iterations: 3, memorySize: 65536, parallelism: 1, hashLength: 96 } as const;
export const API_BASE = (import.meta.env.PUBLIC_NOTES_API as string | undefined) ?? 'https://notes-api.ivanpanev.net';

export type ItemKind = 'text' | 'code' | 'image';

export interface NotebookKeys {
  lookupKey: Uint8Array;
  authKey: Uint8Array;
  encKey: Uint8Array;
  notebookId: string;
  authProof: string;
}

export interface Envelope {
  v: 1;
  kind: ItemKind;
  title?: string;
  language?: string;
  filename?: string;
  mime?: string;
  body: string;
}

export type Argon2idFn = (opts: {
  password: string;
  salt: Uint8Array;
  iterations: number;
  memorySize: number;
  parallelism: number;
  hashLength: number;
  outputType: 'binary';
}) => Promise<Uint8Array>;

const defaultKdf: Argon2idFn = (opts) =>
  argon2id({
    password: opts.password,
    salt: opts.salt,
    iterations: opts.iterations,
    memorySize: opts.memorySize,
    parallelism: opts.parallelism,
    hashLength: opts.hashLength,
    outputType: 'binary',
  });

export function passcodeMeetsPolicy(passcode: string): { ok: true } | { ok: false; reason: string } {
  if (passcode.length >= 12) return { ok: true };
  const words = passcode
    .trim()
    .split(/[\s-]+/)
    .filter((w) => w.length >= 3);
  if (words.length >= 3) return { ok: true };
  return { ok: false, reason: 'Use at least 12 characters, or at least three dictionary words.' };
}

export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data as BufferSource));
}

export function b64url(data: Uint8Array): string {
  let bin = '';
  for (const b of data) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function unb64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function deriveKeys(passcode: string, kdf: Argon2idFn = defaultKdf): Promise<NotebookKeys> {
  const salt = await sha256(new TextEncoder().encode(NOTEBOOK_SALT_INFO));
  const raw = await kdf({
    password: passcode,
    salt,
    iterations: ARGON2.iterations,
    memorySize: ARGON2.memorySize,
    parallelism: ARGON2.parallelism,
    hashLength: ARGON2.hashLength,
    outputType: 'binary',
  });
  if (raw.byteLength !== 96) throw new Error('KDF output must be 96 bytes');
  const lookupKey = raw.slice(0, 32);
  const authKey = raw.slice(32, 64);
  const encKey = raw.slice(64, 96);
  return {
    lookupKey,
    authKey,
    encKey,
    notebookId: b64url(await sha256(lookupKey)),
    authProof: b64url(await sha256(authKey)),
  };
}

export async function encryptEnvelope(encKey: Uint8Array, envelope: Envelope): Promise<{ nonce: string; ciphertext: string }> {
  const key = await crypto.subtle.importKey('raw', encKey as BufferSource, 'AES-GCM', false, ['encrypt']);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const pt = new TextEncoder().encode(JSON.stringify(envelope));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce as BufferSource }, key, pt));
  return { nonce: b64url(nonce), ciphertext: b64url(ct) };
}

export async function decryptEnvelope(encKey: Uint8Array, nonceB64: string, ciphertextB64: string): Promise<Envelope> {
  const key = await crypto.subtle.importKey('raw', encKey as BufferSource, 'AES-GCM', false, ['decrypt']);
  const nonce = unb64url(nonceB64);
  const ct = unb64url(ciphertextB64);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce as BufferSource }, key, ct as BufferSource);
  const parsed = JSON.parse(new TextDecoder().decode(pt)) as Envelope;
  if (parsed.v !== 1 || !parsed.kind || typeof parsed.body !== 'string') {
    throw new Error('unrecognised envelope');
  }
  return parsed;
}

export interface ItemMeta {
  id: string;
  kind: ItemKind;
  size: number;
  createdAt: string;
  expiresAt: string;
}

/** Longest we are willing to wait on a Retry-After before giving up (ms). */
export const MAX_RETRY_AFTER_MS = 10_000;

/** Injectable for tests; the island never waits longer than MAX_RETRY_AFTER_MS. */
export const timers = {
  sleep: (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms)),
};

export class NotebookApiError extends Error {
  constructor(
    message: string,
    readonly status: number | undefined,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'NotebookApiError';
  }
}

function retryAfterSeconds(r: Response): number {
  const raw = r.headers.get('Retry-After');
  const n = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : 5;
}

/**
 * One fetch with two defensive behaviours the island relies on:
 * - a network-level failure (`TypeError: Failed to fetch`, which is also what
 *   the browser raises when an edge 429 arrives without CORS headers) becomes
 *   a sentence a person can act on instead of the bare TypeError text;
 * - a 429 is retried once after `Retry-After` (capped), then surfaced with the
 *   wait time so the UI can say "try again in N s".
 */
async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const url = `${API_BASE}${path}`;
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers });
  } catch {
    throw new NotebookApiError(
      'Could not reach the notes service. Check your connection, or wait a few seconds if you have been clicking quickly, then try again.',
      undefined,
    );
  }
  if (response.status !== 429) return response;
  const wait = retryAfterSeconds(response);
  if (wait * 1000 > MAX_RETRY_AFTER_MS) {
    throw new NotebookApiError(`The notes service is throttling this connection. Try again in ${wait} s.`, 429, wait);
  }
  await timers.sleep(wait * 1000);
  let retried: Response;
  try {
    retried = await fetch(url, { ...init, headers });
  } catch {
    throw new NotebookApiError('Could not reach the notes service after a retry. Wait a few seconds and try again.', undefined);
  }
  if (retried.status === 429) {
    const again = retryAfterSeconds(retried);
    throw new NotebookApiError(`The notes service is throttling this connection. Try again in ${again} s.`, 429, again);
  }
  return retried;
}

export async function putNotebook(keys: NotebookKeys, ttl = '24h'): Promise<void> {
  const r = await api(`/v1/notebooks/${keys.notebookId}?ttl=${encodeURIComponent(ttl)}`, {
    method: 'PUT',
    headers: { 'X-Auth': keys.authProof },
  });
  if (!r.ok) throw new Error(await errorMessage(r));
}

export async function listItems(keys: NotebookKeys): Promise<ItemMeta[]> {
  const r = await api(`/v1/notebooks/${keys.notebookId}/items`);
  if (!r.ok) throw new Error(await errorMessage(r));
  const body = (await r.json()) as { items: ItemMeta[] };
  return body.items ?? [];
}

export async function postItem(
  keys: NotebookKeys,
  kind: ItemKind,
  nonce: string,
  ciphertext: string,
  ttlSeconds: number,
): Promise<{ id: string; expiresAt: string }> {
  const r = await api(`/v1/notebooks/${keys.notebookId}/items`, {
    method: 'POST',
    headers: { 'X-Auth': keys.authProof },
    body: JSON.stringify({ kind, nonce, ciphertext, ttlSeconds }),
  });
  if (!r.ok) throw new Error(await errorMessage(r));
  return r.json() as Promise<{ id: string; expiresAt: string }>;
}

export async function getItem(id: string): Promise<{ nonce: string; ciphertext: string; kind: ItemKind }> {
  const r = await api(`/v1/items/${id}`);
  if (!r.ok) throw new Error(await errorMessage(r));
  return r.json() as Promise<{ nonce: string; ciphertext: string; kind: ItemKind }>;
}

export async function deleteItem(keys: NotebookKeys, id: string): Promise<void> {
  const r = await api(`/v1/items/${id}`, {
    method: 'DELETE',
    headers: { 'X-Auth': keys.authProof },
  });
  if (!r.ok && r.status !== 204) throw new Error(await errorMessage(r));
}

export async function extendNotebook(keys: NotebookKeys, ttlSeconds: number): Promise<void> {
  const r = await api(`/v1/notebooks/${keys.notebookId}/extend`, {
    method: 'POST',
    headers: { 'X-Auth': keys.authProof },
    body: JSON.stringify({ ttlSeconds }),
  });
  if (!r.ok) throw new Error(await errorMessage(r));
}

async function errorMessage(r: Response): Promise<string> {
  try {
    const j = (await r.json()) as { error?: string };
    if (j.error) return j.error;
  } catch {
    /* ignore */
  }
  return `request failed (${r.status})`;
}
