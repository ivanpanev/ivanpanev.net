# notebook-api

Operate the passcode notebook API on the Hetzner cluster.

## Preconditions

- `kubectl` using `infra/terraform/hetzner/kubeconfig` (gitignored).
- GitHub `main` contains this tree so Argo CD can sync. Do not apply
  `k8s/clusters/hetzner/root-application.yaml` until that is true.
- `notebook-api.yml` has published `ghcr.io/ivanpanev/notebook-api:<sha>@sha256:…`
  and bumped `k8s/apps/notebook-api/overlays/hetzner`.

## Expected objects

| Object | Notes |
| --- | --- |
| Namespace `notebook` | PSA `restricted` |
| Secret `cnpg-s3` | KSOPS from `cnpg-s3.secret.yaml`; keys `ACCESS_KEY_ID` / `ACCESS_SECRET_KEY` |
| ObjectStore `notebook` | `s3://ivp-cnpg/notebook` |
| Cluster `notebook` | 1 instance, 10 Gi, plugin WAL |
| Secret `notebook-app` | CNPG-generated; Deployment reads `uri` |
| Deployment `notebook-api` | 2 replicas, image from overlay digest |
| HTTPRoute `notes-api` | `/v1`, `/healthz`, `/readyz`, `/openapi.yaml` only — not `/metrics` |

## Verify

```
kubectl -n notebook get cluster notebook
kubectl -n notebook get pods
kubectl -n notebook get secret notebook-app
curl -sS https://notes-api.ivanpanev.net/healthz
curl -sS https://notes-api.ivanpanev.net/readyz
curl -sS https://notes-api.ivanpanev.net/metrics   # must not be 200 from the edge
```

List WAL prefixes only (do not print object bodies or keys):

```
# aws s3 ls s3://ivp-cnpg/notebook/ --endpoint-url https://fsn1.your-objectstorage.com
```

Auth behaviour: `GET /v1/notebooks/{id}/items` is empty for both unknown and
empty notebooks. `PUT` with the wrong `X-Auth` on a live notebook is 401.

## First-sync failure modes

| Symptom | Cause | Rollback |
| --- | --- | --- |
| ImagePullBackOff | CI has not pushed the image | wait for overlay digest; do not retag `:main` by hand |
| CreateContainerConfigError secret `notebook-app` | CNPG still bootstrapping | wait; API pods start when the secret exists |
| CrashLoop `goose up` / already exists | should not happen; migrate takes `pg_advisory_lock` | `kubectl -n notebook logs deploy/notebook-api` |
| 403 PutObject on Barman | same Hetzner Ceph trap as Loki: do not set PublicAccessBlock; do not Enable versioning on a Loki-like bucket. `ivp-cnpg` versioning stays Enabled (M3). | check sidecar checksum env on ObjectStore |

## Rollback

Revert the overlay kustomize image commit. Argo CD prunes the new ReplicaSet.
Postgres data remains; restore is `docs/runbooks/restore-drill.md` (M5).
