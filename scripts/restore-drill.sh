#!/usr/bin/env bash
# Restore the notebook CloudNativePG cluster from object storage into a
# scratch namespace. Does not touch the live Cluster. See
# docs/runbooks/restore-drill.md.
set -euo pipefail

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"

command -v kubectl >/dev/null 2>&1 || { echo "kubectl is required" >&2; exit 2; }
command -v kustomize >/dev/null 2>&1 || { echo "kustomize is required" >&2; exit 2; }

NS=notebook-restore
SRC_NS=notebook
SRC_SECRET=cnpg-s3

echo "==> copying ${SRC_NS}/${SRC_SECRET} into ${NS} (keys only, values not printed)"
kubectl get ns "$NS" >/dev/null 2>&1 || kubectl apply -f k8s/apps/notebook-restore/namespace.yaml
py=
for c in python3 python py; do
  if command -v "$c" >/dev/null 2>&1; then py=$c; break; fi
done
if [[ -z "$py" ]]; then
  echo "python is required to copy the Secret without managedFields" >&2
  exit 2
fi
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
kubectl get secret "$SRC_SECRET" -n "$SRC_NS" -o json | "$py" -c '
import json, sys
d = json.load(sys.stdin)
json.dump({
    "apiVersion": "v1",
    "kind": "Secret",
    "type": d.get("type", "Opaque"),
    "metadata": {"name": d["metadata"]["name"], "namespace": "'"$NS"'"},
    "data": d["data"],
}, sys.stdout)
' > "$tmp"
kubectl apply -f "$tmp"

echo "==> applying restore overlay (no WAL archiving)"
kustomize build k8s/apps/notebook-restore | kubectl apply -f -

echo "==> waiting for Cluster/${NS} Ready (up to 15m)"
kubectl -n "$NS" wait --for=condition=Ready cluster/notebook-restore --timeout=15m

echo "==> verify: listing databases (passwords not printed)"
kubectl -n "$NS" get cluster notebook-restore
echo "restore-drill: cluster Ready. Next: docs/runbooks/restore-drill.md §Verify then §Teardown."
