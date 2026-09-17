import { useEffect, useMemo, useState } from 'react';
import { describe, formatBig, split, supernet, SubnetError, type SubnetInfo } from '@/lib/subnet';
import CopyButton from './CopyButton';

const EXAMPLES = ['10.20.30.77/27', '192.168.1.0 255.255.255.0', '2001:db8:abcd:1234::1/64', '100.64.0.1/10'];

export default function SubnetCalculator() {
  const [input, setInput] = useState(EXAMPLES[0]!);
  const [splitLen, setSplitLen] = useState<string>('');
  const [hydrated, setHydrated] = useState(false);

  // Prerendered on the server; read the shareable #fragment only after hydration,
  // and follow it on back/forward or when a link to another prefix is followed.
  useEffect(() => {
    const fromHash = readHash();
    if (fromHash) setInput(fromHash);
    setHydrated(true);
    const onHash = () => {
      const h = readHash();
      if (h) setInput(h);
    };
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const id = setTimeout(() => {
      const next = input.trim() ? `#${encodeURIComponent(input.trim())}` : '';
      if (location.hash !== next) history.replaceState(null, '', next || location.pathname);
    }, 300);
    return () => clearTimeout(id);
  }, [input, hydrated]);

  const result = useMemo<{ info?: SubnetInfo; error?: string }>(() => {
    try {
      return { info: describe(input) };
    } catch (e) {
      return { error: e instanceof SubnetError ? e.message : 'Could not parse that' };
    }
  }, [input]);

  const info = result.info;
  const maxLen = info?.family === 6 ? 128 : 32;
  const splitN = splitLen === '' ? NaN : Number(splitLen);
  const splitResult = useMemo(() => {
    if (!info || !Number.isInteger(splitN) || splitN <= info.prefixLength || splitN > maxLen) return undefined;
    try {
      return split(info.cidr, splitN, 64);
    } catch {
      return undefined;
    }
  }, [info, splitN, maxLen]);

  return (
    <div className="space-y-6">
      <div>
        <label htmlFor="subnet-input" className="label">
          Address with prefix length or netmask
        </label>
        <input
          id="subnet-input"
          className="field font-mono"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          inputMode="text"
          aria-invalid={!!result.error}
          aria-describedby="subnet-help"
        />
        <p id="subnet-help" className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
          Try:
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" className="font-mono underline hover:text-fg" onClick={() => setInput(ex)}>
              {ex}
            </button>
          ))}
        </p>
        {result.error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {result.error}
          </p>
        )}
      </div>

      {info && (
        <>
          <section className="card p-4" aria-label="Summary">
            <dl className="kv">
              <Row k="Network" v={info.cidr} copy />
              <Row k="Address type" v={info.addressType} mono={false} />
              {info.family === 4 && <Row k="Class (historical)" v={info.ipv4Class!} />}
              <Row k="Netmask" v={info.netmask} copy />
              {info.wildcard && <Row k="Wildcard" v={info.wildcard} copy />}
              {info.broadcast && <Row k="Broadcast" v={info.broadcast} copy />}
              <Row k="First usable" v={info.firstHost} copy />
              <Row k="Last usable" v={info.lastHost} copy />
              <Row
                k={info.family === 4 && info.prefixLength <= 30 ? 'Usable range' : 'Range'}
                v={`${info.firstHost} – ${info.lastHost}`}
              />
              <Row k="Total addresses" v={formatBig(info.totalAddresses)} />
              {info.family === 4 && <Row k="Usable hosts" v={formatBig(info.usableHosts)} />}
              {info.subnets64 !== undefined && <Row k="/64 subnets" v={formatBig(info.subnets64)} />}
              <Row k="Reverse zone" v={info.reverseZone} copy />
            </dl>
            {info.family === 4 && info.prefixLength === 31 && (
              <p className="mt-3 text-xs text-fg-muted">/31: both addresses usable on point-to-point links (RFC 3021).</p>
            )}
          </section>

          <section className="card overflow-x-auto p-4" aria-label="Binary view">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-subtle">Binary</h2>
            <BinaryRow label="Address" bits={info.binary.address} networkBits={info.binary.networkBits} />
            <BinaryRow label="Mask" bits={info.binary.mask} networkBits={info.binary.networkBits} />
            <p className="mt-2 text-xs text-fg-muted">
              <span className="rounded bg-accent-soft px-1">network bits</span> · host bits
            </p>
          </section>

          <section className="card p-4" aria-label="Split and supernet">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="split-len" className="label">
                  Split into /
                </label>
                <input
                  id="split-len"
                  className="field font-mono"
                  type="number"
                  min={info.prefixLength + 1}
                  max={maxLen}
                  value={splitLen}
                  placeholder={String(Math.min(maxLen, info.prefixLength + 2))}
                  onChange={(e) => setSplitLen(e.target.value)}
                />
              </div>
              <div>
                <span className="label">Supernets</span>
                <ul className="flex flex-wrap gap-1.5 font-mono text-xs">
                  {[1, 2, 4, 8]
                    .map((d) => info.prefixLength - d)
                    .filter((l) => l >= 0)
                    .map((l) => (
                      <li key={l}>
                        <button type="button" className="btn !px-2 !py-1 !text-xs" onClick={() => setInput(supernet(info.cidr, l))}>
                          {supernet(info.cidr, l)}
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            </div>
            {splitResult && (
              <div className="mt-4">
                <p className="text-sm text-fg-muted">
                  {formatBig(splitResult.count)} subnet{splitResult.count === 1n ? '' : 's'}
                  {splitResult.count > BigInt(splitResult.subnets.length) && ` (showing first ${splitResult.subnets.length})`}
                </p>
                <ul className="mt-2 grid max-h-64 grid-cols-1 gap-1 overflow-y-auto font-mono text-sm sm:grid-cols-2">
                  {splitResult.subnets.map((s) => (
                    <li key={s}>
                      <button type="button" className="underline-offset-2 hover:underline" onClick={() => setInput(s)}>
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Row({ k, v, copy = false, mono = true }: { k: string; v: string; copy?: boolean; mono?: boolean }) {
  return (
    <>
      <dt>{k}</dt>
      <dd className={mono ? '' : '!font-sans'}>
        {v}
        {copy && <CopyButton text={v} className="ml-2 align-middle" />}
      </dd>
    </>
  );
}

function BinaryRow({ label, bits, networkBits }: { label: string; bits: string; networkBits: number }) {
  // Split the separator-delimited bit string into network and host portions,
  // counting only 0/1 characters toward the prefix.
  let seen = 0;
  let cut = bits.length;
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === '0' || bits[i] === '1') {
      if (seen === networkBits) {
        cut = i;
        break;
      }
      seen++;
    }
  }
  return (
    <div className="flex gap-3 whitespace-nowrap font-mono text-xs leading-6">
      <span className="w-14 shrink-0 text-fg-muted">{label}</span>
      <span>
        <span className="rounded bg-accent-soft px-0.5">{bits.slice(0, cut)}</span>
        <span className="text-fg-muted">{bits.slice(cut)}</span>
      </span>
    </div>
  );
}

function readHash(): string | undefined {
  if (!location.hash) return undefined;
  try {
    return decodeURIComponent(location.hash.slice(1));
  } catch {
    return undefined;
  }
}
