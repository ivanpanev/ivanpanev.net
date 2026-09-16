output "kubeconfig_path" {
  value       = abspath("${path.module}/kubeconfig")
  description = "Local kubeconfig written by the module. Gitignored."
}

output "talosconfig_path" {
  value       = abspath("${path.module}/talosconfig")
  description = "Local talosconfig written by the module. Gitignored."
}

output "s3_endpoint" {
  value       = var.s3_endpoint
  description = "S3 API endpoint for Loki, CNPG, Terraform state, etcd snapshots."
}

output "s3_region" {
  value       = var.s3_region
  description = "S3 region name."
}

output "buckets" {
  value       = { for k, b in aws_s3_bucket.this : k => b.bucket }
  description = "Bucket names keyed by role (loki, cnpg, tfstate, etcd)."
}

output "cluster_name" {
  value       = var.cluster_name
  description = "Talos/Hetzner cluster name."
}

output "location" {
  value       = var.location
  description = "Hetzner location of every node."
}

output "talos_version" {
  value       = var.talos_version
  description = "Talos version pinned into the module. Copy the minor into scripts/versions.env TALOS_VERSION after apply."
}

output "kubernetes_version" {
  value       = var.kubernetes_version
  description = "Kubernetes version pinned into the module. Copy the minor into scripts/versions.env KUBERNETES_VERSION after apply."
}
