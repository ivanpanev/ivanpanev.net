# Evidence pack: Milestone 4 (notebook-api + /notes)

Generated 2026-09-16 on the Windows workstation. Go 1.27.1 at
`%LOCALAPPDATA%\ivp\go`. Go module/build caches were redirected to `D:\ivp\go-cache`
because drive C: filled during `go mod tidy`. Helm repository cache:
`%LOCALAPPDATA%\Temp\helm`. Round-2 pack after remediating `docs/reviews/m4-r1.md`.

| File | Command | Expected |
| --- | --- | --- |
| `go-test.txt` | `go test -count=1 -cover ./...` in `apps/notebook-api` | api 72.4%, config 65.9%, store 12.1% (memory tests); httptest covers healthz, auth mismatch, round-trip, CORS, item cap, OpenAPI, rate-limit, item too large, TTL, auth_hash SHA-256(authProof), extend, idempotent store retry |
| `web-check.txt` | `pnpm check` in `apps/web` | 0 errors / 0 warnings / 0 hints (72 files) |
| `web-unit.txt` | `pnpm test -- --coverage` | 135 tests in 9 files including Argon2id known-answer; lines 96.84% / branches 87.4% / functions 96.15% |
| `web-build.txt` | `pnpm build` then `pnpm lint:html` | 22 pages; `check-dist: 22 pages OK, 96 files`; CSP `connect-src 'self' https://notes-api.ivanpanev.net` |
| `e2e-notes.txt` | `playwright test tests/e2e/notes.spec.ts --project=chromium` plus smoke `/notes` | 2 notes tests + 1 smoke pass against wrangler |
| `k8s-validate.txt` | `bash scripts/k8s-validate.sh` | `k8s-validate: ok`; notebook overlay 11 valid |
| `sops-cnpg.txt` | `sops filestatus k8s/apps/notebook-api/base/cnpg-s3.secret.yaml` | `{"encrypted":true}` two age recipients |

Remediation log: `docs/reviews/m4-remediation.md`. Previous report: `docs/reviews/m4-r1.md`.

## Not executable on this workstation

| Check | Why | Where it runs instead |
| --- | --- | --- |
| Postgres integration tests (`-tags=integration`) | no Docker/Hyper-V | `notebook-api.yml` service container |
| Distroless image build, GHCR push, cosign, overlay bump | no Docker; no GitHub `main` with this tree | `notebook-api.yml` on first push to `main` |
| Live CNPG Cluster / notebook-api Deployment | GitOps handover waits for GitHub `main`; do not apply `root-application.yaml` yet | operator after push; image will ImagePullBackOff until CI publishes `ghcr.io/ivanpanev/notebook-api` |
| `/notes` against a running local API | no local Postgres | httptest + Playwright route mock; CORS allowlist is production origin |
| `govulncheck` / `gosec` / `staticcheck` / `k6` / syft SBOM | not on PATH here; image not built | `notebook-api.yml` (govulncheck + golangci-lint); SBOM/cosign after first CI |

## Operator verification required

- Push `main` so `notebook-api.yml` publishes a signed image and bumps the overlay.
- After Argo sync: CNPG Cluster healthy, WAL in `ivp-cnpg/notebook`, `GET https://notes-api.ivanpanev.net/healthz` 200, `/notes` round-trip.
- Grafana dashboard `notebook-api` visible (sidecar `searchNamespace: ALL`); PromQL `job="notebook-api"` after ServiceMonitor `jobLabel`.
