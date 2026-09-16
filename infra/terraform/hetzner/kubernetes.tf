# Talos Kubernetes on Hetzner. Module 5.9.1 pins below are the source of
# truth for Talos/Kubernetes versions; scripts/versions.env must stay in
# lockstep (docs/runbooks/cluster-upgrade.md).
module "kubernetes" {
  source  = "hcloud-k8s/kubernetes/hcloud"
  version = "5.9.1"

  cluster_name = var.cluster_name
  hcloud_token = var.hcloud_token

  cluster_kubeconfig_path  = "${path.module}/kubeconfig"
  cluster_talosconfig_path = "${path.module}/talosconfig"

  # Explicit so a module bump that changes defaults cannot silently drift
  # the cluster (ADR-0004 / versions.env).
  talos_version      = var.talos_version
  kubernetes_version = var.kubernetes_version

  cert_manager_enabled       = true
  cilium_gateway_api_enabled = true
  # Tunnel origin is plain HTTP; PROXY protocol would reject cloudflared.
  cilium_gateway_api_proxy_protocol_enabled = false
  # Hubble UI is an Access-protected hostname (ADR-0005 / ADR-0007).
  cilium_hubble_enabled          = true
  cilium_hubble_relay_enabled    = true
  cilium_hubble_ui_enabled       = true
  cilium_service_monitor_enabled = true
  ingress_nginx_enabled          = false
  longhorn_enabled               = false

  # No Hetzner load balancer for HTTP (ADR-0005). The API stays on the
  # control-plane node, firewalled to the operator. CCM's Service controller
  # is off so a Gateway or Service of type LoadBalancer cannot mint an LB.
  kube_api_load_balancer_enabled    = false
  hcloud_ccm_load_balancers_enabled = false

  firewall_use_current_ipv4 = var.firewall_api_source == null
  firewall_use_current_ipv6 = false
  firewall_api_source       = var.firewall_api_source

  cluster_delete_protection = var.cluster_delete_protection

  # Packer default is ash (Ashburn). Build the snapshot in the same location
  # as the nodes. The module's local-exec also uses Unix quoting, so apply
  # this root from WSL/Git Bash, not Windows cmd.
  packer_amd64_builder = {
    server_type     = "cx23"
    server_location = var.location
  }

  # Object keys are camelCase in the module schema (not snake_case).
  hcloud_csi_storage_classes = [
    {
      name                = "default"
      encrypted           = true
      reclaimPolicy       = "Delete"
      defaultStorageClass = true
    }
  ]

  # Daily encrypted etcd snapshot into the ivp-etcd bucket (ADR-0004).
  talos_backup_enabled               = true
  talos_backup_s3_hcloud_url         = "https://${aws_s3_bucket.this["etcd"].bucket}.${var.s3_region}.your-objectstorage.com"
  talos_backup_s3_access_key         = coalesce(var.talos_backup_s3_access_key, var.s3_access_key)
  talos_backup_s3_secret_key         = coalesce(var.talos_backup_s3_secret_key, var.s3_secret_key)
  talos_backup_s3_path_style         = true
  talos_backup_schedule              = "0 3 * * *"
  talos_backup_enable_compression    = true
  talos_backup_age_x25519_public_key = var.talos_backup_age_public_key

  control_plane_nodepools = [
    {
      name     = "cp"
      type     = var.control_plane_type
      location = var.location
      count    = var.control_plane_count
    }
  ]

  worker_nodepools = [
    {
      name     = "w"
      type     = var.worker_type
      location = var.location
      count    = var.worker_count
    }
  ]

}

resource "terraform_data" "talos_backup_keys_paired" {
  lifecycle {
    precondition {
      condition     = (var.talos_backup_s3_access_key == null) == (var.talos_backup_s3_secret_key == null)
      error_message = "Set both talos_backup_s3_access_key and talos_backup_s3_secret_key, or neither."
    }
  }
}

