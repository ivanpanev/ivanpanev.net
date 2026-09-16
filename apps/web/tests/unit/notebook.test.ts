import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ARGON2,
  MAX_RETRY_AFTER_MS,
  NOTEBOOK_SALT_INFO,
  NotebookApiError,
  b64url,
  decryptEnvelope,
  deleteItem,
  deriveKeys,
  encryptEnvelope,
  extendNotebook,
  getItem,
  listItems,
  passcodeMeetsPolicy,
  postItem,
  putNotebook,
  sha256,
  timers,
  unb64url,
  type Argon2idFn,
} from '@/lib/notebook';

/** Deterministic stand-in for Argon2id: SHA-256(password || salt || i) concatenated to 96 bytes. */
const fakeKdf: Argon2idFn = async ({ password, salt, hashLength }) => {
  const out = new Uint8Array(hashLength);
  const enc = new TextEncoder();
  let offset = 0;
  let i = 0;
  while (offset < hashLength) {
    const block = new Uint8Array(enc.encode(password).length + salt.length + 1);
    block.set(enc.encode(password), 0);
    block.set(salt, enc.encode(password).length);
    block[block.length - 1] = i;
    const h = await sha256(block);
    out.set(h.subarray(0, Math.min(32, hashLength - offset)), offset);
    offset += 32;
    i++;
  }
  return out;
};

describe('passcodeMeetsPolicy', () => {
  it('accepts 12+ characters', () => {
    expect(passcodeMeetsPolicy('twelve chars!').ok).toBe(true);
  });
  it('accepts three dictionary words shorter than 12 chars', () => {
    expect(passcodeMeetsPolicy('cat dog elm').ok).toBe(true);
    expect(passcodeMeetsPolicy('cat-dog-elm').ok).toBe(true);
  });
  it('rejects short strings', () => {
    const r = passcodeMeetsPolicy('short');
    expect(r.ok).toBe(false);
  });
});

describe('deriveKeys', () => {
  it('splits 96 bytes and hashes lookup/auth (ADR-0009 vectors with fake KDF)', async () => {
    const a = await deriveKeys('twelve chars!', fakeKdf);
    const b = await deriveKeys('twelve chars!', fakeKdf);
    expect(a.notebookId).toBe(b.notebookId);
    expect(a.authProof).toBe(b.authProof);
    expect(a.lookupKey.byteLength).toBe(32);
    expect(a.authKey.byteLength).toBe(32);
    expect(a.encKey.byteLength).toBe(32);
    expect(unb64url(a.notebookId).byteLength).toBe(32);
    expect(unb64url(a.authProof).byteLength).toBe(32);
    expect(a.notebookId).toBe(b64url(await sha256(a.lookupKey)));
    expect(a.authProof).toBe(b64url(await sha256(a.authKey)));
  });

  it('different passcodes produce different ids', async () => {
    const a = await deriveKeys('twelve chars!', fakeKdf);
    const b = await deriveKeys('twelve chars?', fakeKdf);
    expect(a.notebookId).not.toBe(b.notebookId);
    expect(a.authProof).not.toBe(b.authProof);
  });
});

describe('AES-256-GCM envelope', () => {
  it('round-trips and fails on a flipped bit', async () => {
    const keys = await deriveKeys('twelve chars!', fakeKdf);
    const env = { v: 1 as const, kind: 'text' as const, title: 't', body: 'hello' };
    const { nonce, ciphertext } = await encryptEnvelope(keys.encKey, env);
    expect(unb64url(nonce).byteLength).toBe(12);
    const back = await decryptEnvelope(keys.encKey, nonce, ciphertext);
    expect(back).toEqual(env);

    const raw = unb64url(ciphertext);
    raw[0] = (raw[0] ?? 0) ^ 1;
    await expect(decryptEnvelope(keys.encKey, nonce, b64url(raw))).rejects.toThrow();
  });
});

const VECTOR = {
  passcode: 'vector-pass-12',
  notebookId: 'x_EVvABulmcPJTikMZdw1Tghv8polB0miTx78M8dHTI',
  authProof: '_CScnpTPzwrBCk5DxB4HbWcZV8c2NZTgbrUZwwJW_0Q',
} as const;

describe('ADR-0009 parameters', () => {
  it('documents Argon2id settings and the application salt', () => {
    expect(NOTEBOOK_SALT_INFO).toBe('ivanpanev.net/notebook/v1');
    expect(ARGON2).toEqual({ iterations: 3, memorySize: 65536, parallelism: 1, hashLength: 96 });
  });
});

describe('Argon2id known-answer (ADR-0009)', () => {
  it('derives the pinned 96-byte vector', async () => {
    const keys = await deriveKeys(VECTOR.passcode);
    expect(keys.lookupKey.byteLength).toBe(32);
    expect(keys.notebookId).toBe(VECTOR.notebookId);
    expect(keys.authProof).toBe(VECTOR.authProof);
  }, 20_000);
});

describe('API client', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('puts, lists, posts, gets, extends and deletes', async () => {
    const keys = await deriveKeys('twelve chars!', fakeKdf);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: keys.notebookId, expiresIn: 86400 }), { status: 200 }));
    await putNotebook(keys, '24h');
    expect(String(fetchMock.mock.calls[0]![0])).toContain(`/v1/notebooks/${keys.notebookId}`);
    const putHeaders = new Headers((fetchMock.mock.calls[0]![1] as RequestInit).headers);
    expect(putHeaders.get('X-Auth')).toBe(keys.authProof);

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    await expect(listItems(keys)).resolves.toEqual([]);

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: '11111111-1111-1111-1111-111111111111', expiresAt: '2099-01-01T00:00:00Z' }), {
        status: 201,
      }),
    );
    await postItem(keys, 'text', 'n', 'c', 3600);

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ nonce: 'n', ciphertext: 'c', kind: 'text' }), { status: 200 }),
    );
    await expect(getItem('11111111-1111-1111-1111-111111111111')).resolves.toMatchObject({ kind: 'text' });

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await deleteItem(keys, '11111111-1111-1111-1111-111111111111');

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ expiresIn: 3600 }), { status: 200 }));
    await extendNotebook(keys, 3600);
  });

  it('surfaces JSON error messages', async () => {
    const keys = await deriveKeys('twelve chars!', fakeKdf);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }));
    await expect(putNotebook(keys)).rejects.toThrow('unauthorized');
  });

  describe('throttling and network failures (M7-R1-F01)', () => {
    const slept: number[] = [];
    const realSleep = timers.sleep;
    beforeEach(() => {
      slept.length = 0;
      timers.sleep = async (ms) => {
        slept.push(ms);
      };
    });
    afterEach(() => {
      timers.sleep = realSleep;
    });

    it('retries once after Retry-After on a 429 and then succeeds', async () => {
      fetchMock
        .mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'Retry-After': '2' } }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ nonce: 'n', ciphertext: 'c', kind: 'text' }), { status: 200 }));
      await expect(getItem('11111111-1111-1111-1111-111111111111')).resolves.toMatchObject({ kind: 'text' });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(slept).toEqual([2000]);
    });

    it('gives up with the wait time when the retry is throttled too', async () => {
      fetchMock
        .mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'Retry-After': '1' } }))
        .mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'Retry-After': '7' } }));
      const err = await getItem('x').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(NotebookApiError);
      expect((err as NotebookApiError).status).toBe(429);
      expect((err as NotebookApiError).retryAfterSeconds).toBe(7);
      expect((err as Error).message).toContain('Try again in 7 s');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('does not sleep past MAX_RETRY_AFTER_MS; it reports instead', async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'Retry-After': '60' } }));
      await expect(getItem('x')).rejects.toThrow('Try again in 60 s');
      expect(slept).toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(60_000).toBeGreaterThan(MAX_RETRY_AFTER_MS);
    });

    it('defaults to a short wait when Retry-After is missing or garbage', async () => {
      fetchMock
        .mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'Retry-After': 'soon' } }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }));
      const keys = await deriveKeys('twelve chars!', fakeKdf);
      await expect(listItems(keys)).resolves.toEqual([]);
      expect(slept).toEqual([5000]);
    });

    it('turns "Failed to fetch" into an actionable sentence', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      const err = await getItem('x').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(NotebookApiError);
      expect((err as Error).message).not.toBe('Failed to fetch');
      expect((err as Error).message).toMatch(/notes service/);
      expect((err as NotebookApiError).status).toBeUndefined();
    });
  });
});

