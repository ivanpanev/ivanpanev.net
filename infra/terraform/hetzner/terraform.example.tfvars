# Copy to terraform.tfvars (gitignored) or terraform.enc.tfvars (SOPS).
# Never commit a plaintext copy.

hcloud_token  = "hetzner-api-token"
s3_access_key = "object-storage-access-key"
s3_secret_key = "object-storage-secret-key"
# Public key printed by scripts/sops-init.ps1 / sops-init.sh (starts with age1).
talos_backup_age_public_key = "age1replacewithoutputofsopsinit"

# Optional overrides
# cluster_name           = "ivp"
# location               = "fsn1"
# control_plane_type     = "cx23"
# control_plane_count    = 1
# worker_type            = "cx43"
# worker_count           = 2
# firewall_api_source    = ["203.0.113.10/32"]
# cluster_delete_protection = true
# s3_endpoint            = "https://fsn1.your-objectstorage.com"
# s3_region              = "fsn1"
# bucket_prefix          = "ivp"
# talos_version          = "v1.13.10"
# talos_backup_s3_access_key = "etcd-only-access-key"
# talos_backup_s3_secret_key = "etcd-only-secret-key"
