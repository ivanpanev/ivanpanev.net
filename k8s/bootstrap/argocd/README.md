# Argo CD bootstrap

One-time install. After this, the Application in
`k8s/clusters/hetzner/applications/argocd.yaml` owns the release (ADR-0006).

Procedure: [docs/runbooks/argocd-bootstrap.md](../../../docs/runbooks/argocd-bootstrap.md).

| Pin | Value |
| --- | --- |
| Helm chart | `argo/argo-cd` **10.9.1** |
| App | Argo CD **v3.5.3** (`PIN_ARGOCD`) |
| KSOPS | `viaductoss/ksops:v4.5.1` |
