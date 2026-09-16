# Runbook: bootstrap the Hetzner cluster and Cloudflare edge

Creates the Phase 1 cluster from nothing. Argo CD handover is Milestone 3;
this runbook stops at “kubectl and talosctl work, tunnel token is encrypted
into Git”.

## Preconditions

- Hetzner Cloud project, API token (Read & Write), and Object Storage
  credentials created in the console (there is no public API for S3 keys).
- Cloudflare account owning `ivanpanev.net`, API token with Zone DNS Edit,
  Zero Trust (Access + Tunnel) Edit, Zone Settings Edit, Email Routing.
- Toolchain: `docs/toolchain.md`. Packer is required the first time the
  module uploads a Talos image.
- An age key (`scripts/sops-init.*`) so etcd snapshots can be encrypted and
  the tunnel token can be SOPS-encrypted after apply.
- Your public IP is the one that will be allowed to the Talos/Kubernetes
  APIs. If you apply from a different network, set `firewall_api_source`.

## 1. Object Storage buckets and the cluster (Hetzner root)

State starts local (gitignored). After the `ivp-tfstate` bucket exists you
migrate it.

```bash
cd infra/terraform/hetzner
cp terraform.example.tfvars terraform.tfvars   # or sops terraform.enc.tfvars
# fill hcloud_token, s3_access_key, s3_secret_key, talos_backup_age_public_key
# (age public key from scripts/sops-init.*). Optional: a dedicated Object
# Storage key pair scoped to ivp-etcd as talos_backup_s3_*_key.

terraform fmt
terraform init
terraform validate
tflint --chdir=.
terraform plan -out=tfplan
# Confirm: 1x CX23 control plane, 2x CX43 workers, location fsn1,
# no Load Balancer resource (kube_api_load_balancer_enabled = false,
# hcloud_ccm_load_balancers_enabled = false), four buckets, delete
# protection on, talos_version/kubernetes_version match versions.env.
terraform apply tfplan
```

Verify:

```bash
export KUBECONFIG="$PWD/kubeconfig"
export TALOSCONFIG="$PWD/talosconfig"
talosctl get members
talosctl version --nodes "$(talosctl get members -o jsonpath='{.items[0].metadata.id}')"
kubectl get nodes -o wide
kubectl get storageclass
# storageclass "default" must exist and be the default.
# kubectl get svc -A must show no Service of type LoadBalancer.
```

Etcd snapshots land in `ivp-etcd` daily. There is no Terraform lifecycle
rule (Hetzner Object Storage support is incomplete). Prune objects older
than 30 days from the console until a tested lifecycle config exists.

Update `scripts/versions.env` from `terraform output talos_version` /
`kubernetes_version` and from the **node** (`talosctl version` / `kubectl
version`), not from `talosctl version --client`. Procedure:
[cluster-upgrade.md](cluster-upgrade.md).

### Move state to S3

```bash
cp backend.s3.tf.example backend.tf
cp backend.hcl.example backend.hcl
# fill access keys via AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
terraform init -migrate-state -backend-config=backend.hcl
```

If `use_lockfile = true` is rejected by Hetzner Object Storage, remove that
line from `backend.hcl` and treat this as single-operator state. Record the
decision in the apply notes. Do not invent a DynamoDB lock table — there
isn't one here.

## 2. Cloudflare edge

```bash
cd infra/terraform/cloudflare
cp terraform.example.tfvars terraform.tfvars
# fill cloudflare_api_token, account_id, operator_email, team_name

terraform fmt
terraform init
terraform validate
tflint --chdir=.
terraform plan -out=tfplan
# Confirm: CNAME per hostname to <tunnel>.cfargotunnel.com,
# Access applications only for grafana/argocd/hubble,
# notes-api rate-limit period 10 (Cloudflare Free), last ingress http_status:404.
terraform apply tfplan
```

The destination address receives a Cloudflare verification mail; forwarding
rules do nothing until that is confirmed.

Encrypt the tunnel token **on the Git path** so `.sops.yaml` applies
(`^k8s/.*\.(enc|secret)\.ya?ml$`). Do not encrypt a file under `/tmp`.

Bash / Git Bash:

```bash
cd infra/terraform/cloudflare
mkdir -p ../../../k8s/infrastructure/cloudflared
token=$(terraform output -raw tunnel_token)
cat > ../../../k8s/infrastructure/cloudflared/tunnel.secret.yaml <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: cloudflared-tunnel
  namespace: cloudflared
stringData:
  TUNNEL_TOKEN: ${token}
EOF
sops --encrypt --in-place ../../../k8s/infrastructure/cloudflared/tunnel.secret.yaml
sops filestatus ../../../k8s/infrastructure/cloudflared/tunnel.secret.yaml
unset token
```

PowerShell:

```powershell
Set-Location infra/terraform/cloudflare
New-Item -ItemType Directory -Force -Path ../../../k8s/infrastructure/cloudflared | Out-Null
$token = terraform output -raw tunnel_token
$dest = Join-Path (Resolve-Path ../../../k8s/infrastructure/cloudflared) 'tunnel.secret.yaml'
$manifest = @"
apiVersion: v1
kind: Secret
metadata:
  name: cloudflared-tunnel
  namespace: cloudflared
stringData:
  TUNNEL_TOKEN: $token
"@
[System.IO.File]::WriteAllText($dest, ($manifest -replace "`r`n", "`n") + "`n", [System.Text.UTF8Encoding]::new($false))
sops --encrypt --in-place $dest
sops filestatus $dest
Remove-Variable token
```

Commit only `tunnel.secret.yaml`. `sops filestatus` must report
`"encrypted": true`. The plaintext token lives in Terraform state (sensitive)
and in the operator's shell history until the session ends — do not paste it
into chat or a tracked file.

Optional: migrate this root's state to `ivp-tfstate` / `cloudflare/terraform.tfstate`
the same way as the Hetzner root.

## 3. Stop here

Do not install Argo CD yet. That is Milestone 3:
[argocd-bootstrap.md](argocd-bootstrap.md). Keep the kubeconfig and
talosconfig off the network; they never enter Git.

## Rollback

If apply failed mid-way: `terraform apply` is not atomic. Destroy only the
root that is broken (`cluster-teardown.md` for Hetzner; `terraform destroy`
for Cloudflare). Do not destroy a healthy Hetzner cluster because Cloudflare
apply failed.

## Verify success

- `kubectl get nodes` shows 1 Ready control-plane + 2 Ready workers.
- `kubectl get svc -A` has no `LoadBalancer`.
- Four buckets visible in the Hetzner console.
- `dig grafana.ivanpanev.net` (after apply) is a Cloudflare anycast address
  (proxied CNAME).
- `curl -sI https://grafana.ivanpanev.net` challenges Access, not the origin.
- `k8s/infrastructure/cloudflared/tunnel.secret.yaml` exists and `sops filestatus` reports encrypted.
