# apps/

Deployable applications. Each has its own `README.md`, build, tests, and
container or deployment definition.

| App | Language | Deployed to | Milestone |
| --- | --- | --- | --- |
| `web/` | Astro 6, TypeScript, React islands | Cloudflare Workers Static Assets | M1 |
| `notebook-api/` | Go | Kubernetes (`k8s/apps/notebook-api`) | M4 |

Conventions:

- No secrets in source; local development reads `.env` (gitignored) created
  from `.env.example`.
- Every service exposes `/healthz` (liveness) and `/readyz` (readiness),
  logs JSON to stdout, and exports OpenTelemetry metrics and traces.
- Containers build from a multi-stage `Dockerfile`, run as non-root, and
  honour `TARGETARCH` (ADR-0013).
