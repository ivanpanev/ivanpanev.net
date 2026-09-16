# Apex is the canonical origin. www is a Worker custom domain so the
# certificate exists; this rule runs before Workers and 301s to the apex.
resource "cloudflare_ruleset" "www_to_apex" {
  zone_id     = local.zone_id
  name        = "www-to-apex"
  description = "Canonicalize www.ivanpanev.net to the apex."
  kind        = "zone"
  phase       = "http_request_dynamic_redirect"

  rules = [{
    action      = "redirect"
    description = "www to apex, preserve path and query"
    enabled     = true
    expression  = "(http.host eq \"www.${var.zone_name}\")"
    action_parameters = {
      from_value = {
        status_code           = 301
        preserve_query_string = true
        target_url = {
          expression = "concat(\"https://${var.zone_name}\", http.request.uri.path)"
        }
      }
    }
  }]
}
