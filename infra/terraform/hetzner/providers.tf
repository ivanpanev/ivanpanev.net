provider "hcloud" {
  token = var.hcloud_token
}

# Hetzner Object Storage is S3-compatible and has no hcloud API for buckets
# (provider issue #1005). The AWS provider talks to the S3 endpoint only.
provider "aws" {
  alias  = "hetzner_s3"
  region = var.s3_region

  access_key = var.s3_access_key
  secret_key = var.s3_secret_key

  endpoints {
    s3 = var.s3_endpoint
  }

  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_region_validation      = true
  skip_requesting_account_id  = true
  s3_use_path_style           = true
}
