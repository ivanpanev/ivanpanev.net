# Platform threat model (updated Milestone 6)

This is the cluster-and-edge model. The notebook crypto model lives in
[notebook-threat-model.md](notebook-threat-model.md). Numbers that follow
are Phase 1 facts, not aspirations.

## Assets

| Asset | Where it lives | If lost |
| --- | --- | --- |
| Static site | Cloudflare Workers Static Assets | Rebuild from Git, `wrangler deploy` |
| notebook ciphertext | CNPG on Hetzner volume + WAL in `ivp-cnpg` | Restore drill; operator cannot decrypt |
| Grafana / Argo / Hubble / Authentik | In-cluster, Tunnel + Access | Rebuild from Git |
| Cluster identity | etcd on one CX23 | `etcd-restore.md`; RTO 4h (ADR-0004) |
| Age private keys | Operator workstation + `argocd/sops-age` | Re-encrypt with new recipients |
| Tunnel token | SOPS in Git + live Secret | Rotate in Cloudflare, re-encrypt |
| Authentik identity | CNPG `authentik` + WAL in `ivp-cnpg/authentik` | Restore like notebook; Access still gates the UI |

## Trust boundaries

1. **Browser → Cloudflare.** Public: apex, www, `notes-api`. Admin:
   `grafana`, `argocd`, `hubble`, `auth` require Access OTP for the operator email.
   Access JWT is consumed by Grafana (ADR-0014). notes-api is rate-limited
   at `/v1/*` (10/10s) plus the application token bucket.
2. **Cloudflare → cluster.** One Tunnel, two `cloudflared` replicas, one
   Cilium Gateway (NodePort+ClusterIP). No Hetzner Load Balancer. Spoofed
   `CF-Connecting-IP` only matters from pods that can reach the notebook
   Service (NetworkPolicy: gateway + monitoring).
3. **Git → cluster.** Argo CD reconciles `main`. KSOPS `--enable-exec` means
   write-to-`main` is cluster-admin plus secret-read (ADR-0006). Mitigations:
   signed commits + CI, one-repo restriction, repo-server no SA token,
   read-only root.
4. **Operator CIDR → Kubernetes/Talos APIs.** Firewall from Terraform.
   Compromised workstation with kubeconfig is cluster-admin. Age key on the
   same workstation is the SOPS operator recipient.
5. **CNPG / Loki → Hetzner Object Storage.** S3 credentials from SOPS.
   PublicAccessBlock on these buckets 403s PutObject on Hetzner Ceph; it
   must stay unset. `ivp-loki` versioning must stay Suspended.

## Attack sketches

| Sketch | Mitigation | Residual |
| --- | --- | --- |
| Guess a notebook passcode online | Argon2id 64MiB/3/1, CF 10/10s, app 2 r/s | Shared passcode = shared notebook |
| Steal GHCR image and wait for unsigned `:main` | CI cosign keyless + overlay digest bump | Overlay is `:main` until first CI |
| Push a KSOPS exec plugin to `main` | Protected `main`, signed commits | Operator laptop compromise |
| Reach Grafana or Authentik without Access | Tunnel `origin_request.access.required` | Cloudflare outage = admin UI down (accepted) |
| Read `ivp-tfstate` with the backup S3 key | Mint an `ivp-etcd`-only pair (BACKLOG M2-R1-F08) | Project-wide keys until then |
| Loki PutObject 403 again | No PAB, versioning Suspended, LokiObjectStoreErrors (`incidents.md#lokiobjectstoreerrors`) | Console click can re-break it |
| PSA privileged monitoring namespace | node-exporter/Alloy need hostPath; comment forbids new privileged pods | Grafana shares the namespace (M3 accepted) |

## Supply chain

- GitHub Actions SHA-pinned (ADR-0012).
- notebook-api: govulncheck, golangci-lint, cosign keyless, SLSA attestation.
- Helm charts pinned by version in `scripts/k8s-validate.sh` and Application specs.
- Distroless non-root for notebook-api.

## Out of scope here

Home-cluster hardware, passcode KDF parameters (notebook model), PGP
ceremony (operator action until `publickey.asc` exists).
