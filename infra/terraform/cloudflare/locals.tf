data "cloudflare_zone" "this" {
  filter = {
    name = var.zone_name
    account = {
      id = var.account_id
    }
  }
}

locals {
  zone_id = data.cloudflare_zone.this.zone_id

  admin_hosts = {
    for name, h in var.hostnames : name => h if !h.public
  }
  rate_limited = {
    for name, h in var.hostnames : name => h if h.rate_limit
  }

  fqdn = { for name, h in var.hostnames : name => "${name}.${var.zone_name}" }
}
