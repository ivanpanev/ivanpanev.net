# Argo CD sync waves

| Wave | Application | Why |
| --- | --- | --- |
| 0 | gateway | GatewayClass + Gateway + HTTPRoutes (no Helm CRDs) |
| 1 | cloudflared | Tunnel replicas; origin can come up before metrics |
| 1 | cert-manager-issuers | ClusterIssuer; cert-manager operator already from Terraform |
| 1 | kube-prometheus-stack-resources | SOPS secrets + NetworkPolicy before Helm consumers |
| 1 | loki-resources | `loki-s3` + NetworkPolicy before Loki Helm |
| 2 | cnpg-operator | CRDs + operator |
| 2 | barman-cloud | Plugin CRDs; `CreateNamespace=true` |
| 2 | kube-prometheus-stack | Prometheus Operator, Grafana, Alertmanager |
| 3 | loki | Needs monitoring ServiceMonitor CRDs from wave 2 |
| 3 | k8s-monitoring | Pushes logs into Loki |
| 4 | argocd | Self-manage after platform exists |

Root Application `hetzner-root` is applied by hand and is not in `kustomization.yaml`.
Do not apply it until GitHub `main` contains the k8s tree.
