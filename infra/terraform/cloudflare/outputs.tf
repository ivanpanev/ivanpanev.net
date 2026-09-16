output "zone_id" {
  value       = local.zone_id
  description = "Cloudflare zone ID for ivanpanev.net."
}

output "tunnel_id" {
  value       = cloudflare_zero_trust_tunnel_cloudflared.cluster.id
  description = "Named tunnel ID. DNS CNAMEs point at <id>.cfargotunnel.com."
}

output "tunnel_cname" {
  value       = "${cloudflare_zero_trust_tunnel_cloudflared.cluster.id}.cfargotunnel.com"
  description = "CNAME target for every published hostname."
}

output "tunnel_token" {
  value       = data.cloudflare_zero_trust_tunnel_cloudflared_token.cluster.token
  sensitive   = true
  description = "cloudflared token. SOPS-encrypt into k8s/infrastructure/cloudflared/ after apply (see runbook)."
}

output "access_applications" {
  value = {
    for name, app in cloudflare_zero_trust_access_application.admin :
    name => { domain = app.domain, aud = app.aud }
  }
  description = "Admin Access applications and their audience tags."
}

output "published_hostnames" {
  value       = local.fqdn
  description = "Every hostname this root publishes."
}
