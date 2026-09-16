# M7 evidence pack — ship and hand over

Collected 2026-09-17 00:20 (UTC+3) from the operator machine against the
live Hetzner cluster (`KUBECONFIG=infra/terraform/hetzner/kubeconfig`) and
the public endpoints. Repository HEAD at collection time: see `git-log.txt`
(first line). No file contains a credential; GitHub redacts the Cloudflare
account id as `***` in job logs.

| File | What it shows | Command |
| --- | --- | --- |
| `git-log.txt` | The 25 commits that make up M7 on `main` (first push, CI fixes, GitOps handover fixes). | `git log --format="%h %ci %s" -25` |
| `repo-visibility.txt` | Repository is public (ADR-0012), default branch `main`. | `GET https://api.github.com/repos/ivanpanev/ivanpanev.net` filtered to `full_name`, `private`, `visibility`, `default_branch` |
| `github-secrets.txt` | `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` exist at repo level and in the `production` and `preview` environments (names only). | `GET /repos/.../actions/secrets`, `GET /repos/.../environments/{production,preview}/secrets` |
| `ci-runs.txt` | Most recent workflow runs: `hygiene`, `k8s-validate`, `notebook-api` green on `main`; `web` fails at deploy. | `GET /repos/.../actions/runs?per_page=30` (id, workflow, event, status, conclusion, sha, created) |
| `web-deploy-failure.txt` | The `web.yml` run 35154814516: `build and verify` succeeded, `deploy to production` failed inside `wrangler deploy` with Cloudflare `9109 Cannot use the access token from location: <runner ip>`. Root cause and operator fix in `docs/reviews/BACKLOG.md` "M7 operator actions" (d). | `GET /actions/runs/35154814516/jobs`; job log filtered on `error|code:` |
| `argocd-apps.txt` | All 15 Argo CD Applications `Synced`; all `Healthy` except `cert-manager-issuers` (`Progressing`, see `cert-manager-live.txt`). Revision column shows the `main` commit each is at. | `kubectl -n argocd get applications -o custom-columns=...` |
| `argocd-modified-resources.txt` | After `bedbc29`, no resource under `notebook-api`, `gateway`, `authentik-resources` is reported `modified` by the Argo CD API (the SSA-default OutOfSync is gone). | Port-forward `svc/argocd-server`, `GET /api/v1/applications/<app>/managed-resources`, print items with `modified: true` and a live-vs-predicted field diff |
| `notebook-live.txt` | `notebook` CNPG Cluster healthy (1 instance), `notebook-api` Deployment 2/2 with the digest-pinned GHCR image, its NetworkPolicies and CiliumNetworkPolicies; exactly one CNPG operator and one barman plugin Deployment in `cnpg-system`. | `kubectl -n notebook get cluster,deploy,pods,cnp,netpol`; `kubectl -n notebook get deploy notebook-api -o jsonpath=.spec.template.spec.containers[0].image`; `kubectl -n cnpg-system get deploy` |
| `authentik-live.txt` | Authentik CNPG Cluster healthy, `authentik-server`/`authentik-worker` Running. | `kubectl -n authentik get cluster,deploy,pods` |
| `cilium-policies.txt` | Every CiliumNetworkPolicy in the cluster: kube-apiserver egress for each CNPG namespace, `fromEntities: [ingress]` on each HTTPRoute backend, cloudflared `toEndpoints` list. | `kubectl get cnp -A` |
| `cert-manager-live.txt` | `wildcard-ivanpanev-net` not Ready; the DNS-01 Challenge is `pending` with Cloudflare `9109`/`10502` because the token is IP-locked. Operator action (a) in BACKLOG. | `kubectl get certificate,challenge -A`; challenge `.status.reason` |
| `notes-api-public.txt` | `GET https://notes-api.ivanpanev.net/healthz` 200 `ok` through Cloudflare Tunnel → Gateway → notebook-api; `OPTIONS /v1/notebooks/abc` preflight 204 with `access-control-allow-origin: https://ivanpanev.net`; `HEAD https://ivanpanev.net/notes` 200 with CSP/HSTS; `http://www.ivanpanev.net/` 301 to the apex (Cloudflare Single Redirect). | `curl -sS -D - https://notes-api.ivanpanev.net/healthz`; `curl -sS -D - -o NUL -X OPTIONS -H "Origin: https://ivanpanev.net" -H "Access-Control-Request-Method: PUT" -H "Access-Control-Request-Headers: x-auth,content-type" https://notes-api.ivanpanev.net/v1/notebooks/abc`; `curl -sS -I https://ivanpanev.net/notes`; `curl -sS -I http://www.ivanpanev.net/` |
| `notes-roundtrip.txt` | Headless Chromium against production `/notes`: generate passphrase, open notebook (PUT 200), store an item (POST 201), reopen from a fresh browser context (PUT 200, GET 200), zero console errors. | `node notes-roundtrip.mjs` from `apps/web` (Playwright's Chromium) |
| `notes-roundtrip.mjs` | The script that produced `notes-roundtrip.txt`; uses no credentials. | — |

## Acceptance criteria for M7 (from the plan)

1. Repo secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` set via the
   GitHub API; `main` pushed. → `github-secrets.txt`, `git-log.txt`.
2. `web.yml` verify + deploy green; `notebook-api.yml` builds, signs and
   bumps the overlay digest. → `ci-runs.txt` (`notebook-api` success, digest
   bump commit `5cf81bc`/`chore(notebook-api): deploy` in `git-log.txt`);
   `web.yml` verify green, deploy **blocked by the operator's IP-locked
   token** (`web-deploy-failure.txt`, BACKLOG M7 (d)). The live site is the
   same `dist` as the verified artefact, deployed from the operator machine.
3. `root-application.yaml` applied, `hetzner-root` and children Synced/Healthy.
   → `argocd-apps.txt` (15/15 Synced; `cert-manager-issuers` Progressing on
   the same token issue).
4. `notes-api.ivanpanev.net/healthz` 200 with CORS; `/notes` round-trip in a
   browser. → `notes-api-public.txt`, `notes-roundtrip.txt`.
5. Follow-ups that unblock M5/M6 operator items are recorded, not executed.
   → `docs/reviews/BACKLOG.md` "M7 operator actions" (a)–(d).

## Not verified by the pack

- The Playwright `notes` spec in `apps/web/tests/e2e/notes.spec.ts` was not
  run against production: `playwright.config.ts` hard-codes
  `baseURL` to the local preview server and has no production target.
  `notes-roundtrip.mjs` is a standalone equivalent that drives the same UI.
