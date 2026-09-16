# Evidence pack: Milestone 5 (hardening)

Generated 2026-09-16. Live CNPG restore is operator-verify: GitHub `main`
does not yet contain the k8s tree, so the notebook Cluster has never been
synced and no Barman backup exists to restore. Do not apply
`root-application.yaml`.

| File | Command | Expected |
| --- | --- | --- |
| `k8s-validate.txt` | `bash scripts/k8s-validate.sh` | `check-alerts: ok (11 alerts)`; restore overlay requires `cnpg.io/skipWalArchiving: enabled` and forbids `spec.plugins` / `isWALArchiver: true`; `k8s-validate: ok` |
| `check-alerts.txt` | `bash scripts/check-alerts.sh` | `check-alerts: ok (11 alerts)`; each `## AlertName` in `docs/runbooks/incidents.md` |
| `lighthouse-summary.txt` | copied from M1 pack; `lighthouserc.cjs` now `minScore: 1` | 100/100/100/100 on five URLs × 3 runs (M1). Not re-run this round (same pages; /notes excluded). |

Documents in tree (not command output):

- `docs/runbooks/restore-drill.md` + `k8s/apps/notebook-restore/` + `scripts/restore-drill.sh`
- `k8s/infrastructure/kube-prometheus-stack/resources/platform-alerts.yaml`
- `docs/runbooks/incidents.md`
- `docs/security/platform-threat-model.md`
- `docs/cost.md`
- `docs/migration-readiness.md`
- `docs/architecture.md` (M4 PASS, M5 pending review)
- CSP: Astro meta + `_headers` `frame-ancestors` are enforce; Report-Only intentionally absent
- `security.txt.asc`: ceremony step; `check-dist.mjs` requires it after `publickey.asc` exists

## Not executable on this workstation

| Check | Why | Where it runs instead |
| --- | --- | --- |
| Live restore drill | no Barman backup until notebook Cluster is GitOps-synced from `main` | operator after first nightly/one-shot Backup; attach transcript to `restore-drill.txt` |
| First-month Hetzner invoice | cluster applied 2026-09-16 | paste Actual column in `docs/cost.md` |
| Detached `security.txt.asc` | PGP ceremony not done (`publickey.asc` absent) | `docs/runbooks/pgp-key-ceremony.md` |
| Re-run `pnpm lhci` | 15+ min; M1 already 100/100/100/100 on the same five URLs | CI `web.yml`; budgets now `minScore: 1` |

## Operator verification required

- After `main` + first backup: `bash scripts/restore-drill.sh`, attach `kubectl get cluster,pod -n notebook-restore` to this pack, then teardown.
- Grafana Alerting: confirm PrometheusRule `monitoring/platform` is loaded. Do not use Watchdog as a user-visible test (it is routed to `null`).
- Paste first full-month invoice into `docs/cost.md`.
- Sign `security.txt` after the key ceremony.
