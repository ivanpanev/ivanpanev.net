import { useEffect, useState, type DragEvent } from 'react';
import type { PublicKey } from 'openpgp';
import { formatFingerprint, readPublicKey, verifyCleartext, verifyDetached, type VerifyResult } from '@/lib/pgp';

interface Props {
  siteKeyUrl?: string | undefined;
  siteKeyFingerprint?: string | undefined;
}

type Mode = 'post' | 'detached' | 'cleartext';

export default function Verifier({ siteKeyUrl, siteKeyFingerprint }: Props) {
  const [siteKey, setSiteKey] = useState<PublicKey>();
  const [extraKeyText, setExtraKeyText] = useState('');
  const [extraKey, setExtraKey] = useState<PublicKey>();
  const [extraKeyError, setExtraKeyError] = useState<string>();
  const [mode, setMode] = useState<Mode>('detached');
  const [postId, setPostId] = useState('');
  const [message, setMessage] = useState('');
  const [messageBytes, setMessageBytes] = useState<Uint8Array>();
  const [fileName, setFileName] = useState<string>();
  const [signature, setSignature] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<VerifyResult & { text?: string }>();
  const [loadError, setLoadError] = useState<string>();

  // Rendered on the server first; the URL is only available after hydration.
  useEffect(() => {
    const p = new URLSearchParams(location.search).get('post');
    if (p) {
      setPostId(p);
      setMode('post');
    }
  }, []);

  useEffect(() => {
    if (!siteKeyUrl) return;
    fetch(siteKeyUrl)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(readPublicKey)
      .then(setSiteKey)
      .catch((e) => setLoadError(`Could not load the site key: ${e.message}`));
  }, [siteKeyUrl]);

  useEffect(() => {
    if (!extraKeyText.trim()) {
      setExtraKey(undefined);
      setExtraKeyError(undefined);
      return;
    }
    readPublicKey(extraKeyText)
      .then((k) => {
        if (k.isPrivate()) throw new Error('That is a private key. Do not paste private keys anywhere.');
        setExtraKey(k);
        setExtraKeyError(undefined);
      })
      .catch((e) => {
        setExtraKey(undefined);
        setExtraKeyError(e.message);
      });
  }, [extraKeyText]);

  const keys = [siteKey, extraKey].filter(Boolean) as PublicKey[];

  async function run() {
    setBusy(true);
    setResult(undefined);
    try {
      if (!keys.length) {
        setResult({ valid: false, bySiteKey: false, error: 'No public key available to verify against.' });
        return;
      }
      if (mode === 'post') {
        const id = postId.trim().replace(/^\/?blog\//, '');
        const [raw, sig] = await Promise.all([fetch(`/raw/${id}.md`), fetch(`/signatures/${id}.md.asc`)]);
        if (!raw.ok) throw new Error(`No raw post at /raw/${id}.md (HTTP ${raw.status})`);
        if (!sig.ok) throw new Error(`No signature at /signatures/${id}.md.asc (HTTP ${sig.status}); this post may not be signed`);
        const bytes = new Uint8Array(await raw.arrayBuffer());
        setResult(await verifyDetached(bytes, await sig.text(), keys, siteKeyFingerprint));
      } else if (mode === 'detached') {
        const bytes = messageBytes ?? new TextEncoder().encode(message);
        setResult(await verifyDetached(bytes, signature, keys, siteKeyFingerprint));
      } else {
        setResult(await verifyCleartext(message, keys, siteKeyFingerprint));
      }
    } catch (e) {
      setResult({ valid: false, bySiteKey: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function onFile(f: File | undefined) {
    if (!f) {
      setMessageBytes(undefined);
      setFileName(undefined);
      return;
    }
    setMessageBytes(new Uint8Array(await f.arrayBuffer()));
    setFileName(`${f.name} (${f.size.toLocaleString('en-US')} bytes)`);
  }

  /** Drop a file and/or its .asc/.sig onto the detached panel; each lands in the right slot. */
  async function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    for (const f of Array.from(e.dataTransfer.files)) {
      if (/\.(asc|sig|gpg|pgp)$/i.test(f.name) || f.size < 8192) {
        const text = await f.text();
        if (/-----BEGIN PGP SIGNATURE-----/.test(text)) {
          setSignature(text);
          continue;
        }
      }
      await onFile(f);
    }
  }
  const [dragging, setDragging] = useState(false);

  return (
    <div className="space-y-5">
      <div className="card p-4 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">Verifying against</p>
        {siteKeyUrl ? (
          siteKey ? (
            <p className="mt-1 font-mono text-xs">Site key {formatFingerprint(siteKey.getFingerprint())}</p>
          ) : (
            <p className="mt-1 text-fg-muted">{loadError ?? 'Loading site key…'}</p>
          )
        ) : (
          <p className="mt-1 text-fg-muted">The site key is not published yet; paste a public key below to verify against it.</p>
        )}
        <details className="mt-2">
          <summary className="cursor-pointer text-fg-muted">Also trust another public key (paste armoured key)</summary>
          <textarea
            className="field mt-2 min-h-24 font-mono text-xs"
            value={extraKeyText}
            onChange={(e) => setExtraKeyText(e.target.value)}
            placeholder="-----BEGIN PGP PUBLIC KEY BLOCK-----"
            spellCheck={false}
            aria-label="Additional public key"
          />
          {extraKeyError && (
            <p role="alert" className="mt-1 text-danger">
              {extraKeyError}
            </p>
          )}
          {extraKey && <p className="mt-1 font-mono text-xs">Loaded {formatFingerprint(extraKey.getFingerprint())}</p>}
        </details>
      </div>

      <div role="tablist" aria-label="What to verify" className="inline-flex flex-wrap rounded-md border border-line p-0.5">
        {(
          [
            ['post', 'A post on this site'],
            ['detached', 'Detached signature'],
            ['cleartext', 'Clear-signed message'],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            role="tab"
            type="button"
            aria-selected={mode === m}
            className={`rounded px-3 py-1 text-sm ${mode === m ? 'bg-accent text-accent-fg' : 'text-fg-muted hover:text-fg'}`}
            onClick={() => {
              setMode(m);
              setResult(undefined);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'post' && (
        <div>
          <label htmlFor="v-post" className="label">
            Post id (the last part of the URL)
          </label>
          <input id="v-post" className="field font-mono" value={postId} onChange={(e) => setPostId(e.target.value)} placeholder="hello-world" spellCheck={false} />
        </div>
      )}

      {mode === 'detached' && (
        <div
          className={`grid gap-4 rounded-md sm:grid-cols-2 ${dragging ? 'outline-2 outline-dashed outline-accent outline-offset-4' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          aria-label="Drop the signed file and its signature here"
        >
          <div>
            <label htmlFor="v-msg" className="label">
              Signed content (paste text or choose a file)
            </label>
            <textarea
              id="v-msg"
              className="field min-h-40 font-mono text-xs"
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                setMessageBytes(undefined);
                setFileName(undefined);
              }}
              disabled={!!messageBytes}
              spellCheck={false}
            />
            <input type="file" className="mt-2 text-xs" aria-label="Signed file" onChange={(e) => onFile(e.target.files?.[0])} />
            {fileName ? (
              <p className="mt-1 text-xs text-fg-muted">Using file {fileName}. Bytes are verified exactly as uploaded.</p>
            ) : (
              <p className="mt-1 text-xs text-fg-muted">You can also drop the file and its .asc here together.</p>
            )}
          </div>
          <div>
            <label htmlFor="v-sig" className="label">
              Detached signature (.asc / .sig, armoured)
            </label>
            <textarea
              id="v-sig"
              className="field min-h-40 font-mono text-xs"
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder="-----BEGIN PGP SIGNATURE-----"
              spellCheck={false}
            />
          </div>
        </div>
      )}

      {mode === 'cleartext' && (
        <div>
          <label htmlFor="v-clear" className="label">
            Clear-signed message
          </label>
          <textarea
            id="v-clear"
            className="field min-h-48 font-mono text-xs"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="-----BEGIN PGP SIGNED MESSAGE-----"
            spellCheck={false}
          />
        </div>
      )}

      <button type="button" className="btn btn-primary" onClick={run} disabled={busy || (!!siteKeyUrl && !siteKey && !extraKey)}>
        {busy ? 'Verifying…' : 'Verify'}
      </button>

      {result && <ResultCard r={result} />}
    </div>
  );
}

function ResultCard({ r }: { r: VerifyResult & { text?: string } }) {
  const tone = r.valid ? (r.bySiteKey ? 'ok' : 'warn') : 'danger';
  // Full class names so Tailwind's scanner sees them.
  const TONE = {
    ok: { border: 'border-l-ok', text: 'text-ok' },
    warn: { border: 'border-l-warn', text: 'text-warn' },
    danger: { border: 'border-l-danger', text: 'text-danger' },
  } as const;
  const headline = r.valid
    ? r.bySiteKey
      ? 'Good signature from the site key'
      : 'Good signature, but not from the site key'
    : 'Signature did not verify';
  return (
    <section role="status" aria-live="polite" className={`card border-l-4 p-4 text-sm ${TONE[tone].border}`} data-verify-result={tone}>
      <p className={`font-semibold ${TONE[tone].text}`}>{headline}</p>
      <dl className="kv mt-2">
        {r.signerFingerprint && (
          <>
            <dt>Signer</dt>
            <dd>{formatFingerprint(r.signerFingerprint)}</dd>
          </>
        )}
        {!r.signerFingerprint && r.signerKeyId && (
          <>
            <dt>Signer key ID</dt>
            <dd>{r.signerKeyId} (not among the trusted keys)</dd>
          </>
        )}
        {r.signedAt && (
          <>
            <dt>Signed at</dt>
            <dd>{r.signedAt.toISOString().replace('T', ' ').slice(0, 19)} UTC</dd>
          </>
        )}
        {r.error && (
          <>
            <dt>Detail</dt>
            <dd className="!font-sans">{r.error}</dd>
          </>
        )}
      </dl>
      {r.text !== undefined && r.valid && (
        <details className="mt-3">
          <summary className="cursor-pointer text-fg-muted">Signed text</summary>
          <pre className="mt-2 overflow-x-auto rounded border border-line bg-surface-2 p-3 font-mono text-xs whitespace-pre-wrap">{r.text}</pre>
        </details>
      )}
    </section>
  );
}
