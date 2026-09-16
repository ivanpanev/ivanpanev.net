# Creating this resource enables Email Routing and locks the MX/SPF records
# (provider v5: settings.enabled is read-only).
# name must be omitted for the zone apex. Passing var.zone_name makes the
# API 422: "must be a subdomains of ivanpanev.net" (cloudflare/terraform-provider-cloudflare#5890).
resource "cloudflare_email_routing_dns" "this" {
  zone_id = local.zone_id
}

resource "cloudflare_email_routing_address" "operator" {
  account_id = var.account_id
  email      = var.operator_email
}

resource "cloudflare_email_routing_rule" "forward" {
  for_each = toset(var.email_local_parts)

  zone_id = local.zone_id
  enabled = true
  name    = each.key
  matchers = [
    {
      type  = "literal"
      field = "to"
      value = "${each.key}@${var.zone_name}"
    }
  ]
  actions = [
    {
      type  = "forward"
      value = [var.operator_email]
    }
  ]

  depends_on = [cloudflare_email_routing_dns.this, cloudflare_email_routing_address.operator]
}
