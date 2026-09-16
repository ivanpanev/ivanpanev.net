locals {
  buckets = {
    loki    = "${var.bucket_prefix}-loki"
    cnpg    = "${var.bucket_prefix}-cnpg"
    tfstate = "${var.bucket_prefix}-tfstate"
    etcd    = "${var.bucket_prefix}-etcd"
  }
}

resource "aws_s3_bucket" "this" {
  for_each = local.buckets
  provider = aws.hetzner_s3
  bucket   = each.value

  # Teardown must not wipe Loki/CNPG/etcd/tfstate. Removing this block is a
  # deliberate, separate edit — see docs/runbooks/cluster-teardown.md.
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "this" {
  for_each = local.buckets
  provider = aws.hetzner_s3
  bucket   = aws_s3_bucket.this[each.key].id

  # Loki: Suspended. Enabling versioning on ivp-loki (via curl or this
  # resource) made authenticated PutObject 403 AccessDenied with an empty
  # Message after PublicAccessBlock was already gone. tfstate/cnpg/etcd
  # stay Enabled. Loki retention is the 720h compactor, not S3 versions.
  versioning_configuration {
    status = each.key == "loki" ? "Suspended" : "Enabled"
  }
}

# Do not set aws_s3_bucket_public_access_block on Hetzner Object Storage.
# Ceph RGW accepts the PutPublicAccessBlock call, then authenticates
# PutObject with 403 AccessDenied (empty Message) even when the same key
# has FULL_CONTROL on the bucket ACL and ListObjectsV2 returns 200.
# Fresh buckets without PAB accept PutObject. Hetzner buckets are private
# by default (M2-R2: drop PAB if the API mis-handles it).
