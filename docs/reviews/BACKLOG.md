# Review backlog

Low and Nit findings from gauntlet reviews that were not fixed in their
milestone, plus operator actions the builder cannot perform. Each entry keeps
its original finding ID so it can be traced to the report that raised it.
Remove entries when fixed and reference the commit.

| Finding | Milestone | Severity | Summary | Status |
| --- | --- | --- | --- | --- |
| M0-R1-F20 | M0 | Nit | `C:\Users\doubl` (the operator's home directory) is an empty git repository; a `git add`/`commit` from the wrong directory would stage the home directory including `%APPDATA%\sops\age\keys.txt`. Operator action: `Remove-Item -Recurse -Force C:\Users\doubl\.git` if that repository is not intentional, or add `C:\Users\doubl\.gitignore` containing `*`. | Open (operator) |
| M0-R3-F04 | M0 | Nit | `setup-windows.ps1` robustness: `Get-ExpectedDigest` should accept an empty string (`[AllowEmptyString()]`) and use `[ \t]+` rather than `\s+`; set `$ProgressPreference='SilentlyContinue'` around `Invoke-WebRequest -OutFile`; user PATH rewrite as `REG_SZ` expands `%VAR%` entries; map common winget HRESULTs (`0x8A15002B` no applicable upgrade) to a one-line explanation. | Open |
| M1 TypeScript 7 | M1 | - | `typescript` pinned to `~6.0` because `@astrojs/check` rejects TS 7. Lift the pin when Renovate's TS 7 PR passes `pnpm check` (ADR-0003). | Open |
| M1 operator actions | M1 | - | Run `docs/runbooks/pgp-key-ceremony.md` and commit `apps/web/src/pgp/publickey.asc`; create Cloudflare API token + `CLOUDFLARE_ACCOUNT_ID` in GitHub environments `preview` and `production`; add custom domains via first `wrangler deploy`; confirm `/.well-known/openpgpkey/hu/<hash>` from production with `gpg --locate-keys`; curl `www` → apex 301 and HSTS on `/.well-known/security.txt`. | Open (operator) |
| M2-R1-F08 | M2 | Low | Talos backup Job defaults to project-wide S3 keys that can also read `ivp-tfstate` / `ivp-cnpg`. Mint an `ivp-etcd`-only pair in the Hetzner console and set `talos_backup_s3_access_key` / `talos_backup_s3_secret_key` together. | Open (operator) |
| M2-R2-F01 | M2 | Low | Backup S3 key pair not validated together. | Fixed after passing review (`terraform_data` precondition) |
| M2-R2-F02 | M2 | Nit | Duplicate `kubectl get nodes` in bootstrap verify. | Fixed after passing review |
| M2 operator verification | M2 | - | Live `terraform plan`/`apply` both roots; firewall/LB/Access/Email/rate-limit checks in `m2-r2.md` Operator verification; `sops filestatus` on `k8s/infrastructure/cloudflared/tunnel.secret.yaml` after encrypt. | Open (operator) |
| M3-R1-F10 | M3 | Low | Prometheus Operator CRDs (Talos/hcloud-k8s v0.93.1) vs kube-prometheus-stack operator v0.94.0 with `crds.enabled: false`. Align pins or install matching CRDs on a wave-0 Application. | Open |
| M3-R1-F11 | M3 | Low | CiliumGatewayClassConfig skipped by kubeconform (`-ignore-missing-schemas`). Add the Cilium CRD schema so `spec.service.type` typos fail CI. | Open |
| M3-R2-F05 | M3 | Low | Chart `argocd-server` NetworkPolicy allows all in-cluster ingress. Restrict to gateway / kube-system. | Open |
| M3-R3-F01 | M3 | Low | `applicationSet.enabled: false` but `argocd-applicationset-controller` still Running (helm rev 3). Helm upgrade or wave-4 self-management after `main` exists. | Open |
| M4-R1-F11 | M4 | Low | Floating CNPG `:18` and unpinned Dockerfile bases; overlay `:main` until first CI digest bump. | Open |
| M4-R1-F12 | M4 | Low | OTel SDK is a no-op: no `OTEL_EXPORTER_OTLP_ENDPOINT`, NetworkPolicy would drop OTLP. `LOG_LEVEL` is wired. | Open |
| M4-R1-F13 | M4 | Low | Playwright notes e2e still skips image/delete/extend; `Notes.tsx` has no unit coverage. Drop target exists. | Open |
| M4-R2-F01 | M4 | Low | `pg_advisory_lock` is not pinned to `db.Conn()`; serialisation relies on `sql.Open` + `Close()`. | Open |
| M4-R2-F02 | M4 | Low | Island file picker allows 20 MiB files that expand past `MaxItemBytes` after envelope+GCM. | Open |
| M4-R2-F03 | M4 | Low | Browser `fetch` for notebook-api has no AbortSignal/retry. | Retry on 429 with `Retry-After` and readable network errors landed with M7-R1-F01; AbortSignal still open |
| M4 operator verification | M4 | - | Push `main` for GHCR+cosign+overlay bump; live CNPG/WAL/`/notes` round-trip; Grafana `job="notebook-api"`; `sops filestatus` on `cnpg-s3.secret.yaml`. | Open (operator) |
| M5-R1-F06 | M5 | Low | Restore Cluster floats `postgresql:18`, same unpinned tag as live (M4-R1-F11). Pin restore and live to the same digest before the first drill. | Open |
| M5-R3-F01 | M5 | Nit | `LokiObjectStoreErrors` second clause `{status_code=~"403|5.."}` is empty on Thanos `loki_objstore_*` (labels are `operation`). First clause still fires. Drop the status_code matcher. | Open |
| M5 operator verification | M5 | - | After `main` + first Barman backup: `bash scripts/restore-drill.sh`, attach transcript, confirm skipWalArchiving and no WAL writes, teardown. PGP ceremony + `security.txt.asc`. First Hetzner invoice into `docs/cost.md`. Grafana: platform rule loaded; `loki_objstore_bucket_operation_failures_total` and CNPG WAL series exist. Do not recreate PAB / Enable loki versioning. Do not apply `root-application.yaml` until GitHub `main` has the k8s tree. | Open (operator) |
| M6-R1-F05 | M6 | Low | Authentik Cluster floats `postgresql:18` (same as M4-R1-F11 / M5-R1-F06). Pin before the first authentik backup is treated as restorable. | Open |
| M6-R2-F01 | M6 | Nit | `k8s-validate.sh` greps values.yaml for `AUTHENTIK_POSTGRESQL__HOST` rather than the helm-rendered env. | Open |
| M6 operator verification | M6 | - | After `main` syncs Authentik: Cluster Ready, `authentik-server` 1/1, logs use `authentik-rw` not localhost, `authentik-app` exists, complete `/if/flow/initial-setup/` behind Access. Attach to `docs/reviews/evidence/m6/live.txt`. Confirm Access policy is operator email only. Do not set `hostnames.auth.public = true`. | Open (operator) |
| M9-R1-F01 | M9 | Low | httptest lockout server still injects 1h–7d TTL caps; add one case on env defaults so a 24h PUT is 400. | Open |
| M10-R1-F01 | M10 | Low | Colour loupe is a hex chip, not a magnified ImageData crop. | Open |
| M11-R1-F01 | M11 | Low | Merge view edits are not written back into tabs before cloud save. | Open |
| M7 operator actions | M7 | - | Token scopes for (a) and (d) are in `docs/toolchain.md` "Cloudflare API tokens"; do not copy them here. (a) Mint the cert-manager DNS-01 token, re-encrypt `k8s/infrastructure/cert-manager-issuers/cloudflare-api-token.secret.yaml` with sops, re-add `certificate.yaml` to that kustomization (parked by M7-R1-F04), confirm `wildcard-ivanpanev-net` Ready. The current secret holds the operator's IP-locked account token, which fails from the nodes with `9109`. (b) Authentik `/if/flow/initial-setup/` behind Access (carried from M6). (c) First Barman backup then `scripts/restore-drill.sh` (carried from M5). (d) Mint the `web.yml` deploy token and replace `CLOUDFLARE_API_TOKEN` in the `production` and `preview` environments (same IP-lock failure from GitHub runners, `web-deploy-failure.txt`); re-run the latest `web.yml` and confirm `deploy to production` is green. The live site was deployed from the operator machine meanwhile. (e) Commit signing (ADR-0012): add an SSH or OpenPGP signing key to the GitHub account, set `git config commit.gpgsign true` on every operator machine, then add the `required_signatures` rule to the `main` ruleset and Argo CD `signatureKeys` on the project; the PAT in use cannot manage account signing keys, so this stays with the operator. (f) Roll the operator account token after (a) and (d) since it has been present in CI and in a cluster Secret. | Open (operator) |
| M1-R2-F01 | M1 | Low | WKD unit test pinned `publickey.asc` as untracked, which would fail CI after the ceremony. | Fixed after passing review |
| M0 operator verification | M0 | - | From `m0-r3.md`: full `setup-wsl.sh` run on a Linux machine; `setup-windows.ps1` install run + `check-toolchain.ps1`; revocation drill executed once (attach output); first green `hygiene.yml` run URL; Renovate app installed. Attach transcripts to `docs/reviews/evidence/m0/`. | Open (operator) |

Fixed after the passing review (same day, not re-reviewed): M0-R3-F01
(scope-aware shadowing message, PATH untouched on failed install,
`check-toolchain.ps1` reports shadowed pinned binaries), M0-R3-F02
(`.sops.yaml` header uses `rotate --in-place --rm-age`), M0-R3-F03
(evidence files restored, MANIFEST corrected, `tree.txt` regenerated after
staging).
