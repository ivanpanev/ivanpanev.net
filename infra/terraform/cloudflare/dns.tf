resource "cloudflare_dns_record" "tunnel" {
  for_each = var.hostnames

  zone_id = local.zone_id
  name    = each.key
  type    = "CNAME"
  content = "${cloudflare_zero_trust_tunnel_cloudflared.cluster.id}.cfargotunnel.com"
  proxied = true
  ttl     = 1
}
