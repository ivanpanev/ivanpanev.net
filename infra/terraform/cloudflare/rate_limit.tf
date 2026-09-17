# One zone rate-limit rule. Defaults are Cloudflare Free-legal: period 10,
# mitigation_timeout 10. Raising period to 60 requires Pro.
#
# CORS preflights are excluded: every X-Auth call from the island costs an
# OPTIONS plus the real request, a preflight carries no passcode attempt, and
# Cloudflare's 429 has no Access-Control-Allow-Origin, so a throttled preflight
# surfaces in the browser as "Failed to fetch" (M7-R1-F01).
resource "cloudflare_ruleset" "notes_rate_limit" {
  count = length(local.rate_limited) > 0 ? 1 : 0

  zone_id     = local.zone_id
  name        = "notes-api-rate-limit"
  description = "Per-IP cap on notebook API write/read paths."
  kind        = "zone"
  phase       = "http_ratelimit"

  rules = [
    for name, h in local.rate_limited : {
      action      = "block"
      description = "Rate limit ${local.fqdn[name]}/v1/*"
      enabled     = true
      expression  = "(http.host eq \"${local.fqdn[name]}\" and starts_with(http.request.uri.path, \"/v1/\") and http.request.method ne \"OPTIONS\")"
      ratelimit = {
        characteristics     = ["cf.colo.id", "ip.src"]
        period              = var.rate_limit_period
        requests_per_period = var.rate_limit_requests
        mitigation_timeout  = var.rate_limit_period
      }
    }
  ]
}
