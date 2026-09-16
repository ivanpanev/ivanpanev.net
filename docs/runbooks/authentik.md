# Runbook: Authentik (OIDC IdP)

Authentik is the Phase 2 identity provider (ADR-0016). It lives in namespace
`authentik`, stores state in CloudNativePG, and is reached at
`https://auth.ivanpanev.net` behind Cloudflare Access (operator OTP). Grafana
and Argo CD still use their Phase 1 Access paths until a later federation
milestone.

This overlay is an Argo CD Application (`authentik-resources` wave 3,
`authentik` Helm wave 4). Do not apply `root-application.yaml` until GitHub
`main` contains the k8s tree.

## Preconditions

- CNPG operator and Barman Cloud plugin Running (`cnpg-system`).
- Secrets `authentik/cnpg-s3` and `authentik/authentik-config` exist (KSOPS).
  Postgres owner credentials are the CNPG-generated Secret `authentik-app`
  (not SOPS). Do not print values.
- Terraform `hostnames.auth.public = false` so Access wraps the hostname.
- ~10 Gi free on the `default` StorageClass plus ~2 GiB RAM on a worker.

## First login (bootstrap)

Until the cluster is GitOps-synced from `main`, this stays operator-verify.

1. Confirm Access: open `https://auth.ivanpanev.net` — Cloudflare OTP for the
   operator email, then Authentik.
2. If no admin exists yet, Authentik serves `/if/flow/initial-setup/`. Create
   the operator admin there. Do not create a public recovery email until SMTP
   is configured (not in this milestone).
3. Confirm `kubectl -n authentik get cluster authentik` is Ready and
   `deploy/authentik-server` has 1/1. Logs must mention host `authentik-rw`,
   not `localhost:5432`.

## Verify

```bash
kubectl -n authentik get cluster,pod,pvc,deploy,secret
kubectl -n gateway get httproute auth
kubectl -n authentik logs -l app.kubernetes.io/component=server --tail=80 | grep -E 'authentik-rw|localhost'
# list keys only
aws --endpoint-url https://fsn1.your-objectstorage.com s3 ls s3://ivp-cnpg/authentik/
```

`auth.ivanpanev.net` must stay `public = false`. Changing that in Terraform
would put the IdP on the internet.

CrashLoop with Cluster Ready: check `AUTHENTIK_POSTGRESQL__HOST` is
`authentik-rw` (`kubectl -n authentik get deploy authentik-server -o yaml`)
and that Secret `authentik-app` exists. localhost means the env was dropped.

## Secret rotation

`authentik-config` (`AUTHENTIK_SECRET_KEY`) is SOPS. After changing it,
bump `ivp.net/config-epoch` on `server.podAnnotations` and
`worker.podAnnotations` in `k8s/apps/authentik/values.yaml` **or**

```bash
kubectl -n authentik rollout restart deploy/authentik-server deploy/authentik-worker
```

The chart’s `checksum/secret` is empty when `existingSecret` is set and will
not roll pods by itself. Postgres password lives in `authentik-app` (CNPG);
rotate that only via CNPG, then restart the same Deployments.

## Restore

Same pattern as `docs/runbooks/restore-drill.md`: scratch namespace, skip WAL
archiving, recover from `s3://ivp-cnpg/authentik` with `serverName: authentik`.
Do not add a restore overlay to `k8s/clusters/hetzner`.

## Rollback

Revert `k8s/apps/authentik/values.yaml` (chart pin) and the Cluster spec via
Git. Do not delete `s3://ivp-cnpg/authentik`.

## What this milestone does not do

- Cloudflare Access identity provider = Authentik (federation).
- Grafana `auth.generic_oauth` / Argo CD OIDC.
- SMTP for recovery emails.
- Friends-and-family accounts beyond the operator admin.
