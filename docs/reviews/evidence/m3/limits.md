# Resource requests, limits, and PDBs (M3)

| Workload | Replicas | Requests | Limits | PDB |
| --- | --- | --- | --- | --- |
| cloudflared | 2 | 20m / 64Mi | 200m / 128Mi | minAvailable 1 |
| argocd-server | 1 | 50m / 128Mi | 500m / 256Mi | n/a (replicas=1) |
| argocd-repo-server | 1 | 50m / 256Mi | 1 / 1Gi | n/a |
| argocd-application-controller | 1 | 100m / 256Mi | 1 / 1Gi | n/a |
| argocd-redis | 1 | 25m / 64Mi | 200m / 128Mi | n/a |
| prometheus | 1 | 200m / 1Gi | 1 / 3Gi | n/a |
| alertmanager | 1 | 20m / 64Mi | 200m / 128Mi | n/a |
| grafana | 1 | 50m / 128Mi | 500m / 256Mi | n/a |
| loki singleBinary | 1 | 100m / 512Mi | 1 / 1536Mi | n/a (ADR-0007 accepts restart gap) |
| alloy-logs DS | 1/node | 20m / 64Mi | 200m / 256Mi | n/a (DaemonSet) |
| alloy-events | 1 | 10m / 32Mi | 100m / 128Mi | n/a |
| cnpg operator | 1 | 50m / 64Mi | 500m / 256Mi | n/a |
| plugin-barman-cloud | 1 | 20m / 64Mi | 200m / 128Mi | n/a |
