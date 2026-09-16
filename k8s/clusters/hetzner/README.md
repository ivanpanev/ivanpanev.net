# hetzner cluster

App-of-apps for the Falkenstein cluster. The root Application
(`root-application.yaml`) is applied once by
[argocd-bootstrap.md](../../../docs/runbooks/argocd-bootstrap.md) and is
intentionally **not** listed in `kustomization.yaml` (chicken-and-egg).

| Wave | Application | Path / chart |
| --- | --- | --- |
| 0 | gateway | `k8s/infrastructure/gateway` GatewayClass (NodePort CGCC, ClusterIP still allocated) + HTTPRoutes |
| 1 | cloudflared | `k8s/infrastructure/cloudflared` (KSOPS tunnel token) |
| 1 | cert-manager-issuers | Cloudflare DNS-01 ClusterIssuer |
| 2 | cnpg-operator | `cnpg/cloudnative-pg` 0.29.0 |
| 2 | barman-cloud | `cnpg/plugin-barman-cloud` 0.8.0 |
| 2 | kube-prometheus-stack | chart 91.4.1 + SOPS secrets |
| 3 | loki | `grafana-community/loki` 18.11.7 Monolithic |
| 3 | k8s-monitoring | chart 4.5.2 logs + events |
| 4 | argocd | self-manage `argo/argo-cd` 10.9.1 |

Hubble UI is Cilium, enabled in Terraform, not an Argo Application.

## Cluster facts (must match Terraform)

| Key | Value |
| --- | --- |
| StorageClass | `default` |
| S3 endpoint | `fsn1.your-objectstorage.com` |
| Loki bucket | `ivp-loki` |
| CNPG bucket | `ivp-cnpg` |
| Grafana JWT team | `throbbing-disk-6041` (Cloudflare Access) |
| Repo | `https://github.com/ivanpanev/ivanpanev.net` |
