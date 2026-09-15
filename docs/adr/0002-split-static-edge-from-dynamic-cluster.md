# ADR-0002: Static site on Cloudflare, dynamic services in an owned Kubernetes cluster

- Status: Accepted
- Date: 2026-09-16
- Deciders: Ivan Panev

## Context

Requirements: fast, always-available public site; several stateful services
(notebook, later identity, collaboration, messaging, NAS gateway); everything
containerised and migratable to a home Kubernetes cluster; Kubernetes itself is
a learning objective; Loki/Grafana required; budget is modest.

Cloudflare's Workers platform can host the whole thing cheaply, but its
stateful primitives (KV, D1, Durable Objects, Queues) have no equivalent in
Kubernetes. Anything written against them would need a rewrite to move home.
Conversely, serving the public site from a home uplink would tie site
availability to residential connectivity.

## Decision

- The public site (`apps/web`) is a fully static build deployed to Cloudflare
  Workers Static Assets. It never depends on the cluster. It stays on
  Cloudflare permanently, including after the dynamic services move home.
- All dynamic and stateful services run as containers in a Kubernetes cluster
  that we own and operate (Hetzner Cloud now, home cluster later).
- Cloudflare is used only for capabilities that are portable by nature or that
  sit in front of the cluster: DNS, CDN, WAF/rate limiting, Tunnel, Access,
  Email Routing. No application logic runs in Workers.
- Client-side tools that can run entirely in the browser (subnet calculator,
  counters, secret generator, PGP verification, later the editor) run entirely
  in the browser. No backend is built for something the browser can do.

## Alternatives considered

- Cloudflare-only (Workers + KV/D1/DO): cheapest, fastest to ship, fails the
  portability requirement for stateful services and removes the Kubernetes
  learning objective.
- Single Hetzner VM with Docker Compose: cheap and portable, but does not
  exercise Kubernetes, GitOps, or the observability stack.
- Managed Kubernetes (third-party on Hetzner): removes control-plane
  operations, which is the part that is meant to be learned; adds a
  management fee.

## Consequences

- Two deployment pipelines (wrangler for the site, Argo CD for the cluster);
  both are simple and independent.
- The site cannot render dynamic content server-side; interactive features are
  islands calling APIs on subdomains with CORS. Acceptable for a personal site.
- A cluster outage never takes down the CV, blog, or tools.
- Revisit if Cloudflare changes the free tier for static assets or Tunnel, or
  if a feature genuinely needs edge compute.
