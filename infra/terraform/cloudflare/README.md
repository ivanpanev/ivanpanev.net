# Terraform: Cloudflare edge

Manages the zone (not apex/www — those belong to wrangler), the named
Tunnel, per-hostname DNS + tunnel ingress + Access (ADR-0005), the
notes-api rate-limit ruleset, zone TLS/HSTS settings, and Email Routing.

```bash
cp terraform.example.tfvars terraform.tfvars
terraform fmt
terraform init
terraform validate
tflint
terraform plan -out=tfplan
terraform apply tfplan
```

After apply, encrypt the tunnel token into the cluster secret that M3
deploys:

Do not pipe the token into a tracked file in plaintext. The bootstrap
runbook writes a Kubernetes Secret and encrypts it with SOPS.

Exact commands are in
[docs/runbooks/cluster-bootstrap.md](../../../docs/runbooks/cluster-bootstrap.md).
