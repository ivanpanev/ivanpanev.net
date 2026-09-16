resource "cloudflare_zero_trust_access_policy" "operator_otp" {
  account_id = var.account_id
  name       = "operator-otp"
  decision   = "allow"

  include = [
    {
      email = { email = var.operator_email }
    }
  ]
}

resource "cloudflare_zero_trust_access_application" "admin" {
  for_each = local.admin_hosts

  account_id       = var.account_id
  name             = each.key
  domain           = local.fqdn[each.key]
  type             = "self_hosted"
  session_duration = "24h"

  policies = [
    {
      id = cloudflare_zero_trust_access_policy.operator_otp.id
    }
  ]
}
