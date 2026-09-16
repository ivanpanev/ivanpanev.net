# Runbook: CloudNativePG restore drill

Restore the `notebook` Postgres cluster from Barman objects in `ivp-cnpg`
into a scratch namespace. The live Cluster is not modified. WAL archiving
is disabled on the restore Cluster so the drill cannot write into the live
prefix `s3://ivp-cnpg/notebook`.

This overlay is **not** an Argo CD Application. Applying
`k8s/clusters/hetzner` must never create `notebook-restore`.

## Preconditions

- `KUBECONFIG` for the Hetzner cluster.
- CNPG operator and Barman Cloud plugin Running (`cnpg-system`).
- Live Cluster `notebook/notebook` has completed at least one backup
  (`kubectl -n notebook get backup`) **or** WAL objects exist under
  `s3://ivp-cnpg/notebook` (list keys only, no contents).
- Secret `notebook/cnpg-s3` exists (KSOPS). Do not print its values.
- ~10 Gi free on the `default` StorageClass.

If GitHub `main` does not yet contain the k8s tree, do not apply
`root-application.yaml`. This drill still works against a cluster that
already has the operator and a backed-up Cluster.

## 1. Confirm a restore point exists

```bash
kubectl -n notebook get cluster notebook
kubectl -n notebook get backup
kubectl -n notebook get scheduledbackup
# list object keys only:
aws --endpoint-url https://fsn1.your-objectstorage.com s3 ls s3://ivp-cnpg/notebook/
```

Do not `GetObject` WAL files. Empty prefix → stop; take a one-shot Backup
first (`kubectl -n notebook apply` a `Backup` CR, or wait for 02:00 UTC).

## 2. Apply the scratch cluster

```bash
bash scripts/restore-drill.sh
```

The script copies `cnpg-s3` into `notebook-restore` (metadata rewrite only)
and applies `k8s/apps/notebook-restore`. Wait is `Cluster` condition Ready,
up to 15 minutes.

Manual equivalent:

```bash
kubectl apply -f k8s/apps/notebook-restore/namespace.yaml
kubectl get secret cnpg-s3 -n notebook -o json \
  | python -c 'import json,sys; d=json.load(sys.stdin); d["metadata"]={"name":"cnpg-s3","namespace":"notebook-restore"}; d.pop("status", None); print(json.dumps(d))' \
  | kubectl apply -f -
kustomize build k8s/apps/notebook-restore | kubectl apply -f -
kubectl -n notebook-restore wait --for=condition=Ready cluster/notebook-restore --timeout=15m
```

## 3. Verify

- `kubectl -n notebook-restore get cluster notebook-restore` → Ready.
- Instance pod `notebook-restore-1` Running, not CrashLoop.
- `kubectl -n notebook-restore exec -it notebook-restore-1 -c postgres -- psql -U postgres -d notebook -c '\dt'` shows `notebooks` and `items` (or empty if the backup was taken before any traffic). Do not dump ciphertext.
- Compare `SELECT count(*) FROM notebooks;` against the live cluster if both are up. Counts may differ by TTL sweep; a zero vs non-zero mismatch after a known write is a failed drill.
- Confirm the restore Cluster has `cnpg.io/skipWalArchiving: enabled` and **no** `spec.plugins` (`kubectl -n notebook-restore get cluster notebook-restore -o yaml`). `k8s-validate.sh` fails if the overlay enables a WAL-capable plugin or omits the skip annotation.

Attach the `kubectl get cluster,backup,pod -n notebook-restore` transcript to `docs/reviews/evidence/m5/restore-drill.txt`. Redact secrets.

## 4. Teardown

```bash
kubectl delete cluster notebook-restore -n notebook-restore --wait=true
kubectl delete ns notebook-restore
```

The PVC is deleted with the Cluster when the reclaim policy is Delete
(StorageClass `default`). Confirm `kubectl get pvc -n notebook-restore`
is empty before deleting the namespace if the Cluster stuck.

Do **not** delete objects in `s3://ivp-cnpg/notebook`.

## Rollback

A failed drill leaves the live Cluster alone. Delete the scratch
namespace. If you accidentally enabled WAL archiving on the restore
Cluster, stop it immediately (`kubectl delete cluster notebook-restore`)
and inspect `s3://ivp-cnpg/notebook` for unexpected prefixes; live
recovery still uses `serverName: notebook`.

## When this is the wrong tool

- Control-plane disk loss: `docs/runbooks/etcd-restore.md` first, then this.
- Application bug: revert Git, do not restore Postgres over a good WAL.
- Migrating to the home cluster: new Cluster with `bootstrap.recovery`
  from the same ObjectStore (ADR-0008), not this scratch namespace.
