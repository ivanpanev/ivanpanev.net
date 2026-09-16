# Helm chart pins

Versions live on the Argo CD Application `targetRevision` fields under
`k8s/clusters/hetzner/applications/` so Renovate's `argocd` manager can bump
them. Values files are tracked by the `helm-values` manager. Do not
automerge (see `renovate.json`).

| Chart | Repo | Version | App |
| --- | --- | --- | --- |
| argo-cd | https://argoproj.github.io/argo-helm | 10.9.1 | v3.5.3 |
| kube-prometheus-stack | https://prometheus-community.github.io/helm-charts | 91.4.1 | |
| loki | https://grafana-community.github.io/helm-charts | 18.11.7 | OSS Monolithic (formerly SingleBinary) |
| k8s-monitoring | https://grafana.github.io/helm-charts | 4.5.2 | |
| cloudnative-pg | https://cloudnative-pg.github.io/charts | 0.29.0 | 1.30.0 |
| plugin-barman-cloud | https://cloudnative-pg.github.io/charts | 0.8.0 | |
