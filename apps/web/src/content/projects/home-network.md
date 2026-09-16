---
title: "Home network"
section: networking
order: 1
status: active
stack: [VLANs, WireGuard, OPNsense, Unifi]
summary: "Segmented home network with a management plane, an IoT island, and a WireGuard path back in."
updated: 2026-09-16
---

## Segments

| VLAN | Purpose | Can reach |
| --- | --- | --- |
| 10 | management | everything |
| 20 | trusted clients | internet, servers |
| 30 | servers | internet |
| 40 | IoT | internet only, rate-limited |
| 50 | guests | internet only |

The rule that matters: nothing initiates connections *into* management except
from management, and IoT devices talk to the internet and nothing else. Most
of them phone home to places I would rather they did not; that traffic is
logged so at least I know.

## Remote access

WireGuard on the firewall, one peer per device, keys rotated when a device is
retired. The cluster described in [the platform notes](/projects/site-platform)
will eventually reach the house the same way, for the future NAS and LLM
gateways.

## Open questions

- Whether to keep the consumer access points or move to something with a
  proper controller I can back up.
- IPv6 prefix delegation from the ISP is unstable; the fallback is ULA
  internally with NPTv6 at the edge, which is ugly but works.
