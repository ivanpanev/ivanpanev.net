# Milestone 3 remediations

## Round 2 → round 3

| Finding | Change |
| --- | --- |
| M3-R1-F01 | **Not a key-permission gap.** Same SOPS `loki-s3` pair as `terraform.tfvars` `s3_access_key` (AK 20 / SK 40, sha match live Secret). Official `curl --aws-sigv4` List/ACL 200 FULL_CONTROL owner `p16054724`; GetBucketPolicy 404. CreateBucket `ivp-write-probe` + PutObject 200. `DeletePublicAccessBlock` on `ivp-loki` made PutObject 200; re-Enable versioning on that bucket made PutObject 403 again; Suspend restored 200. PAB deleted on all four buckets (204). Terraform: removed `aws_s3_bucket_public_access_block` from `buckets.tf`, `state rm` the four instances so the next apply cannot recreate them; `aws_s3_bucket_versioning` for `loki` is `Suspended` (cnpg/etcd/tfstate stay Enabled). Loki STS restarted; logs since restart have **zero** Access Denied; `ivp-loki` holds `fake/` chunks and `index/loki_index_20712`; in-cluster LogQL `{namespace="cloudflared"}` returns streams. |

## Round 1 → round 2

| Finding | Change |
| --- | --- |
| M3-R1-F01 | Code: `singleBinary.extraEnv` `AWS_REQUEST_CHECKSUM_CALCULATION`/`AWS_RESPONSE_CHECKSUM_VALIDATION=when_required`, `AWS_EC2_METADATA_DISABLED=true`, `loki.analytics.reporting_enabled: false`, `loki.storage.use_thanos_objstore: true` with `bucket_lookup_type: path`, sidecar off. Live helm upgrade to revision 5; Loki 1/1 Ready. **PutObject still 403 AccessDenied.** Workstation MinIO and SigV4: ListObjectsV2=200, PutObject=403 on `ivp-loki`/`ivp-tfstate`/`ivp-cnpg`/`ivp-etcd` with the same key pair as `terraform.tfvars` `s3_access_key` (lengths only: AK 20 / SK 40). No bucket policy (`NoSuchBucketPolicy`). Destroying `aws_s3_bucket_public_access_block` did not change PUT (blocks restored). This is a Hetzner Object Storage **key permission** gap, not Loki config. Operator: in Hetzner Console → Object Storage → Access Keys, ensure this key has **write** (not list-only) and no bucket policy `Deny` on `s3:PutObject`. Then confirm a `probe/` object appears in `ivp-loki` and Loki logs have no `Access Denied`. |
| M3-R1-F02 | Removed `configs.cm.exec.enabled`. Live `argocd-cm` has no `exec.enabled` (false). KSOPS still uses `kustomize.buildOptions --enable-exec`. Helm Argo CD revision 3. |
| M3-R1-F03 | `k8s-validate.yml` `sha256sum -c` on helm 4.3.0 (`86584a54…`), kustomize 5.8.1 linux-amd64 (`029a7f0f…`), kubeconform 0.8.0 linux-amd64 (`9bc2bffb…`). |
| M3-R1-F04 | `kube-prometheus-stack-resources` and `loki-resources` moved to wave 1 (Helm stays 2 and 3). Barman Application has `CreateNamespace=true`. |
| M3-R1-F05 | NetworkPolicies: Loki (ingress 3100/9095 from monitoring; egress DNS + kube API 443/6443 + S3 443), monitoring (ingress from monitoring/gateway/kube-system; egress all), Hubble UI (ingress from gateway). Argo CD chart `global.networkPolicy.create` remains true. Applied live. |
| M3-R1-F06 | Accepted: `monitoring` stays PSA privileged. node-exporter and Alloy filesystem-log-reader need hostPath; a second host-tools namespace would still be privileged and would split ServiceMonitors on a two-worker cluster. Comment on `namespace.yaml` records this. |
| M3-R1-F07 | CoreDNS PDB `minAvailable: 1` in `k8s/infrastructure/gateway/kube-system.yaml`. Live PDB exists. |
| M3-R1-F08 | Evidence `tree.txt` regenerated from the working tree; `kubeconform.txt` is the k8s-validate transcript. |
| M3-R1-F09 | `cloudflared:2025.11.1@sha256:89ee50ef…` and `viaductoss/ksops:v4.5.1@sha256:4def9fdd…` (Docker Hub index digests). RollingUpdate `maxSurge: 0` / `maxUnavailable: 1` so topology-spread DoNotSchedule can roll. Live 2/2 digest-pinned. |
| M3-R1-F10 | Deferred to BACKLOG (Prometheus Operator CRD v0.93.1 vs chart operator v0.94.0). |
| M3-R1-F11 | Deferred to BACKLOG (CiliumGatewayClassConfig kubeconform schema). |
