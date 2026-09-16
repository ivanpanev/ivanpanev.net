# Milestone 4 remediation (round 1 → 2)

| ID | Change |
| --- | --- |
| M4-R1-F01 | `pg_advisory_lock` around `goose.UpContext` so two replicas cannot CREATE TABLE concurrently. |
| M4-R1-F02 | `MaxBytesReader` is `2*MaxItemBytes + 1MiB` to admit base64url JSON of a max-size item. httptest `TestItemTooLarge`. |
| M4-R1-F03 | Pinned Argon2id known-answer for `vector-pass-12`; httptest asserts stored `auth_hash = SHA-256(authProof)`. |
| M4-R1-F04 | Tests for 413, TTL 400, extend, config TTL/100MiB, Memory sweep and expired recreate. |
| M4-R1-F05 | `ON CONFLICT` replaces expired rows (new auth_hash allowed); Memory store matches. |
| M4-R1-F06 | Retry migrate and Postgres connect (×8 backoff). Idempotent handlers retry store errors 3× (50ms doubling); POST insert stays fail-fast. pgx `statement_timeout=15s`. HTTP Read/Write/Idle 60/60/90s. httptest `TestRetryIdempotentStore`. |
| M4-R1-F07 | `docs/runbooks/notebook-api.md`. |
| M4-R1-F08 | ServiceMonitor `jobLabel: app.kubernetes.io/name`; dashboard `job="notebook-api"`. |
| M4-R1-F09 | ADR-0009 revision: `kind` is an allowed listing hint. |
| M4-R1-F10 | Limiter entries expire after 10 minutes; map reset above 4096 keys. |
| M4-R1-F12 | `LOG_LEVEL` applied to slog; Deployment sets `LOG_LEVEL=info`. |
| M4-R1-F13 | Image drop target on `/notes`. |
| M4-R1-F14 | HTTPRoute matches `/v1`, `/healthz`, `/readyz`, `/openapi.yaml` only; IP key is `CF-Connecting-IP` or RemoteAddr (no XFF). |
| M4-R1-F15 | Deleted stray `apps/notebook-api/D:ivptmpsops-d.err`. |
