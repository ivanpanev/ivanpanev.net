# ADR-0009: Notebook: Go service, client-side encryption, passcode-derived keys

- Status: Accepted
- Date: 2026-09-16
- Deciders: Ivan Panev

## Context

The notebook lets the operator paste text, code, and images on one machine
and retrieve them elsewhere within a time window, protected only by a
passcode. A passcode is a low-entropy secret; the design must assume it will
be guessed at some rate and must ensure the server can never read content
even if compromised. This is the first server-side service, so its language
sets the default for the platform.

## Decision

Language: Go, standard library HTTP router, `pgx` for PostgreSQL, structured
logging with `slog`, OpenTelemetry SDK, distroless non-root container. Go is
the Kubernetes ecosystem's lingua franca, produces small images, and the
operator benefits from it professionally. Elixir/Phoenix is reserved for the
real-time collaboration service (Phase 3) where its process model is the
right tool.

Crypto model (all key material derived and used in the browser):

1. `passcode` -> Argon2id (memory 64 MiB, iterations 3, parallelism 1,
   salt = `SHA-256("ivanpanev.net/notebook/v1")`, output 96 bytes) via
   `hash-wasm`.
2. Output split: `lookupKey` (32 B), `authKey` (32 B), `encKey` (32 B).
3. `notebookId = base64url(SHA-256(lookupKey))` identifies the notebook to
   the server. `authProof = base64url(SHA-256(authKey))` is sent on mutating
   requests and stored by the server as the notebook's `auth_hash`.
4. Every item is encrypted with AES-256-GCM under `encKey` with a random
   96-bit nonce; item metadata (title, kind, language) is inside the
   ciphertext envelope. The server stores opaque bytes plus size and expiry.
5. The same passcode on any device deterministically reproduces all keys.

The server never receives the passcode, `encKey`, or plaintext, and cannot
distinguish a wrong passcode from an empty notebook. Consequences by design:
two people who pick the same passcode share a notebook. Mitigations: the UI
requires >= 12 characters or >= 3 dictionary words, offers a generated
passphrase, and displays a clear warning.

Server-side controls: per-IP token bucket, Cloudflare rate-limiting rule on
`/v1/*`, item cap 20 MB, notebook cap 100 MB and 50 items, TTL 1 hour to 7
days, expiry sweeper, all limits configurable via environment.

Storage: Postgres `bytea` for ciphertext in Phase 1 (OD-7 tracks S3 offload).

## Alternatives considered

- Server-side encryption with a server key: simpler client, but a server
  compromise exposes everything, and the passcode would have to be sent.
- Per-notebook random salt fetched from the server: stronger against
  precomputation, but requires an unauthenticated "does this passcode
  exist" lookup keyed by something derived from the passcode anyway; the
  fixed application salt plus a memory-hard KDF is the honest trade-off for
  passcode-only access.
- Rust for the service: excellent fit, steeper for a first service; Go is
  sufficient and faster to iterate.

## Consequences

- Threat model documented in `docs/security/notebook-threat-model.md`
  (Milestone 4), including brute-force cost estimates with the chosen Argon2
  parameters and rate limits.
- Key derivation is CPU-heavy on the client (about one second on a laptop);
  acceptable and shown with a progress indicator.
- Lost passcode means lost data; there is no recovery by design.
