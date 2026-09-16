# notebook-api

Passcode-protected encrypted notebook (ADR-0009). The server stores opaque
ciphertext, a nonce, size, kind, and expiry. It never receives the passcode,
`encKey`, or plaintext.

## API

| Method | Path | Auth |
| --- | --- | --- |
| `PUT` | `/v1/notebooks/{id}` | `X-Auth: <authProof>` |
| `GET` | `/v1/notebooks/{id}/items` | none (empty list if unknown) |
| `POST` | `/v1/notebooks/{id}/items` | `X-Auth` |
| `POST` | `/v1/notebooks/{id}/extend` | `X-Auth` |
| `GET` | `/v1/items/{itemId}` | none |
| `DELETE` | `/v1/items/{itemId}` | `X-Auth` |
| `GET` | `/healthz` `/readyz` `/metrics` | none |

`id` and `X-Auth` are unpadded base64url encodings of 32-byte SHA-256
digests. The server stores `SHA-256(authProof)` and compares in constant
time.

`GET /openapi.yaml` is the OpenAPI 3.1 document.

Limits (env-overridable): 20 MiB/item, 100 MiB/notebook, 50 items, TTL 1 h–7 d.

## Run locally

```bash
cp .env.example .env
# start Postgres, then:
export $(grep -v '^#' .env | xargs)
go test ./...
go run ./cmd/notebook-api
```

Postgres-backed tests are `go test -tags=integration ./...` and run in CI
against a service container. The workstation cannot run Docker
(`docs/toolchain.md`).
