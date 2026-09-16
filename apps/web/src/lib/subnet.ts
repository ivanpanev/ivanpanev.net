/**
 * IPv4/IPv6 prefix arithmetic on BigInt. Pure, dependency-free, unit-tested.
 * Nothing here touches the DOM; the SubnetCalculator island renders the result.
 */

export type Family = 4 | 6;

export interface Prefix {
  family: Family;
  /** Address as given, normalised. */
  address: bigint;
  prefixLength: number;
}

export interface SubnetInfo {
  family: Family;
  input: string;
  address: string;
  prefixLength: number;
  network: string;
  /** IPv4 only; undefined for IPv6 (no broadcast). */
  broadcast?: string;
  firstHost: string;
  lastHost: string;
  netmask: string;
  /** IPv4 only. */
  wildcard?: string;
  totalAddresses: bigint;
  /** IPv4: excludes network and broadcast except for /31 and /32 (RFC 3021). IPv6: same as total. */
  usableHosts: bigint;
  cidr: string;
  /** Reverse DNS zone name for the network. */
  reverseZone: string;
  addressType: string;
  binary: { address: string; mask: string; networkBits: number };
  /** IPv6 only: the /64 count inside this prefix when prefixLength <= 64. */
  subnets64?: bigint;
  ipv4Class?: 'A' | 'B' | 'C' | 'D' | 'E';
}

const MAX32 = (1n << 32n) - 1n;
const MAX128 = (1n << 128n) - 1n;

export class SubnetError extends Error {}

// ---------------------------------------------------------------- parsing

export function parseIPv4(s: string): bigint {
  const parts = s.trim().split('.');
  if (parts.length !== 4) throw new SubnetError('IPv4 address must have four octets');
  let v = 0n;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) throw new SubnetError(`Invalid octet "${p}"`);
    const n = Number(p);
    if (n > 255) throw new SubnetError(`Octet ${p} exceeds 255`);
    if (p.length > 1 && p.startsWith('0')) throw new SubnetError(`Octet "${p}" has a leading zero (ambiguous)`);
    v = (v << 8n) | BigInt(n);
  }
  return v;
}

export function parseIPv6(input: string): bigint {
  let s = input.trim().toLowerCase();
  if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1);
  const zone = s.indexOf('%');
  if (zone >= 0) s = s.slice(0, zone);
  if (!/^[0-9a-f:.]+$/.test(s)) throw new SubnetError('IPv6 address contains invalid characters');

  // Embedded IPv4 tail (::ffff:192.0.2.1)
  let tail: string[] = [];
  const lastColon = s.lastIndexOf(':');
  if (s.includes('.')) {
    const v4 = parseIPv4(s.slice(lastColon + 1));
    tail = [((v4 >> 16n) & 0xffffn).toString(16), (v4 & 0xffffn).toString(16)];
    s = s.slice(0, lastColon + 1) + '0:0'; // placeholder, replaced below
  }

  const dbl = s.split('::');
  if (dbl.length > 2) throw new SubnetError('IPv6 address may contain "::" only once');
  const head = dbl[0] ? dbl[0].split(':') : [];
  const rest = dbl.length === 2 ? (dbl[1] ? dbl[1].split(':') : []) : [];
  let groups: string[];
  if (dbl.length === 2) {
    const missing = 8 - head.length - rest.length;
    if (missing < 1) throw new SubnetError('IPv6 address has too many groups');
    groups = [...head, ...Array<string>(missing).fill('0'), ...rest];
  } else {
    groups = head;
    if (groups.length !== 8) throw new SubnetError('IPv6 address must have eight groups (or use "::")');
  }
  if (tail.length) groups.splice(6, 2, ...tail);
  let v = 0n;
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) throw new SubnetError(`Invalid group "${g}"`);
    v = (v << 16n) | BigInt(parseInt(g, 16));
  }
  return v;
}

/** Parse "addr", "addr/len" or "addr netmask" (IPv4 dotted mask) into a Prefix. */
export function parsePrefix(input: string): Prefix {
  const s = input.trim().replace(/\s+/g, ' ');
  if (!s) throw new SubnetError('Enter an address or prefix');
  let addrPart = s;
  let lenPart: string | undefined;
  if (s.includes('/')) {
    [addrPart, lenPart] = s.split('/', 2) as [string, string];
    if (s.split('/').length > 2) throw new SubnetError('Only one "/" allowed');
  } else if (s.includes(' ')) {
    [addrPart, lenPart] = s.split(' ', 2) as [string, string];
  }
  const family: Family = addrPart.includes(':') ? 6 : 4;
  const address = family === 6 ? parseIPv6(addrPart) : parseIPv4(addrPart);
  const max = family === 6 ? 128 : 32;
  let prefixLength = max;
  if (lenPart !== undefined) {
    if (family === 4 && lenPart.includes('.')) {
      prefixLength = maskToPrefixLength(parseIPv4(lenPart));
    } else {
      if (!/^\d{1,3}$/.test(lenPart)) throw new SubnetError(`Invalid prefix length "${lenPart}"`);
      prefixLength = Number(lenPart);
      if (prefixLength > max) throw new SubnetError(`Prefix length ${prefixLength} exceeds /${max}`);
    }
  }
  return { family, address, prefixLength };
}

export function maskToPrefixLength(mask: bigint): number {
  const bits = mask.toString(2).padStart(32, '0');
  const ones = bits.indexOf('0') === -1 ? 32 : bits.indexOf('0');
  if (bits.slice(ones).includes('1')) throw new SubnetError('Netmask is not contiguous');
  return ones;
}

// ---------------------------------------------------------------- formatting

export function formatIPv4(v: bigint): string {
  return [24n, 16n, 8n, 0n].map((s) => ((v >> s) & 0xffn).toString()).join('.');
}

/** RFC 5952 canonical text form. */
export function formatIPv6(v: bigint): string {
  const groups: number[] = [];
  for (let i = 7; i >= 0; i--) groups.push(Number((v >> BigInt(i * 16)) & 0xffffn));
  // find longest run of zeros (len >= 2)
  let bestStart = -1;
  let bestLen = 0;
  for (let i = 0; i < 8; ) {
    if (groups[i] !== 0) {
      i++;
      continue;
    }
    let j = i;
    while (j < 8 && groups[j] === 0) j++;
    if (j - i > bestLen) {
      bestStart = i;
      bestLen = j - i;
    }
    i = j;
  }
  const hex = groups.map((g) => g.toString(16));
  if (bestLen >= 2) {
    const head = hex.slice(0, bestStart).join(':');
    const tail = hex.slice(bestStart + bestLen).join(':');
    return `${head}::${tail}`;
  }
  return hex.join(':');
}

export function formatAddress(family: Family, v: bigint): string {
  return family === 4 ? formatIPv4(v) : formatIPv6(v);
}

export function toBinary(family: Family, v: bigint): string {
  const width = family === 4 ? 32 : 128;
  const bits = v.toString(2).padStart(width, '0');
  const chunk = family === 4 ? 8 : 16;
  const sep = family === 4 ? '.' : ':';
  const out: string[] = [];
  for (let i = 0; i < width; i += chunk) out.push(bits.slice(i, i + chunk));
  return out.join(sep);
}

// ---------------------------------------------------------------- arithmetic

export function maskFor(family: Family, prefixLength: number): bigint {
  const width = family === 4 ? 32 : 128;
  const all = family === 4 ? MAX32 : MAX128;
  if (prefixLength === 0) return 0n;
  return (all << BigInt(width - prefixLength)) & all;
}

export function networkOf(p: Prefix): bigint {
  return p.address & maskFor(p.family, p.prefixLength);
}

export function describe(input: string): SubnetInfo {
  const p = parsePrefix(input);
  const { family, prefixLength } = p;
  const width = family === 4 ? 32 : 128;
  const all = family === 4 ? MAX32 : MAX128;
  const mask = maskFor(family, prefixLength);
  const network = p.address & mask;
  const last = network | (~mask & all);
  const total = 1n << BigInt(width - prefixLength);
  const fmt = (v: bigint) => formatAddress(family, v);

  let firstHost = network;
  let lastHost = last;
  let usable = total;
  if (family === 4) {
    if (prefixLength <= 30) {
      firstHost = network + 1n;
      lastHost = last - 1n;
      usable = total - 2n;
    }
  }

  const info: SubnetInfo = {
    family,
    input: input.trim(),
    address: fmt(p.address),
    prefixLength,
    network: fmt(network),
    firstHost: fmt(firstHost),
    lastHost: fmt(lastHost),
    netmask: fmt(mask),
    totalAddresses: total,
    usableHosts: usable,
    cidr: `${fmt(network)}/${prefixLength}`,
    reverseZone: reverseZone(family, network, prefixLength),
    addressType: classify(family, p.address),
    binary: { address: toBinary(family, p.address), mask: toBinary(family, mask), networkBits: prefixLength },
  };
  if (family === 4) {
    info.broadcast = fmt(last);
    info.wildcard = fmt(~mask & all);
    info.ipv4Class = ipv4Class(p.address);
  } else if (prefixLength <= 64) {
    info.subnets64 = 1n << BigInt(64 - prefixLength);
  }
  return info;
}

/** Split a prefix into equal subnets of `newPrefixLength` (returns at most `limit` entries plus the total count). */
export function split(
  input: string,
  newPrefixLength: number,
  limit = 256,
): { count: bigint; subnets: string[] } {
  const p = parsePrefix(input);
  const width = p.family === 4 ? 32 : 128;
  if (newPrefixLength <= p.prefixLength) throw new SubnetError('New prefix length must be longer than the current one');
  if (newPrefixLength > width) throw new SubnetError(`Prefix length exceeds /${width}`);
  const network = networkOf(p);
  const count = 1n << BigInt(newPrefixLength - p.prefixLength);
  const step = 1n << BigInt(width - newPrefixLength);
  const n = count < BigInt(limit) ? Number(count) : limit;
  const subnets: string[] = [];
  for (let i = 0; i < n; i++) subnets.push(`${formatAddress(p.family, network + BigInt(i) * step)}/${newPrefixLength}`);
  return { count, subnets };
}

/** The enclosing prefix of length `newPrefixLength` (supernet). */
export function supernet(input: string, newPrefixLength: number): string {
  const p = parsePrefix(input);
  if (newPrefixLength >= p.prefixLength) throw new SubnetError('Supernet prefix must be shorter than the current one');
  if (newPrefixLength < 0) throw new SubnetError('Prefix length cannot be negative');
  const parent: Prefix = { ...p, prefixLength: newPrefixLength };
  return `${formatAddress(p.family, networkOf(parent))}/${newPrefixLength}`;
}

/** Smallest prefix containing all given addresses/prefixes (same family). */
export function summarize(inputs: string[]): string {
  const ps = inputs.map(parsePrefix);
  if (ps.length === 0) throw new SubnetError('Nothing to summarise');
  const family = ps[0]!.family;
  if (ps.some((p) => p.family !== family)) throw new SubnetError('Cannot mix IPv4 and IPv6');
  let len = Math.min(...ps.map((p) => p.prefixLength));
  const nets = ps.map(networkOf);
  while (len > 0) {
    const m = maskFor(family, len);
    const first = nets[0]! & m;
    if (nets.every((n) => (n & m) === first)) break;
    len--;
  }
  const m = maskFor(family, len);
  return `${formatAddress(family, nets[0]! & m)}/${len}`;
}

export function contains(outer: string, inner: string): boolean {
  const a = parsePrefix(outer);
  const b = parsePrefix(inner);
  if (a.family !== b.family || b.prefixLength < a.prefixLength) return false;
  return (b.address & maskFor(a.family, a.prefixLength)) === networkOf(a);
}

// ---------------------------------------------------------------- classification

function inRange(v: bigint, cidr: string): boolean {
  const p = parsePrefix(cidr);
  return (v & maskFor(p.family, p.prefixLength)) === networkOf(p);
}

const V4_TYPES: Array<[string, string]> = [
  ['0.0.0.0/8', 'This network (RFC 791)'],
  ['10.0.0.0/8', 'Private (RFC 1918)'],
  ['100.64.0.0/10', 'Shared address space / CGNAT (RFC 6598)'],
  ['127.0.0.0/8', 'Loopback (RFC 1122)'],
  ['169.254.0.0/16', 'Link-local (RFC 3927)'],
  ['172.16.0.0/12', 'Private (RFC 1918)'],
  ['192.0.0.0/24', 'IETF protocol assignments (RFC 6890)'],
  ['192.0.2.0/24', 'Documentation TEST-NET-1 (RFC 5737)'],
  ['192.88.99.0/24', 'Deprecated 6to4 relay anycast (RFC 7526)'],
  ['192.168.0.0/16', 'Private (RFC 1918)'],
  ['198.18.0.0/15', 'Benchmarking (RFC 2544)'],
  ['198.51.100.0/24', 'Documentation TEST-NET-2 (RFC 5737)'],
  ['203.0.113.0/24', 'Documentation TEST-NET-3 (RFC 5737)'],
  ['224.0.0.0/4', 'Multicast (RFC 5771)'],
  ['255.255.255.255/32', 'Limited broadcast'],
  ['240.0.0.0/4', 'Reserved (RFC 1112)'],
];

const V6_TYPES: Array<[string, string]> = [
  ['::/128', 'Unspecified'],
  ['::1/128', 'Loopback'],
  ['::ffff:0:0/96', 'IPv4-mapped (RFC 4291)'],
  ['64:ff9b::/96', 'IPv4/IPv6 translation NAT64 (RFC 6052)'],
  ['64:ff9b:1::/48', 'Local-use IPv4/IPv6 translation (RFC 8215)'],
  ['100::/64', 'Discard-only (RFC 6666)'],
  ['2001::/32', 'Teredo (RFC 4380)'],
  ['2001:20::/28', 'ORCHIDv2 (RFC 7343)'],
  ['2001:db8::/32', 'Documentation (RFC 3849)'],
  ['2002::/16', '6to4 (RFC 3056)'],
  ['3fff::/20', 'Documentation (RFC 9637)'],
  ['2000::/3', 'Global unicast'],
  ['fc00::/7', 'Unique local (RFC 4193)'],
  ['fe80::/10', 'Link-local unicast'],
  ['ff00::/8', 'Multicast'],
];

export function classify(family: Family, v: bigint): string {
  const table = family === 4 ? V4_TYPES : V6_TYPES;
  for (const [cidr, label] of table) if (inRange(v, cidr)) return label;
  return family === 4 ? 'Public unicast' : 'Reserved / unassigned';
}

export function ipv4Class(v: bigint): 'A' | 'B' | 'C' | 'D' | 'E' {
  const first = Number(v >> 24n);
  if (first < 128) return 'A';
  if (first < 192) return 'B';
  if (first < 224) return 'C';
  if (first < 240) return 'D';
  return 'E';
}

export function reverseZone(family: Family, network: bigint, prefixLength: number): string {
  if (family === 4) {
    const octets = formatIPv4(network).split('.');
    const keep = Math.floor(prefixLength / 8);
    return keep === 0 ? 'in-addr.arpa' : `${octets.slice(0, keep).reverse().join('.')}.in-addr.arpa`;
  }
  const nibbles = network.toString(16).padStart(32, '0').split('');
  const keep = Math.floor(prefixLength / 4);
  return keep === 0 ? 'ip6.arpa' : `${nibbles.slice(0, keep).reverse().join('.')}.ip6.arpa`;
}

/** Thousands-separated BigInt for display. */
export function formatBig(n: bigint): string {
  return n.toLocaleString('en-US');
}
