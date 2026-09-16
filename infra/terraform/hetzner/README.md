# Terraform: Hetzner cluster

Provisions the Talos Kubernetes cluster (module `hcloud-k8s/kubernetes/hcloud`
5.9.1) and the Object Storage buckets used for Loki, CloudNativePG, Terraform
state, and etcd snapshots.

Apply procedure, teardown, and the local-state → S3 backend migration live in
[docs/runbooks/cluster-bootstrap.md](../../../docs/runbooks/cluster-bootstrap.md)
and [cluster-teardown.md](../../../docs/runbooks/cluster-teardown.md).

```bash
cp terraform.example.tfvars terraform.tfvars   # then fill secrets, or use SOPS
terraform fmt
terraform init
terraform validate
tflint
terraform plan -out=tfplan
# review, then:
terraform apply tfplan
```

`kubeconfig` and `talosconfig` are written next to this file and are gitignored.

The module requires Packer on the operator machine to upload the Talos image
the first time. `talosctl` must match the Talos version the module deploys;
after apply follow [cluster-upgrade.md](../../../docs/runbooks/cluster-upgrade.md)
so `scripts/versions.env` matches `terraform output talos_version` /
`kubernetes_version`.
