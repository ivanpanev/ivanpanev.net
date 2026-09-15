# ADR-0005: Cloudflare Tunnel and Access as the only HTTP ingress; no Hetzner load balancer

- Status: Accepted
- Date: 2026-09-16
- Deciders: Ivan Panev

## Context

The cluster must be reachable for a handful of hostnames (`notes-api.`,
`grafana.`, `argocd.`, `hubble.`, later more). A Hetzner load balancer costs
EUR 7.49/month and exposes a public IP. At home there will be no static IP and
no desire to open ports. Admin surfaces need authentication in front of them
before they are exposed at all.

## Decision

- Two `cloudflared` replicas run in the cluster and register a named Cloudflare
  Tunnel. Public hostnames are CNAMEs to the tunnel. No Service of type
  LoadBalancer is created for HTTP traffic.
- Tunnel ingress has a single catch-all rule that forwards
  `*.ivanpanev.net` to the in-cluster Cilium Gateway Service (ClusterIP).
  Per-hostname routing lives in Kubernetes as `HTTPRoute` objects, not in
  Cloudflare configuration.
- TLS terminates at Cloudflare; the tunnel is encrypted; the in-cluster hop
  from cloudflared to the Gateway is plain HTTP inside the cluster network.
  cert-manager is still installed (Cloudflare DNS-01) for internal TLS where
  needed later.
- Every administrative hostname has a Cloudflare Access application and
  policy in front of it (Terraform-managed). Public APIs have a Cloudflare
  rate-limiting rule.
- Kubernetes and Talos APIs are not behind the tunnel; they are firewalled to
  the operator address at the Hetzner firewall.

## Alternatives considered

- Hetzner LB + public Gateway: works, costs money, exposes the origin,
  and does not translate to the home network.
- Tailscale/WireGuard only: fine for admin, useless for public APIs and for
  friends without a client.

## Consequences

- Identical ingress pattern on Hetzner and at home; migration is a route
  change per hostname.
- Cloudflare proxy limits apply: 100 MB request body on Free/Pro, 100 s
  origin response timeout, no UDP. Large uploads must be chunked; media for
  future voice features needs a direct public IP.
- Availability of everything behind the tunnel depends on Cloudflare.
- If the Cilium Gateway cannot be made ClusterIP-only on the deployed
  version, the fallback is cloudflared ingress rules pointing directly at
  Services; this is a contained change in one manifest and one Terraform
  resource.
