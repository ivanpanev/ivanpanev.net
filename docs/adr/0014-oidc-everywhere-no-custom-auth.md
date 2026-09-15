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

How the Phase 1 admin applications consume the Access identity (no double
login, and the origin verifies the edge's claim rather than trusting the
network path, see ADR-0005):

| Application | Mechanism |
| --- | --- |
| Grafana | `auth.jwt` enabled: header `Cf-Access-Jwt-Assertion`, JWKS from `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`, `expect_claims` with the Access application AUD, `auto_sign_up` to Viewer, the operator email mapped to Admin. Grafana's own login form is disabled. |
| Argo CD | Access in front, validated again by cloudflared at the origin (ADR-0005). Argo CD's own login remains as the second factor for write operations through the UI; the local `admin` account is used for bootstrap only and then replaced by a named local account with a strong password stored in SOPS, until SSO to the Phase 2 OIDC provider replaces it. CLI work uses `argocd login --core`, which goes straight to the Kubernetes API through the operator's kubeconfig and needs no Argo CD account (same path as ADR-0006). |
| Hubble UI | No authentication of its own; cloudflared's origin-side JWT validation is the only gate, which is why the hostname is in the Access-required set with no `public` escape hatch (ADR-0005). |

## Alternatives considered

- oauth2-proxy or Authelia in front of every admin app now: a self-hosted
  auth proxy the operator must patch and keep highly available before any
  workload exists; Cloudflare Access does the same job at the edge with no
  in-cluster footprint, and the JWT it issues can be verified at the origin.
- Authentik or Pocket ID from day one: the right end state, but it is a
  stateful, security-critical service that would ship before the database,
  backup and observability layers it depends on are proven; deferred to
  Phase 2 by design.
- Basic auth or application-local admin accounts only: one factor, no
  central revocation, no audit trail; rejected.
- Tailscale/WireGuard-only access to admin UIs: excellent for the operator,
  but does not extend to friends and family, and would bypass the audit
  log that Access provides.

## Consequences

- Admin access depends on Cloudflare Access availability; local fallback is
  `kubectl port-forward` from the firewalled operator address.
- Applications must be chosen or built to accept OIDC or forward-auth
  headers; this constrains future self-hosted software choices in a useful
  way.

## Revisions

- 2026-09-16 (M0-R1-F08, M0-R1-F12): added alternatives and the per-application
  table describing how the Access identity is consumed and verified at origin.
- 2026-09-16 (M0-R2-F06): Argo CD CLI path wording aligned with ADR-0006
  (`--core` uses the kubeconfig directly; no port-forward involved).
