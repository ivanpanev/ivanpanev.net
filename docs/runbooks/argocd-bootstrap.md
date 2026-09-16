# Runbook: install Argo CD and hand the cluster to GitOps

Applies once. After the root Application exists, Argo CD reconciles
`k8s/clusters/hetzner` from Git (ADR-0006). Until `main` is pushed to
https://github.com/ivanpanev/ivanpanev.net, apply the same manifests from
the working tree with `kubectl` / `helm` so Access origins come up.

## Preconditions

- Milestone 2 complete: nodes Ready, no LoadBalancer Services, tunnel token
  encrypted at `k8s/infrastructure/cloudflared/tunnel.secret.yaml`.
- Cluster age private key at `%APPDATA%\sops\age\cluster-hetzner.txt`
  (public key in `.sops.yaml` as `argocd_hetzner`). This private key never
  enters Git.
- Operator age key can decrypt every `*.secret.yaml`.
- `KUBECONFIG` points at `infra/terraform/hetzner/kubeconfig`.
- Hubble flags in `infra/terraform/hetzner/kubernetes.tf` have been applied
  (`cilium_hubble_enabled/relay/ui = true`).
- Toolchain: helm, kubectl, sops, argocd CLI (`docs/toolchain.md`).

## 1. Enable Hubble (if the last Hetzner apply predated the flags)

From Git Bash, with the `cmd.exe` shim ahead of System32 (see M2 apply notes):

```bash
cd infra/terraform/hetzner
terraform plan -out=tfplan
# Expect: cilium Hubble relay + UI enabled. No new LoadBalancer.
terraform apply tfplan
kubectl -n kube-system get svc hubble-ui
```

## 2. Install Argo CD

```bash
kubectl create namespace argocd --dry-run=client -o yaml | kubectl apply -f -
kubectl -n argocd create secret generic sops-age \
  --from-file=keys.txt="${APPDATA}/sops/age/cluster-hetzner.txt" \
  --dry-run=client -o yaml | kubectl apply -f -

helm repo add argo https://argoproj.github.io/argo-helm
helm repo update
helm upgrade --install argocd argo/argo-cd \
  --namespace argocd \
  --version 10.9.1 \
  --values k8s/bootstrap/argocd/values.yaml \
  --wait --timeout 10m

argocd login --core
argocd account update-password   # store the new password in the password manager
```

PowerShell: `$env:APPDATA` is `C:\Users\<you>\AppData\Roaming`. The age file
must contain the `AGE-SECRET-KEY-...` line.

## 3. Apply platform manifests from the working tree

Argo cannot sync from GitHub until this repository is pushed. Apply locally
in sync-wave order so CRDs exist before CRs. Decrypt happens through `sops`
on the operator machine, not KSOPS, for this first pass.

```bash
kubectl apply -k k8s/infrastructure/gateway
kubectl apply -f k8s/infrastructure/cloudflared/namespace.yaml
sops --decrypt k8s/infrastructure/cloudflared/tunnel.secret.yaml \
  | kubectl apply -f -
kubectl apply -f k8s/infrastructure/cloudflared/serviceaccount.yaml
kubectl apply -f k8s/infrastructure/cloudflared/deployment.yaml
kubectl apply -f k8s/infrastructure/cloudflared/service.yaml
kubectl apply -f k8s/infrastructure/cloudflared/pdb.yaml
kubectl apply -f k8s/infrastructure/cloudflared/networkpolicy.yaml

sops --decrypt k8s/infrastructure/cert-manager-issuers/cloudflare-api-token.secret.yaml \
  | kubectl apply -f -
kubectl apply -f k8s/infrastructure/cert-manager-issuers/clusterissuer.yaml
kubectl apply -f k8s/infrastructure/cert-manager-issuers/certificate.yaml

helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana-community https://grafana-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm repo add cnpg https://cloudnative-pg.github.io/charts
helm repo update

kubectl apply -f k8s/infrastructure/cnpg-operator/resources/namespace.yaml
helm upgrade --install cnpg cnpg/cloudnative-pg \
  --namespace cnpg-system --version 0.29.0 \
  --values k8s/infrastructure/cnpg-operator/values.yaml --wait
helm upgrade --install plugin-barman-cloud cnpg/plugin-barman-cloud \
  --namespace cnpg-system --version 0.8.0 \
  --values k8s/infrastructure/barman-cloud/values.yaml --wait

kubectl apply -f k8s/infrastructure/kube-prometheus-stack/resources/namespace.yaml
sops --decrypt k8s/infrastructure/kube-prometheus-stack/resources/grafana-admin.secret.yaml \
  | kubectl apply -f -
sops --decrypt k8s/infrastructure/kube-prometheus-stack/resources/alertmanager-ntfy.secret.yaml \
  | kubectl apply -f -
helm upgrade --install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  --namespace monitoring --version 91.4.1 --skip-crds \
  --values k8s/infrastructure/kube-prometheus-stack/values.yaml --wait --timeout 15m
kubectl apply -f k8s/infrastructure/kube-prometheus-stack/resources/referencegrant.yaml
kubectl apply -f k8s/infrastructure/kube-prometheus-stack/resources/servicemonitor-cloudflared.yaml

kubectl apply -f k8s/infrastructure/loki/resources/namespace.yaml
sops --decrypt k8s/infrastructure/loki/resources/loki-s3.secret.yaml | kubectl apply -f -
helm upgrade --install loki grafana-community/loki \
  --namespace loki --version 18.11.7 \
  --values k8s/infrastructure/loki/values.yaml --wait --timeout 10m

helm upgrade --install k8s-monitoring grafana/k8s-monitoring \
  --namespace monitoring --version 4.5.2 \
  --values k8s/infrastructure/k8s-monitoring/values.yaml --wait --timeout 10m
```

## 4. Hand over to Argo CD

After `main` exists on GitHub:

```bash
kubectl apply -f k8s/clusters/hetzner/root-application.yaml
argocd app wait hetzner-root --timeout 600
argocd app list
```

Until then, skip this step. The working-tree apply in step 3 is the live
cluster.

## Verify success

- `kubectl -n cloudflared get pods` — 2 Ready, spread across workers.
- `kubectl -n gateway get gateway public` — `Programmed`; Service `cilium-gateway-public` exists.
- `kubectl get svc -A` — still no `LoadBalancer`.
- `curl -sI https://grafana.ivanpanev.net` — Access challenge, then Grafana
  (no Grafana login form; JWT from `Cf-Access-Jwt-Assertion`).
- Same for `argocd.` and `hubble.`.
- `kubectl -n loki logs sts/loki -c loki --tail=50` — no `Access Denied`
  / `PutObject` 403. Object prefixes (`fake/`, `loki_index_`) appear in
  the `ivp-loki` bucket. If ListObjects is 200 and PutObject is 403
  AccessDenied with an empty Message, check bucket flags first — not the
  access key. `aws_s3_bucket_public_access_block` on Hetzner Ceph and
  versioning `Enabled` on `ivp-loki` both produce that 403 even when the
  key has FULL_CONTROL. Leave PAB unset (buckets are private by default)
  and Loki versioning `Suspended`. Checksum/thanos knobs stay in values.
- Grafana Explore shows Loki with a `{namespace="cloudflared"}` query after
  Alloy has scraped.
- `kubectl -n cnpg-system get pods` — operator and barman plugin Running.
- `kubectl get clusterissuer letsencrypt-cloudflare` — Ready.

## Rollback

```bash
helm uninstall k8s-monitoring -n monitoring
helm uninstall loki -n loki
helm uninstall kube-prometheus-stack -n monitoring
helm uninstall plugin-barman-cloud -n cnpg-system
helm uninstall cnpg -n cnpg-system
helm uninstall argocd -n argocd
kubectl delete -k k8s/infrastructure/gateway --ignore-not-found
kubectl delete ns cloudflared gateway loki monitoring cnpg-system argocd --ignore-not-found
```

Do not delete the `cert-manager` namespace; the hcloud-k8s module owns it.
Object Storage buckets stay (ADR-0010).
