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
- Tunnel ingress has one explicit rule per published hostname, all pointing
  at the in-cluster Cilium Gateway Service (ClusterIP), and a final catch-all
  that returns `http_status:404`. A hostname that is not in the list is not
  forwarded, whatever DNS says. Path routing within a hostname lives in
  Kubernetes as `HTTPRoute` objects.
- Access is enforced twice for every administrative hostname: at the edge by
  the Access policy, and again at the origin by cloudflared itself, which
  validates the `Cf-Access-Jwt-Assertion` JWT against the team's JWKS before
  forwarding (`originRequest.access: {required: true, teamName, audTag}`).
  A request that reaches the Gateway for an admin hostname has therefore
  carried a valid Access token for that application's audience; a DNS record
  or Terraform drift cannot expose an origin without also removing its
  Access application, which the invariant below forbids.
- Terraform invariant: one `hostnames` map in `infra/terraform/cloudflare`
  generates the DNS record, the tunnel ingress rule, and the Access
  application and policy for each entry. An entry must either reference an
  Access policy or be explicitly marked `public = true` (validated at plan
  time); there is no third state.
- Applications that can consume the JWT themselves (Grafana `auth.jwt`) also
  do so, giving them the identity for authorisation without a second login
  (ADR-0014).
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
- Adding a hostname is one Terraform entry, one `HTTPRoute`, one cloudflared
  `toEndpoints` egress rule and one backend `fromEntities: [ingress]` rule
  (see the 2026-09-17 revision). Forgetting the first two produces a 404;
  forgetting either policy produces a 403 from Envoy. Neither is an exposure.
  `scripts/check-gateway-policy.py` fails CI when the policies are missing.

## Revisions

- 2026-09-16 (M0-R1-F12): replaced the wildcard tunnel rule with explicit
  per-hostname rules and a 404 catch-all; added origin-side JWT validation in
  cloudflared and the Terraform hostnames invariant.
- 2026-09-16 (M3): CiliumGatewayClassConfig on the deployed Cilium rejects
  `service.type: ClusterIP` (only `LoadBalancer` and `NodePort`). The Gateway
  class uses `NodePort`. The resulting Service still has a ClusterIP, which
  remains the tunnel origin. No LoadBalancer is created (CCM Service
  controller is off; Hetzner firewall does not expose NodePorts).
- 2026-09-17 (M7, M7-R1-F05): Cilium's Gateway data path is the per-node
  Envoy, which forwards with the reserved `ingress` identity and enforces the
  client's egress policy against the backend pod:port, not the Gateway VIP
  (cilium/cilium#47617). A hostname therefore also needs a
  `CiliumNetworkPolicy` `toEndpoints` rule in
  `k8s/infrastructure/cloudflared/ciliumnetworkpolicy.yaml` and a
  `fromEntities: [ingress]` rule beside the backend
  (`k8s/infrastructure/gateway/backend-ingress-entity.yaml` or the app's own
  `ciliumnetworkpolicy.yaml`). Missing either shows as `403 Access denied`
  with `http-request DROPPED` in `hubble observe --protocol http`; plain
  `NetworkPolicy` `namespaceSelector: gateway` rules never match. Pod labels
  and container ports in those rules mirror Helm chart internals, so a chart
  rename is only visible in Hubble; `scripts/check-gateway-policy.py` checks
  the parts that are static (namespace coverage on both sides, port
  agreement).
