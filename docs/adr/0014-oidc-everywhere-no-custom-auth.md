# ADR-0014: No home-grown authentication; Cloudflare Access now, OIDC IdP later

- Status: Accepted
- Date: 2026-09-16
- Deciders: Ivan Panev

## Context

Phase 1 exposes admin surfaces (Grafana, Argo CD, Hubble) and one public API
(notebook) whose access model is the passcode design in ADR-0009. Phase 2
adds accounts for friends and family across several applications. Writing
and maintaining authentication is the fastest way to introduce a security
flaw.

## Decision

- No application in this repository implements its own user database,
  password handling, or session management.
- Phase 1: every administrative hostname is behind a Cloudflare Access
  application with a policy limited to the operator's identity (one-time PIN
  by email initially). Access is Terraform-managed.
- Phase 2: a self-hosted OpenID Connect provider (default Authentik, see
  OD-3) becomes the identity source; applications consume OIDC; Cloudflare
  Access federates to it so the same identity works at the edge and in-app.
- The notebook intentionally has no accounts; its access model is the
  passcode-derived key (ADR-0009).

## Consequences

- Admin access depends on Cloudflare Access availability; local fallback is
  `kubectl port-forward` from the firewalled operator address.
- Applications must be chosen or built to accept OIDC or forward-auth
  headers; this constrains future self-hosted software choices in a useful
  way.
