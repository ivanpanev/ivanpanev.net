import { describe, expect, it } from 'vitest';
import {
  classify,
  contains,
  describe as describeSubnet,
  formatIPv6,
  maskToPrefixLength,
  parseIPv4,
  parseIPv6,
  parsePrefix,
  reverseZone,
  split,
  SubnetError,
  summarize,
  supernet,
  toBinary,
} from '@/lib/subnet';

describe('IPv4 parsing', () => {
  it('parses dotted quads', () => {
    expect(parseIPv4('192.168.1.1')).toBe(0xc0a80101n);
    expect(parseIPv4('0.0.0.0')).toBe(0n);
    expect(parseIPv4('255.255.255.255')).toBe(0xffffffffn);
  });
  it.each(['1.2.3', '1.2.3.4.5', '256.0.0.1', '01.2.3.4', 'a.b.c.d', '1..2.3'])('rejects %s', (s) => {
    expect(() => parseIPv4(s)).toThrow(SubnetError);
  });
  it('accepts dotted netmask and rejects non-contiguous masks', () => {
    expect(parsePrefix('10.0.0.1 255.255.255.0').prefixLength).toBe(24);
    expect(parsePrefix('10.0.0.1/255.255.240.0').prefixLength).toBe(20);
    expect(maskToPrefixLength(0n)).toBe(0);
    expect(() => parsePrefix('10.0.0.1 255.0.255.0')).toThrow(/contiguous/);
  });
  it('rejects bad prefix lengths', () => {
    expect(() => parsePrefix('10.0.0.1/33')).toThrow(/exceeds/);
    expect(() => parsePrefix('10.0.0.1/x')).toThrow(SubnetError);
    expect(() => parsePrefix('10.0.0.1/8/9')).toThrow(SubnetError);
    expect(() => parsePrefix('')).toThrow(SubnetError);
  });
});

describe('IPv6 parsing and formatting', () => {
  it.each([
    ['::', '::'],
    ['::1', '::1'],
    ['2001:db8::1', '2001:db8::1'],
    ['2001:0DB8:0000:0000:0000:0000:0000:0001', '2001:db8::1'],
    ['2001:db8:0:0:1:0:0:1', '2001:db8::1:0:0:1'],
    ['2001:db8:0:1:1:1:1:1', '2001:db8:0:1:1:1:1:1'],
    ['fe80::1%eth0', 'fe80::1'],
    ['[2001:db8::1]', '2001:db8::1'],
    ['::ffff:192.0.2.128', '::ffff:c000:280'],
    ['1:0:0:0:0:0:0:0', '1::'],
    ['0:0:0:0:0:0:0:1', '::1'],
  ])('%s -> %s (RFC 5952)', (input, expected) => {
    expect(formatIPv6(parseIPv6(input))).toBe(expected);
  });
  it.each(['1:2:3:4:5:6:7', '1:2:3:4:5:6:7:8:9', '1::2::3', 'g::1', '12345::', '1:2:3:4:5:6:7::8'])('rejects %s', (s) => {
    expect(() => parseIPv6(s)).toThrow(SubnetError);
  });
  it('rejects prefix > 128', () => {
    expect(() => parsePrefix('::1/129')).toThrow(/exceeds/);
  });
});

describe('describe()', () => {
  it('computes a classic IPv4 /27', () => {
    const r = describeSubnet('10.20.30.77/27');
    expect(r.network).toBe('10.20.30.64');
    expect(r.broadcast).toBe('10.20.30.95');
    expect(r.firstHost).toBe('10.20.30.65');
    expect(r.lastHost).toBe('10.20.30.94');
    expect(r.netmask).toBe('255.255.255.224');
    expect(r.wildcard).toBe('0.0.0.31');
    expect(r.totalAddresses).toBe(32n);
    expect(r.usableHosts).toBe(30n);
    expect(r.cidr).toBe('10.20.30.64/27');
    expect(r.addressType).toBe('Private (RFC 1918)');
    expect(r.ipv4Class).toBe('A');
    expect(r.reverseZone).toBe('30.20.10.in-addr.arpa');
    expect(r.binary.address).toBe('00001010.00010100.00011110.01001101');
  });
  it('handles /31 and /32 per RFC 3021', () => {
    const p2p = describeSubnet('192.0.2.0/31');
    expect(p2p.usableHosts).toBe(2n);
    expect(p2p.firstHost).toBe('192.0.2.0');
    expect(p2p.lastHost).toBe('192.0.2.1');
    const host = describeSubnet('192.0.2.7/32');
    expect(host.usableHosts).toBe(1n);
    expect(host.firstHost).toBe('192.0.2.7');
  });
  it('handles /0', () => {
    const r = describeSubnet('0.0.0.0/0');
    expect(r.netmask).toBe('0.0.0.0');
    expect(r.broadcast).toBe('255.255.255.255');
    expect(r.totalAddresses).toBe(1n << 32n);
    expect(r.reverseZone).toBe('in-addr.arpa');
  });
  it('defaults to a host prefix when none is given', () => {
    expect(describeSubnet('8.8.8.8').prefixLength).toBe(32);
    expect(describeSubnet('2001:db8::').prefixLength).toBe(128);
  });
  it('computes IPv6 prefixes without broadcast', () => {
    const r = describeSubnet('2001:db8:abcd:1234::1/64');
    expect(r.network).toBe('2001:db8:abcd:1234::');
    expect(r.broadcast).toBeUndefined();
    expect(r.wildcard).toBeUndefined();
    expect(r.firstHost).toBe('2001:db8:abcd:1234::');
    expect(r.lastHost).toBe('2001:db8:abcd:1234:ffff:ffff:ffff:ffff');
    expect(r.totalAddresses).toBe(1n << 64n);
    expect(r.usableHosts).toBe(1n << 64n);
    expect(r.subnets64).toBe(1n);
    expect(r.addressType).toBe('Documentation (RFC 3849)');
    expect(r.reverseZone).toBe('4.3.2.1.d.c.b.a.8.b.d.0.1.0.0.2.ip6.arpa');
    expect(describeSubnet('2001:db8::/48').subnets64).toBe(65536n);
    expect(describeSubnet('2001:db8::1/96').subnets64).toBeUndefined();
  });
  it('emits 128-bit binary in 16-bit groups', () => {
    expect(toBinary(6, 1n).split(':')).toHaveLength(8);
    expect(toBinary(6, 1n).endsWith('0000000000000001')).toBe(true);
  });
});

describe('classification', () => {
  it.each([
    ['10.1.2.3', 'Private (RFC 1918)'],
    ['172.31.255.255', 'Private (RFC 1918)'],
    ['172.32.0.1', 'Public unicast'],
    ['192.168.0.1', 'Private (RFC 1918)'],
    ['100.64.0.1', 'Shared address space / CGNAT (RFC 6598)'],
    ['127.0.0.1', 'Loopback (RFC 1122)'],
    ['169.254.10.10', 'Link-local (RFC 3927)'],
    ['198.18.0.1', 'Benchmarking (RFC 2544)'],
    ['203.0.113.9', 'Documentation TEST-NET-3 (RFC 5737)'],
    ['224.0.0.251', 'Multicast (RFC 5771)'],
    ['255.255.255.255', 'Limited broadcast'],
    ['240.0.0.1', 'Reserved (RFC 1112)'],
    ['1.1.1.1', 'Public unicast'],
  ])('%s is %s', (ip, label) => {
    expect(classify(4, parseIPv4(ip))).toBe(label);
  });
  it.each([
    ['::', 'Unspecified'],
    ['::1', 'Loopback'],
    ['::ffff:10.0.0.1', 'IPv4-mapped (RFC 4291)'],
    ['64:ff9b::1', 'IPv4/IPv6 translation NAT64 (RFC 6052)'],
    ['2001:db8::1', 'Documentation (RFC 3849)'],
    ['2001:4860:4860::8888', 'Global unicast'],
    ['fd12:3456::1', 'Unique local (RFC 4193)'],
    ['fe80::1', 'Link-local unicast'],
    ['ff02::1', 'Multicast'],
    ['3fff::1', 'Documentation (RFC 9637)'],
    ['4000::1', 'Reserved / unassigned'],
  ])('%s is %s', (ip, label) => {
    expect(classify(6, parseIPv6(ip))).toBe(label);
  });
});

describe('split / supernet / summarize / contains', () => {
  it('splits into equal subnets and caps the listing', () => {
    const r = split('10.0.0.0/24', 26);
    expect(r.count).toBe(4n);
    expect(r.subnets).toEqual(['10.0.0.0/26', '10.0.0.64/26', '10.0.0.128/26', '10.0.0.192/26']);
    const big = split('10.0.0.0/8', 24, 10);
    expect(big.count).toBe(65536n);
    expect(big.subnets).toHaveLength(10);
    expect(big.subnets[9]).toBe('10.0.9.0/24');
  });
  it('splits IPv6 on nibble boundaries', () => {
    const r = split('2001:db8::/48', 52);
    expect(r.count).toBe(16n);
    expect(r.subnets[1]).toBe('2001:db8:0:1000::/52');
  });
  it('rejects invalid split lengths', () => {
    expect(() => split('10.0.0.0/24', 24)).toThrow(SubnetError);
    expect(() => split('10.0.0.0/24', 33)).toThrow(SubnetError);
  });
  it('computes supernets', () => {
    expect(supernet('10.20.30.64/27', 24)).toBe('10.20.30.0/24');
    expect(supernet('192.168.37.0/24', 16)).toBe('192.168.0.0/16');
    expect(() => supernet('10.0.0.0/24', 24)).toThrow(SubnetError);
    expect(() => supernet('10.0.0.0/24', -1)).toThrow(SubnetError);
  });
  it('summarises a set of prefixes', () => {
    expect(summarize(['10.0.0.0/24', '10.0.1.0/24'])).toBe('10.0.0.0/23');
    expect(summarize(['10.0.0.0/24', '10.0.2.0/24'])).toBe('10.0.0.0/22');
    expect(summarize(['192.168.1.5', '192.168.1.9'])).toBe('192.168.1.0/28');
    expect(summarize(['0.0.0.0', '255.255.255.255'])).toBe('0.0.0.0/0');
    expect(summarize(['2001:db8:1::/48', '2001:db8:2::/48'])).toBe('2001:db8::/46');
    expect(() => summarize([])).toThrow(SubnetError);
    expect(() => summarize(['10.0.0.0/8', '::1'])).toThrow(/mix/);
  });
  it('tests containment', () => {
    expect(contains('10.0.0.0/8', '10.20.30.40/32')).toBe(true);
    expect(contains('10.0.0.0/8', '11.0.0.0/8')).toBe(false);
    expect(contains('10.0.0.0/24', '10.0.0.0/16')).toBe(false);
    expect(contains('10.0.0.0/8', '::1')).toBe(false);
  });
  it('builds reverse zones at non-octet boundaries by truncating', () => {
    expect(reverseZone(4, parseIPv4('10.20.0.0'), 20)).toBe('20.10.in-addr.arpa');
    // /30 covers 7 whole nibbles: 2 0 0 1 0 d b
    expect(reverseZone(6, parseIPv6('2001:db8::'), 30)).toBe('b.d.0.1.0.0.2.ip6.arpa');
    expect(reverseZone(6, parseIPv6('2001:db8::'), 28)).toBe('b.d.0.1.0.0.2.ip6.arpa');
    expect(reverseZone(6, parseIPv6('2001:db8::'), 27)).toBe('d.0.1.0.0.2.ip6.arpa');
    expect(reverseZone(6, 0n, 0)).toBe('ip6.arpa');
  });
});
