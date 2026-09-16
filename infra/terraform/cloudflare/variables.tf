variable "cloudflare_api_token" {
  type        = string
  sensitive   = true
  description = "API token with Zone DNS Edit, Workers Scripts Edit, Zero Trust (Access + Tunnel) Edit, Zone Settings Edit, Email Routing."
}

variable "account_id" {
  type        = string
  description = "Cloudflare account ID."

  validation {
    condition     = can(regex("^[0-9a-f]{32}$", var.account_id))
    error_message = "account_id must be a 32-char hex Cloudflare account id."
  }
}

variable "zone_name" {
  type        = string
  default     = "ivanpanev.net"
  description = "DNS zone. Apex and www are attached by wrangler, not this root."
}

variable "team_name" {
  type        = string
  default     = "ivanpanev"
  description = "Cloudflare Zero Trust team name (used in Access JWT validation)."
}

variable "operator_email" {
  type        = string
  description = "Email allowed through Access (OTP). Also the Email Routing destination."

  validation {
    condition     = can(regex("^[^@]+@[^@]+\\.[^@]+$", var.operator_email))
    error_message = "operator_email must look like an email address."
  }
}

variable "gateway_origin" {
  type        = string
  default     = "http://cilium-gateway-public.gateway.svc.cluster.local:80"
  description = "In-cluster ClusterIP origin every published hostname forwards to."

  validation {
    condition     = startswith(var.gateway_origin, "http://")
    error_message = "TLS terminates at Cloudflare; the in-cluster hop is plain HTTP (ADR-0005)."
  }
}

variable "hostnames" {
  description = "Published hostnames. public=true skips Access (and must be explicit). rate_limit attaches the notes-api style rule."
  type = map(object({
    public     = bool
    rate_limit = optional(bool, false)
  }))
  default = {
    "notes-api" = { public = true, rate_limit = true }
    grafana     = { public = false }
    argocd      = { public = false }
    hubble      = { public = false }
    auth        = { public = false }
  }

  validation {
    condition = alltrue([
      for name, h in var.hostnames :
      can(regex("^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$", name))
    ])
    error_message = "Hostname keys are single DNS labels (ADR: no nested wildcards)."
  }

  validation {
    condition     = try(var.hostnames["notes-api"].rate_limit, false)
    error_message = "notes-api must exist with rate_limit = true."
  }

  validation {
    condition = alltrue([
      for name in ["grafana", "argocd", "hubble", "auth"] :
      try(!var.hostnames[name].public, false)
    ])
    error_message = "grafana, argocd, hubble, and auth must exist with public = false."
  }
}

variable "email_local_parts" {
  type        = list(string)
  default     = ["ivan", "security"]
  description = "Mailbox local-parts forwarded to operator_email."
}

variable "rate_limit_requests" {
  type        = number
  default     = 40
  description = "Max non-OPTIONS requests per period per IP on rate-limited hostnames. 40/10s stays above the notebook-api token bucket (2 rps, burst 20), which remains the binding limit for passcode guessing, while a browser session (open + store + view + delete, each an X-Auth request) fits. M7-R1-F01."

  validation {
    condition     = var.rate_limit_requests >= 20
    error_message = "rate_limit_requests below 20 throttles a single browser session on /notes (M7-R1-F01)."
  }
}

variable "rate_limit_period" {
  type        = number
  default     = 10
  description = "Rate-limit window in seconds. Cloudflare Free accepts 10 only; Pro can use 60. This root targets Free (ADR-0005)."

  validation {
    condition     = contains([10, 60], var.rate_limit_period)
    error_message = "rate_limit_period must be 10 (Free) or 60 (Pro)."
  }
}
