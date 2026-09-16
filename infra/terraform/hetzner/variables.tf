variable "hcloud_token" {
  type        = string
  sensitive   = true
  description = "Hetzner Cloud API token with Read & Write on this project."
}

variable "cluster_name" {
  type        = string
  default     = "ivp"
  description = "Short name used for Hetzner resources and Talos cluster identity."

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,20}$", var.cluster_name))
    error_message = "cluster_name must be a short lowercase DNS label."
  }
}

variable "location" {
  type        = string
  default     = "fsn1"
  description = "Hetzner location for every node. Object Storage for this project is fsn1/nbg1."

  validation {
    condition     = contains(["fsn1", "nbg1", "hel1"], var.location)
    error_message = "Use an EU location that also has Object Storage (fsn1, nbg1, hel1)."
  }
}

variable "control_plane_type" {
  type        = string
  default     = "cx23"
  description = "Hetzner server type for the control-plane pool. CX23 is the floor (4 GB) required by the module."
}

variable "control_plane_count" {
  type        = number
  default     = 1
  description = "Control-plane replicas. 1 is accepted for Phase 1 (ADR-0004); grow to 3 later."

  validation {
    condition     = contains([1, 3], var.control_plane_count)
    error_message = "etcd wants 1 or 3 members, not 2."
  }
}

variable "worker_type" {
  type        = string
  default     = "cx43"
  description = "Hetzner server type for workers."
}

variable "worker_count" {
  type        = number
  default     = 2
  description = "Worker replicas."

  validation {
    condition     = var.worker_count >= 1 && var.worker_count <= 8
    error_message = "worker_count must be between 1 and 8."
  }
}

variable "talos_version" {
  type        = string
  default     = "v1.13.10"
  description = "Talos version the module deploys. Must match TALOS_VERSION in scripts/versions.env (without the leading 'v' there)."

  validation {
    condition     = can(regex("^v1\\.[0-9]+\\.[0-9]+$", var.talos_version))
    error_message = "talos_version must look like v1.13.10."
  }
}

variable "kubernetes_version" {
  type        = string
  default     = "v1.34.11"
  description = "Kubernetes version the module deploys. Must match KUBERNETES_VERSION in scripts/versions.env (major.minor there)."

  validation {
    condition     = can(regex("^v1\\.[0-9]+\\.[0-9]+$", var.kubernetes_version))
    error_message = "kubernetes_version must look like v1.34.11."
  }
}

variable "firewall_api_source" {
  type        = list(string)
  default     = null
  description = "CIDRs allowed to reach the Talos and Kubernetes APIs. Null uses the apply machine's IPv4. A non-empty list replaces that allow-list. Never pass an empty list — that locks the APIs."

  validation {
    condition     = var.firewall_api_source == null || length(var.firewall_api_source) > 0
    error_message = "firewall_api_source must be null (apply-machine IP) or a non-empty CIDR list. An empty list would lock the APIs."
  }
}

variable "cluster_delete_protection" {
  type        = bool
  default     = true
  description = "Hetzner delete protection on cluster resources. Must be flipped to false in a dedicated apply before destroy (see cluster-teardown.md)."
}

variable "s3_endpoint" {
  type        = string
  default     = "https://fsn1.your-objectstorage.com"
  description = "Hetzner Object Storage S3 endpoint."
}

variable "s3_region" {
  type        = string
  default     = "fsn1"
  description = "Object Storage region. Must match the endpoint."
}

variable "s3_access_key" {
  type        = string
  sensitive   = true
  description = "Object Storage access key. Created in the Hetzner console; there is no public API for this."
}

variable "s3_secret_key" {
  type        = string
  sensitive   = true
  description = "Object Storage secret key."
}

variable "bucket_prefix" {
  type        = string
  default     = "ivp"
  description = "Prefix for Object Storage buckets (loki, cnpg, tfstate, etcd)."
}

variable "talos_backup_age_public_key" {
  type        = string
  description = "age X25519 public key (age1...) for etcd snapshot encryption in Object Storage. Required so snapshots are never stored in plaintext (ADR-0004)."

  validation {
    condition     = can(regex("^age1[a-z0-9]+$", var.talos_backup_age_public_key))
    error_message = "talos_backup_age_public_key must be an age1... X25519 public key from scripts/sops-init."
  }
}

variable "talos_backup_s3_access_key" {
  type        = string
  sensitive   = true
  default     = null
  description = "Optional Object Storage access key scoped to ivp-etcd only. Null uses s3_access_key (project-wide). Prefer a dedicated key created in the Hetzner console."
}

variable "talos_backup_s3_secret_key" {
  type        = string
  sensitive   = true
  default     = null
  description = "Secret for talos_backup_s3_access_key. Must be set together with it."
}
