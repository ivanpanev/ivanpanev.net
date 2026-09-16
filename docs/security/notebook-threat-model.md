# Notebook threat model

Scope: the passcode notebook (`/notes` + `notes-api.ivanpanev.net` + CNPG).
Platform exposure (Tunnel, Access, supply chain) is
[platform-threat-model.md](platform-threat-model.md) (Milestone 5).

## Assets

| Asset | Where it lives | Sensitivity |
| --- | --- | --- |
| Passcode | Operator's head / password manager | Credential. Never sent. |
| `lookupKey`, `authKey`, `encKey` | Browser memory during a session | Credential / encryption key |
| `notebookId`, `authProof` | Browser, HTTPS to Cloudflare, API process | Identifiers. `authProof` authorises writes |
| `auth_hash` = SHA-256(`authProof`) | Postgres, WAL, S3 backups | Not replayable against the API |
| Ciphertext + 96-bit nonce | Postgres, WAL, S3 backups, GET `/v1/items/{id}` | Opaque without `encKey` |
| Item metadata (kind, size, expiry) | GET `/v1/notebooks/{id}/items` (unauthenticated) | Low; existence given `notebookId` |

## Trust boundaries

```
[operator] --passcode--> [browser: Argon2id + AES-GCM]
                              | HTTPS notebookId + authProof + ciphertext
                              v
                         [Cloudflare edge]  TLS terminated; rate-limit 40/10s (non-OPTIONS)
                              | Tunnel
                              v
                         [notebook-api]     never sees passcode / encKey / plaintext
                              |
                              v
                         [CNPG Postgres]    auth_hash + bytea
                              |
                              v
                         [Hetzner Object Storage ivp-cnpg]
```

Cloudflare and a compromised *running* API see `notebookId` and `authProof`
for notebooks used during the compromise window. They can overwrite or delete
those items. They cannot decrypt. A leaked database or backup yields neither
replayable proofs nor plaintext (ADR-0009).

## Attackers and mitigations

### Online guessing of a passcode

Argon2id parameters: 64 MiB, 3 iterations, parallelism 1, 96-byte output.
On a laptop this is about one second per guess, shown in the UI.

The application token bucket is 2 requests/second, burst 20, keyed by
`CF-Connecting-IP`, per replica (two replicas, so up to twice that before
the edge rule binds). Cloudflare adds 40 requests / 10 seconds per IP on
`/v1/*` for non-OPTIONS methods; measured 2026-09-17: 40× 200 then 429.
CORS preflights are not counted at the edge: a preflight carries no `X-Auth`
and therefore no guess, and Cloudflare's 429 has no CORS headers, so
counting them made a normal browser session (each authenticated call is
OPTIONS + request) fail with "Failed to fetch" (M7-R1-F01). Effective online
rate against one IP: at most 4 guesses/second.

A 12-character random password from a 95-character set is 95^12 ≈ 5.4×10^23
candidates. At 4 r/s that is ~10^15 years. A 6-word EFF short-wordlist
passphrase (1296^6 ≈ 4.7×10^18) is the same story. Common, reused, or
leaked passcodes fall immediately; the UI requires ≥ 12 characters or ≥ 3
words and offers a generated passphrase. That is the real residual risk.

`PUT /v1/notebooks/{id}` creates a notebook. A guesser who never hits an
existing id therefore writes empty rows. TTL (1 h–7 d) and the sweeper bound
that junk.

`GET /v1/notebooks/{id}/items` is unauthenticated and returns an empty list
for both "unknown" and "empty", so a wrong passcode is indistinguishable from
an unused one. `PUT` with a wrong proof on an *existing* notebook returns
401; that is an existence oracle once the attacker already derived the
matching `notebookId` (i.e. already knows the passcode's lookup half).

### Offline guessing after a database leak

The attacker has ciphertext and `auth_hash`. They must run Argon2id to
obtain `encKey`. RAM bounds parallelism: 64 MiB per attempt, so a 16 GiB
box does about 256 concurrent guesses. At 10 ms/guess on a server-class
CPU that is order 2.5×10^4 guesses/second — still hopeless against a
generated 6-word passphrase, not against `password1234`.

`auth_hash` is SHA-256(`authProof`) and `authProof` is SHA-256(`authKey`).
A leak is not replayable on the live API.

### Shared-passcode collision

Two people who choose the same passcode share one notebook. Inherent to
"passcode is the only credential". Mitigations: policy, generated
passphrase, explicit warning on `/notes`.

### Item UUID disclosure

`GET /v1/items/{uuid}` is unauthenticated and returns nonce + ciphertext.
UUIDv4 is 122 bits of randomness. Enumeration is not practical. Knowing a
UUID without `encKey` still yields garbage.

### Abuse / resource exhaustion

Caps: 20 MiB/item, 100 MiB/notebook, 50 items, TTL ≤ 7 days. Body
`MaxBytesReader`. Cloudflare 100 MiB request ceiling. Two API replicas
behind a PDB. Postgres is one instance in Phase 1 (accepted; restore is
Milestone 5).

### Compromised browser

XSS would see the passcode and keys. CSP is hash-only `script-src`,
`connect-src` only `'self'` and `https://notes-api.ivanpanev.net`,
`default-src 'none'`. The island is the trusted computing base.

### Compromised operator workstation

The age key decrypts `cnpg-s3`. That is WAL and base backups of ciphertext,
not plaintext. Still protect the age key.

## What we explicitly do not claim

- Forward secrecy if the passcode leaks later (same passcode always
  reproduces the same keys).
- Protection against a global observer who watches the operator type the
  passcode.
- Multi-user isolation beyond the passcode.
