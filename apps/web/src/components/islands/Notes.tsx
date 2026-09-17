import { useCallback, useRef, useState } from 'react';
import { generatePassphrase } from '@/lib/secrets';
import {
  DEFAULT_TTL,
  TTL_OPTIONS,
  codeMeetsPolicy,
  decryptEnvelope,
  deleteItem,
  deriveKeys,
  derivePinKeys,
  encryptEnvelope,
  extendNotebook,
  generateNotebookCode,
  getItem,
  listItems,
  passcodeMeetsPolicy,
  pinMeetsPolicy,
  postItem,
  putNotebook,
  type Envelope,
  type ItemKind,
  type ItemMeta,
  type NotebookKeys,
} from '@/lib/notebook';
import CopyButton from './CopyButton';

const LANGUAGES = ['text', 'go', 'typescript', 'python', 'bash', 'yaml', 'json', 'markdown'] as const;

type Opened = { keys: NotebookKeys; items: ItemMeta[] };

type UnlockMode = 'passphrase' | 'pin';

export default function Notes() {
  const [mode, setMode] = useState<UnlockMode>('passphrase');
  const [passcode, setPasscode] = useState('');
  const [code, setCode] = useState(() => generateNotebookCode());
  const [pin, setPin] = useState('');
  const [ttl, setTtl] = useState<(typeof TTL_OPTIONS)[number]>(DEFAULT_TTL);
  const [busy, setBusy] = useState<'idle' | 'derive' | 'net'>('idle');
  const [error, setError] = useState<string>();
  const [opened, setOpened] = useState<Opened>();
  const [kind, setKind] = useState<ItemKind>('text');
  const [language, setLanguage] = useState<(typeof LANGUAGES)[number]>('text');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [view, setView] = useState<{ meta: ItemMeta; env: Envelope }>();
  const fileRef = useRef<HTMLInputElement>(null);

  const unlock = useCallback(async () => {
    if (mode === 'passphrase') {
      const policy = passcodeMeetsPolicy(passcode);
      if (!policy.ok) {
        setError(policy.reason);
        return;
      }
    } else {
      const c = codeMeetsPolicy(code);
      const p = pinMeetsPolicy(pin);
      if (!c.ok) {
        setError(c.reason);
        return;
      }
      if (!p.ok) {
        setError(p.reason);
        return;
      }
    }
    setBusy('derive');
    setError(undefined);
    try {
      const keys = mode === 'passphrase' ? await deriveKeys(passcode) : await derivePinKeys(code, pin);
      setBusy('net');
      await putNotebook(keys, ttl.query);
      const items = await listItems(keys);
      setOpened({ keys, items });
      setView(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open notebook');
    } finally {
      setBusy('idle');
    }
  }, [mode, passcode, code, pin, ttl]);

  async function refresh(keys: NotebookKeys) {
    const items = await listItems(keys);
    setOpened({ keys, items });
  }

  async function addText() {
    if (!opened) return;
    if (!body.trim()) {
      setError('Nothing to store.');
      return;
    }
    setBusy('net');
    setError(undefined);
    try {
      const env: Envelope = { v: 1, kind, body };
      const t = title.trim();
      if (t) env.title = t;
      if (kind === 'code') env.language = language;
      const { nonce, ciphertext } = await encryptEnvelope(opened.keys.encKey, env);
      await postItem(opened.keys, kind, nonce, ciphertext, ttl.seconds);
      setBody('');
      setTitle('');
      await refresh(opened.keys);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not store item');
    } finally {
      setBusy('idle');
    }
  }

  async function addImage(file: File) {
    if (!opened) return;
    if (file.size > 20 * 1024 * 1024) {
      setError('Images must be under 20 MiB.');
      return;
    }
    setBusy('net');
    setError(undefined);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = '';
      for (const b of buf) bin += String.fromCharCode(b);
      const env: Envelope = {
        v: 1,
        kind: 'image',
        filename: file.name,
        mime: file.type || 'application/octet-stream',
        body: btoa(bin),
      };
      const { nonce, ciphertext } = await encryptEnvelope(opened.keys.encKey, env);
      await postItem(opened.keys, 'image', nonce, ciphertext, ttl.seconds);
      await refresh(opened.keys);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not store image');
    } finally {
      setBusy('idle');
    }
  }

  async function openItem(meta: ItemMeta) {
    if (!opened) return;
    setBusy('net');
    setError(undefined);
    try {
      const raw = await getItem(meta.id);
      const env = await decryptEnvelope(opened.keys.encKey, raw.nonce, raw.ciphertext);
      setView({ meta, env });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not decrypt item');
    } finally {
      setBusy('idle');
    }
  }

  async function remove(id: string) {
    if (!opened) return;
    setBusy('net');
    setError(undefined);
    try {
      await deleteItem(opened.keys, id);
      if (view?.meta.id === id) setView(undefined);
      await refresh(opened.keys);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete');
    } finally {
      setBusy('idle');
    }
  }

  async function extend() {
    if (!opened) return;
    setBusy('net');
    setError(undefined);
    try {
      await extendNotebook(opened.keys, ttl.seconds);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not extend');
    } finally {
      setBusy('idle');
    }
  }

  function generate() {
    const g = generatePassphrase({ words: 6, separator: '-' });
    setPasscode(g.value);
    setError(undefined);
  }

  const locked = !opened;
  const deriving = busy === 'derive';

  return (
    <div className="space-y-6">
      <p className="max-w-prose text-sm text-fg-muted">
        Everything is encrypted in this browser before it is sent. The server stores ciphertext it cannot
        read. There is no account and no recovery: a lost passcode is lost data. Two people who pick the same
        passcode share a notebook.
      </p>

      <form
        className="card space-y-4 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void unlock();
        }}
      >
        <div role="tablist" aria-label="Unlock mode" className="inline-flex border border-line p-0.5">
          {(
            [
              ['passphrase', 'Passphrase'],
              ['pin', 'Quick PIN'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              className={`rounded-sm px-3 py-1 text-sm ${mode === id ? 'bg-accent-fill text-accent-fg' : 'text-fg-muted hover:text-fg'}`}
              onClick={() => setMode(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {mode === 'passphrase' ? (
          <div>
            <label htmlFor="passcode" className="text-sm font-medium">
              Passcode
            </label>
            <input
              id="passcode"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              className="field mt-1 font-mono text-sm"
            />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="notebook-code" className="text-sm font-medium">
                Notebook code
              </label>
              <input
                id="notebook-code"
                autoComplete="off"
                spellCheck={false}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="field mt-1 font-mono text-sm"
              />
              <p className="mt-1 text-xs text-fg-muted">Share this with the PIN. Generated for you; you can type your own.</p>
            </div>
            <div>
              <label htmlFor="pin" className="text-sm font-medium">
                PIN
              </label>
              <input
                id="pin"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="field mt-1 font-mono text-sm"
              />
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="ttl" className="text-sm font-medium">
              Lifetime
            </label>
            <select
              id="ttl"
              className="mt-1 block rounded-md border border-line bg-canvas px-3 py-2 text-sm"
              value={ttl.query}
              onChange={(e) => setTtl(TTL_OPTIONS.find((t) => t.query === e.target.value) ?? TTL_OPTIONS[2])}
            >
              {TTL_OPTIONS.map((t) => (
                <option key={t.query} value={t.query}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy !== 'idle'}>
            {deriving ? 'Deriving keys…' : locked ? 'Open notebook' : 'Re-open'}
          </button>
          {mode === 'passphrase' ? (
            <button type="button" className="btn" onClick={generate}>
              Generate passphrase
            </button>
          ) : (
            <button type="button" className="btn" onClick={() => setCode(generateNotebookCode())}>
              New code
            </button>
          )}
        </div>
        {deriving ? (
          <p role="status" className="text-sm text-fg-muted">
            Stretching the passcode with Argon2id (about a second on a laptop). The passcode never leaves this
            device.
          </p>
        ) : null}
      </form>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      {opened ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-4" aria-labelledby="add-heading">
            <h2 id="add-heading" className="text-lg font-semibold">
              Add an item
            </h2>
            <div role="tablist" aria-label="Item kind" className="inline-flex rounded-md border border-line p-0.5">
              {(['text', 'code', 'image'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={kind === k}
                  className={`rounded px-3 py-1 text-sm capitalize ${kind === k ? 'bg-accent-fill text-accent-fg' : 'text-fg-muted hover:text-fg'}`}
                  onClick={() => setKind(k)}
                >
                  {k}
                </button>
              ))}
            </div>
            {kind !== 'image' ? (
              <>
                <input
                  aria-label="Title"
                  placeholder="Title (optional, encrypted)"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm"
                />
                {kind === 'code' ? (
                  <label className="block text-sm">
                    Language
                    <select
                      className="mt-1 block rounded-md border border-line bg-canvas px-3 py-2"
                      value={language}
                      onChange={(e) => setLanguage(e.target.value as (typeof LANGUAGES)[number])}
                    >
                      {LANGUAGES.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <textarea
                  aria-label={kind === 'code' ? 'Code' : 'Text'}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={10}
                  className="w-full rounded-md border border-line bg-canvas px-3 py-2 font-mono text-sm"
                />
                {kind === 'code' && body ? (
                  <pre className="overflow-x-auto rounded-md border border-line bg-surface p-3 text-sm" aria-label="Preview">
                    <code>{body}</code>
                  </pre>
                ) : null}
                <button type="button" className="btn btn-primary" disabled={busy !== 'idle'} onClick={() => void addText()}>
                  Encrypt and store
                </button>
              </>
            ) : (
              <div
                className="rounded-md border border-dashed border-line p-6 text-sm text-fg-muted"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f) void addImage(f);
                }}
              >
                <p>Drop an image here, or choose a file.</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  aria-label="Image file"
                  className="mt-3"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void addImage(f);
                    e.target.value = '';
                  }}
                />
              </div>
            )}
            <button type="button" className="btn" disabled={busy !== 'idle'} onClick={() => void extend()}>
              Extend lifetime
            </button>
          </section>

          <section className="space-y-4" aria-labelledby="list-heading">
            <h2 id="list-heading" className="text-lg font-semibold">
              Items ({opened.items.length})
            </h2>
            {opened.items.length === 0 ? (
              <p className="text-sm text-fg-muted">Nothing stored yet, or this passcode has not been used.</p>
            ) : (
              <ul className="space-y-2">
                {opened.items.map((it) => (
                  <li key={it.id} className="card flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                    <button type="button" className="text-left hover:underline" onClick={() => void openItem(it)}>
                      {it.kind} · {it.size} bytes
                    </button>
                    <button type="button" className="btn" onClick={() => void remove(it.id)}>
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {view ? (
              <article className="card space-y-3 p-4">
                <h3 className="font-semibold">{view.env.title ?? view.meta.kind}</h3>
                {view.env.kind === 'image' ? (
                  <img
                    alt={view.env.filename ?? 'Stored image'}
                    src={`data:${view.env.mime ?? 'image/png'};base64,${view.env.body}`}
                    className="max-h-96 max-w-full rounded"
                  />
                ) : (
                  <pre className="overflow-x-auto text-sm">
                    <code>{view.env.body}</code>
                  </pre>
                )}
                {view.env.kind !== 'image' ? <CopyButton text={view.env.body} label="Copy plaintext" /> : null}
                {view.env.kind === 'image' && view.env.filename ? (
                  <a
                    className="btn inline-block"
                    href={`data:${view.env.mime};base64,${view.env.body}`}
                    download={view.env.filename}
                  >
                    Download
                  </a>
                ) : null}
              </article>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
