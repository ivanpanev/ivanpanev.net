# Evidence pack: Milestone 3 round 3 (Argo CD and platform services)

Generated 2026-09-16 on the Windows workstation against the live Hetzner cluster.
Commands that print secrets were not captured. Files are UTF-8.

| File | Command | Expected |
| --- | --- | --- |
| `k8s-validate.txt` | `bash scripts/k8s-validate.sh` (re-run 2026-09-16 r3) | exit 0; `k8s-validate: ok` |
| `kubeconform.txt` | copy of `k8s-validate.txt` | same |
| `tree.txt` | `find k8s .github/workflows/k8s-validate.yml -type f` | M3 YAML present |
| `sops-filestatus.txt` | `sops filestatus` on every `k8s/**/*.secret.yaml` | encrypted true |
| `pods.txt` | `kubectl get pods -A` | platform Running |
| `httproutes.txt` | `kubectl -n gateway get gateway,httproute,svc` | Gateway Programmed |
| `pdb.txt` | `kubectl get pdb -A` | cloudflared + coredns |
| `netpol.txt` | `kubectl get netpol -A` | loki, monitoring, hubble, argocd, gateway, cloudflared |
| `argocd-cm-exec.txt` | `kubectl -n argocd get cm argocd-cm` keys | `exec.enabled` false; kustomize `--enable-exec` |
| `loki-status.txt` | `kubectl -n loki get pods,sts` | loki-0 1/1 |
| `loki-s3-logs.txt` | `kubectl -n loki logs sts/loki -c loki --since=5m` after STS restart | **zero** Access Denied; flush + `finished uploading table loki_index_20712` |
| `loki-query.txt` | in-cluster curl LogQL `{namespace="cloudflared"}` (2h range) | status=success; cloudflared streams |
| `s3-put-probe.txt` | `curl --aws-sigv4` List/Put/versioning/PAB/policy; no keys printed | PUT 200; PAB 404; versioning Suspended; chunks+index prefixes |
| `terraform-s3-state.txt` | `terraform state list` grep s3; plan versioning loki | no PAB resources; loki versioning no-op Suspended |
| `access-curl.txt` | `curl -sI` grafana/argocd/hubble/notes-api | 302 / 404; Location JWTs redacted |
| `helm-list.txt` | `helm list -A` | pinned chart versions |
| `no-lb.txt` | LoadBalancer Service list | empty / 0 |
| `sync-waves.md` | static table | resources wave 1 |
| `limits.md` | static table from manifests | requests+limits |
| `helm-*.txt` | prior `helm template` transcripts | exit 0 |

## Round 3 notes

- F01 closed: Hetzner `PublicAccessBlock` (and Loki bucket versioning Enabled) caused authenticated PutObject 403. Key already had write. PAB gone; Loki versioning Suspended; Loki restarted; LogQL works.
- Do not apply `k8s/clusters/hetzner/root-application.yaml` until GitHub `main` has the k8s tree.
