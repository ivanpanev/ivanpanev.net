import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { MergeView } from '@codemirror/merge';
import { DEFAULT_TTL, TTL_OPTIONS, decryptEnvelope, deriveEditorKeys, encryptEnvelope, getItem, listItems, passcodeMeetsPolicy, postItem, putNotebook, type TtlOption } from '@/lib/notebook';
import { LANGUAGES, detectLanguage, type EditorLanguage } from '@/lib/editor-detect';
import { EDITOR_FONTS, type EditorFontId } from '@/lib/editor-fonts';
import { loadWorkspace, saveWorkspace, type EditorTab, type EditorWorkspace } from '@/lib/editor-idb';

let seq = 1;
function newTab(pane: 0 | 1, name = `new ${seq++}`, text = ''): EditorTab {
  return { id: crypto.randomUUID(), name, language: detectLanguage(name, text), text, pane };
}

/** Mount CodeMirror in a shadow root so style-mod uses constructed stylesheets (no <style> vs CSP). */
function shadowMount(host: HTMLElement): HTMLElement {
  const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
  let wrap = root.querySelector<HTMLElement>('[data-cm]');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.dataset.cm = '1';
    wrap.style.height = '100%';
    wrap.style.minHeight = '24rem';
    root.appendChild(wrap);
  }
  wrap.replaceChildren();
  return wrap;
}

async function languageExt(lang: EditorLanguage) {
  switch (lang) {
    case 'javascript':
      return (await import('@codemirror/lang-javascript')).javascript();
    case 'typescript':
      return (await import('@codemirror/lang-javascript')).javascript({ typescript: true });
    case 'json':
      return (await import('@codemirror/lang-json')).json();
    case 'html':
      return (await import('@codemirror/lang-html')).html();
    case 'css':
      return (await import('@codemirror/lang-css')).css();
    case 'markdown':
      return (await import('@codemirror/lang-markdown')).markdown();
    case 'python':
      return (await import('@codemirror/lang-python')).python();
    case 'go':
      return (await import('@codemirror/lang-go')).go();
    case 'rust':
      return (await import('@codemirror/lang-rust')).rust();
    case 'java':
      return (await import('@codemirror/lang-java')).java();
    case 'cpp':
    case 'c':
      return (await import('@codemirror/lang-cpp')).cpp();
    case 'yaml':
      return (await import('@codemirror/lang-yaml')).yaml();
    case 'xml':
      return (await import('@codemirror/lang-xml')).xml();
    case 'sql':
      return (await import('@codemirror/lang-sql')).sql();
    case 'php':
      return (await import('@codemirror/lang-php')).php();
    default:
      return [];
  }
}

export default function Editor() {
  const [tabs, setTabs] = useState<EditorTab[]>([newTab(0, 'untitled.txt')]);
  const [active, setActive] = useState<Record<0 | 1, string | undefined>>({ 0: undefined, 1: undefined });
  const [compare, setCompare] = useState(false);
  const [font, setFont] = useState<EditorFontId>('jetbrains');
  const [status, setStatus] = useState('Ln 1, Col 1');
  const [pass, setPass] = useState('');
  const [ttl, setTtl] = useState<TtlOption>(DEFAULT_TTL);
  const [msg, setMsg] = useState<string>();
  const host0 = useRef<HTMLDivElement>(null);
  const host1 = useRef<HTMLDivElement>(null);
  const views = useRef<Partial<Record<0 | 1, EditorView>>>({});
  const merge = useRef<MergeView | null>(null);
  const ready = useRef(false);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  useEffect(() => {
    void loadWorkspace().then((ws) => {
      if (!ws?.tabs.length) {
        setActive({ 0: tabs[0]?.id, 1: undefined });
        ready.current = true;
        return;
      }
      setTabs(ws.tabs);
      const a0 = ws.tabs.find((t) => t.pane === 0)?.id;
      const a1 = ws.tabs.find((t) => t.pane === 1)?.id;
      setActive({ 0: a0, 1: a1 });
      setCompare(ws.compare);
      setFont((ws.font as EditorFontId) || 'jetbrains');
      ready.current = true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = useCallback((next: Partial<EditorWorkspace> = {}) => {
    if (!ready.current) return;
    const ws: EditorWorkspace = {
      tabs,
      active: active[0],
      compare,
      font,
      ...next,
    };
    void saveWorkspace(ws);
  }, [tabs, active, compare, font]);

  useEffect(() => {
    persist();
  }, [persist]);

  const fontCss = EDITOR_FONTS.find((f) => f.id === font)?.css ?? EDITOR_FONTS[0]!.css;
  const lang0 = tabs.find((t) => t.id === active[0])?.language;
  const lang1 = tabs.find((t) => t.id === active[1])?.language;

  const mount = useCallback(async (pane: 0 | 1) => {
    const host = pane === 0 ? host0.current : host1.current;
    if (!host) return;
    views.current[pane]?.destroy();
    merge.current?.destroy();
    merge.current = null;
    const tab = tabsRef.current.find((t) => t.id === active[pane]);
    if (!tab) {
      host.replaceChildren();
      return;
    }
    const lang = await languageExt(tab.language as EditorLanguage);
    const theme = EditorView.theme({
      '&': { height: '100%', fontFamily: fontCss, fontSize: '13px', background: 'var(--surface)', color: 'var(--fg)' },
      '.cm-gutters': { background: 'var(--surface-2)', color: 'var(--fg-subtle)', borderRight: '1px solid var(--line)' },
      '.cm-content': { fontFamily: fontCss },
    });
    const state = EditorState.create({
      doc: tab.text,
      extensions: [
        lineNumbers(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        lang,
        theme,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            const text = u.state.doc.toString();
            setTabs((prev) => prev.map((t) => (t.id === tab.id ? { ...t, text } : t)));
          }
          const head = u.state.selection.main.head;
          const line = u.state.doc.lineAt(head);
          setStatus(`Ln ${line.number}, Col ${head - line.from + 1}  ${tab.language}  ${tab.name}`);
        }),
        EditorView.contentAttributes.of({ 'aria-label': `${tab.name} editor` }),
      ],
    });
    views.current[pane] = new EditorView({ state, parent: shadowMount(host) });
  }, [active, fontCss]);

  useEffect(() => {
    if (compare) {
      const a = tabsRef.current.find((t) => t.id === active[0]);
      const b = tabsRef.current.find((t) => t.id === active[1]);
      const host = host0.current;
      if (!host || !a || !b) return;
      views.current[0]?.destroy();
      views.current[1]?.destroy();
      merge.current?.destroy();
      host.replaceChildren();
      merge.current = new MergeView({
        a: { doc: a.text },
        b: { doc: b.text },
        parent: shadowMount(host),
      });
      return () => merge.current?.destroy();
    }
    void mount(0);
    void mount(1);
    return () => {
      views.current[0]?.destroy();
      views.current[1]?.destroy();
    };
  }, [compare, mount, active, lang0, lang1]);

  function addTab(pane: 0 | 1) {
    const t = newTab(pane);
    setTabs((prev) => [...prev, t]);
    setActive((a) => ({ ...a, [pane]: t.id }));
  }

  function openFiles(files: FileList | null, pane: 0 | 1) {
    if (!files) return;
    void Promise.all(Array.from(files).map(async (f) => ({ name: f.name, text: await f.text() }))).then((opened) => {
      const created = opened.map((o) => newTab(pane, o.name, o.text));
      setTabs((prev) => [...prev, ...created]);
      if (created[0]) setActive((a) => ({ ...a, [pane]: created[0]!.id }));
    });
  }

  async function cloudSave() {
    const policy = passcodeMeetsPolicy(pass);
    if (!policy.ok) {
      setMsg(policy.reason);
      return;
    }
    try {
      const keys = await deriveEditorKeys(pass);
      await putNotebook(keys, ttl.query);
      const env = { v: 1 as const, kind: 'workspace' as const, body: JSON.stringify({ tabs, compare, font }) };
      const { nonce, ciphertext } = await encryptEnvelope(keys.encKey, env);
      await postItem(keys, 'workspace', nonce, ciphertext, ttl.seconds);
      setMsg('Saved to the notes service. Same passphrase opens it on another machine.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not save');
    }
  }

  async function cloudOpen() {
    const policy = passcodeMeetsPolicy(pass);
    if (!policy.ok) {
      setMsg(policy.reason);
      return;
    }
    try {
      const keys = await deriveEditorKeys(pass);
      await putNotebook(keys, ttl.query);
      const items = await listItems(keys);
      const last = items.filter((i) => i.kind === 'workspace').at(-1);
      if (!last) {
        setMsg('No workspace stored for that passphrase.');
        return;
      }
      const raw = await getItem(last.id);
      const env = await decryptEnvelope(keys.encKey, raw.nonce, raw.ciphertext);
      const ws = JSON.parse(env.body) as EditorWorkspace;
      setTabs(ws.tabs);
      setCompare(!!ws.compare);
      setActive({ 0: ws.tabs.find((t) => t.pane === 0)?.id, 1: ws.tabs.find((t) => t.pane === 1)?.id });
      setMsg('Workspace restored.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not open');
    }
  }

  const paneTabs = (p: 0 | 1) => tabs.filter((t) => t.pane === p);

  return (
    <div className="npp" data-editor>
      <div className="npp-menu">
        <label className="npp-item">
          File
          <input type="file" multiple className="sr-only" onChange={(e) => openFiles(e.target.files, 0)} />
        </label>
        <button type="button" className="npp-item" onClick={() => addTab(0)}>
          New
        </button>
        <button type="button" className="npp-item" onClick={() => setCompare((c) => !c)}>
          {compare ? 'Edit' : 'Compare'}
        </button>
        <label className="npp-item">
          Language
          <select
            className="ml-1 bg-transparent"
            value={tabs.find((t) => t.id === active[0])?.language ?? 'text'}
            onChange={(e) => {
              const lang = e.target.value;
              setTabs((prev) => prev.map((t) => (t.id === active[0] ? { ...t, language: lang } : t)));
            }}
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="npp-item">
          Font
          <select className="ml-1 bg-transparent" value={font} onChange={(e) => setFont(e.target.value as EditorFontId)}>
            {EDITOR_FONTS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className={`npp-body ${compare ? '' : 'npp-split'}`}>
        <div>
          <TabStrip
            tabs={paneTabs(0)}
            active={active[0]}
            onSelect={(id) => setActive((a) => ({ ...a, 0: id }))}
            onClose={(id) => {
              setTabs((prev) => prev.filter((t) => t.id !== id));
              if (active[0] === id) setActive((a) => ({ ...a, 0: paneTabs(0).find((t) => t.id !== id)?.id }));
            }}
            onMove={(id) => setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, pane: 1 } : t)))}
          />
          <div ref={host0} className="npp-host" />
        </div>
        {!compare && (
          <div>
            <TabStrip
              tabs={paneTabs(1)}
              active={active[1]}
              onSelect={(id) => setActive((a) => ({ ...a, 1: id }))}
              onClose={(id) => {
                setTabs((prev) => prev.filter((t) => t.id !== id));
                if (active[1] === id) setActive((a) => ({ ...a, 1: paneTabs(1).find((t) => t.id !== id)?.id }));
              }}
              onMove={(id) => setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, pane: 0 } : t)))}
              extra={<button type="button" className="npp-tab" onClick={() => addTab(1)}>+ pane</button>}
            />
            <div ref={host1} className="npp-host" />
          </div>
        )}
      </div>
      <div className="npp-status">{status}</div>
      <form
        className="npp-cloud"
        onSubmit={(e) => {
          e.preventDefault();
          void cloudSave();
        }}
      >
        <p className="text-xs text-fg-muted">Save to another machine (same service as Notes, separate keys).</p>
        <input className="field font-mono text-sm" type="password" placeholder="Passphrase" value={pass} onChange={(e) => setPass(e.target.value)} aria-label="Editor passphrase" />
        <select className="field text-sm" value={ttl.query} onChange={(e) => setTtl(TTL_OPTIONS.find((t) => t.query === e.target.value) ?? DEFAULT_TTL)} aria-label="Lifetime">
          {TTL_OPTIONS.map((t) => (
            <option key={t.query} value={t.query}>
              {t.label}
            </option>
          ))}
        </select>
        <button type="submit" className="btn">
          Save to cloud
        </button>
        <button type="button" className="btn" onClick={() => void cloudOpen()}>
          Open from cloud
        </button>
        {msg ? <p className="text-sm">{msg}</p> : null}
      </form>
    </div>
  );
}

function TabStrip({
  tabs,
  active,
  onSelect,
  onClose,
  onMove,
  extra,
}: {
  tabs: EditorTab[];
  active: string | undefined;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onMove: (id: string) => void;
  extra?: ReactNode;
}) {
  return (
    <div className="npp-tabs" aria-label="Open files">
      {tabs.map((t) => (
        <div key={t.id} className={`npp-tab ${t.id === active ? 'is-active' : ''}`}>
          <button
            type="button"
            aria-pressed={t.id === active}
            onClick={() => onSelect(t.id)}
            onDoubleClick={() => onMove(t.id)}
            title="Double-click to move to the other pane"
          >
            {t.name}
          </button>
          <button
            type="button"
            className="npp-close"
            aria-label={`Close ${t.name}`}
            onClick={() => onClose(t.id)}
          >
            ×
          </button>
        </div>
      ))}
      {extra}
    </div>
  );
}
