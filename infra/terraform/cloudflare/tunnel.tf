resource "random_bytes" "tunnel_secret" {
  length = 32
}

resource "cloudflare_zero_trust_tunnel_cloudflared" "cluster" {
  account_id    = var.account_id
  name          = "ivp-hetzner"
  config_src    = "cloudflare"
  tunnel_secret = random_bytes.tunnel_secret.base64
}

data "cloudflare_zero_trust_tunnel_cloudflared_token" "cluster" {
  account_id = var.account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.cluster.id
}

resource "cloudflare_zero_trust_tunnel_cloudflared_config" "cluster" {
  account_id = var.account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.cluster.id

  config = {
    ingress = concat(
      [
        for name, h in var.hostnames : merge(
          {
            hostname = local.fqdn[name]
            service  = var.gateway_origin
          },
          h.public ? {} : {
            origin_request = {
              access = {
                required  = true
                team_name = var.team_name
                aud_tag   = [cloudflare_zero_trust_access_application.admin[name].aud]
              }
            }
          }
        )
      ],
      [
        {
          service = "http_status:404"
        }
      ]
    )
  }
}
