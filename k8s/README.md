# k8s/

Everything Argo CD reconciles, plus the one-time Argo CD bootstrap.

```
bootstrap/argocd/        Helm values and KSOPS wiring; applied by hand once, then self-managed
clusters/<cluster>/      root Application (app-of-apps) and cluster-specific values
infrastructure/<name>/   platform components, one directory per Application
apps/<name>/             workloads: base/ plus overlays/<cluster>/
```

Conventions:

- Application ordering by `argocd.argoproj.io/sync-wave`: CRDs and operators
  (0-1), platform services (2-3), workloads (10+).
- Helm charts are consumed through Kustomize `helmCharts` or Argo CD
  multi-source Applications with values files in Git; chart versions pinned.
- Secrets are `*.secret.yaml` encrypted with SOPS and rendered by KSOPS
  (see `docs/runbooks/secrets.md`).
- Every workload sets resource requests and limits, a liveness and readiness
  probe, `securityContext` (non-root, read-only root filesystem where
  possible), and a `NetworkPolicy`.
- Nothing provider-specific outside `clusters/<cluster>/`; the StorageClass
  is referenced as `default`, the S3 endpoint and bucket names come from
  cluster values.
- `kustomize build` and `kubeconform` run in CI on every change.
