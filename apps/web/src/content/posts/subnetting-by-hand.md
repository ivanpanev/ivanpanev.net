---
title: "Subnetting by hand, still"
date: 2026-09-10
summary: "Calculators are fine, but the arithmetic is small enough to keep in your head, and being able to do it changes how you read a routing table."
tags: [networking, ipv4, ipv6]
draft: false
signed: false
---

Every network engineer learns to subnet and then most of them forget, because
there is always a calculator nearby. I kept doing it by hand, mostly out of
stubbornness, and it turned out to be one of the more useful habits I carried
into SRE work.

## The one trick

A /24 is 256 addresses. Every bit you borrow halves that. So a /26 is 64
addresses, a /27 is 32, a /28 is 16. The *block size* is the only number you
need; networks start at multiples of it.

Given `10.20.30.77/27`:

- block size is 32;
- 77 falls in the block starting at 64 (64, 96, 128, …);
- network `10.20.30.64`, broadcast `10.20.30.95`, hosts `.65`–`.94`.

That is the whole method for anything /24 and longer. For shorter prefixes
the same arithmetic applies to the third octet: a /22 has a block size of 4 in
the third octet, so `10.20.30.77/22` lives in `10.20.28.0`–`10.20.31.255`.

## Why it matters when reading routes

Longest-prefix match is a comparison of block sizes. When you can see at a
glance that `10.20.30.0/23` covers `10.20.31.77` and `10.20.30.0/24` does
not, you read a routing table the way a native speaker reads a sentence
instead of translating each word.

## IPv6 is easier, not harder

Nobody subnets IPv6 below a nibble boundary in practice, so the arithmetic is
in hexadecimal digits: a /48 has 16 bits of subnet space, which is four hex
digits, which is 65,536 /64s. `2001:db8:abcd:1234::/64` is the 0x1234th /64
in the `2001:db8:abcd::/48`. There is no broadcast address and host counting
is meaningless, which removes half of the IPv4 trivia.

The [subnet calculator](/tools/subnet) on this site shows the binary view
next to the answer for exactly this reason: the point is to make the block
boundaries visible, not to hide them.

| Prefix | Block size (last octet) | Usable hosts |
| --- | --- | --- |
| /25 | 128 | 126 |
| /26 | 64 | 62 |
| /27 | 32 | 30 |
| /28 | 16 | 14 |
| /29 | 8 | 6 |
| /30 | 4 | 2 |
| /31 | 2 | 2 (RFC 3021) |
| /32 | 1 | 1 |
