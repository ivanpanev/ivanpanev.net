cloudflare_api_token = "cf-api-token"
account_id           = "0123456789abcdef0123456789abcdef"
operator_email       = "ivan@example.com"
team_name            = "ivanpanev"
zone_name            = "ivanpanev.net"

# Quoted because notes-api is not a valid HCL identifier.
hostnames = {
  "notes-api" = { public = true, rate_limit = true }
  grafana     = { public = false }
  argocd      = { public = false }
  hubble      = { public = false }
  auth        = { public = false }
}

# email_local_parts = ["ivan", "security"]
# rate_limit_requests = 10
# rate_limit_period   = 10
