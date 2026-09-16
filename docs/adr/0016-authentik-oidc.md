# ADR-0016: Authentik as the self-hosted OIDC identity provider

- Status: Accepted
- Date: 2026-09-16
- Deciders: Ivan Panev

## Context

ADR-0014 deferred a self-hosted OpenID Connect provider to Phase 2 so the
database, backup, and observability layers could exist first. Open decision
OD-3 (Authentik vs Pocket ID) is needed before any friends-and-family
application that consumes OIDC, and before Cloudflare Access can federate to
an in-cluster IdP. Pocket ID is passkey-only, which is a hurdle for family
members. Authentik 2025.10 onwards is Postgres-only (no Redis), which matches
ADR-0010.

## Decision

- The Phase 2 identity provider is Authentik (Helm chart `authentik/authentik`,
  pinned), Postgres via CloudNativePG in namespace `authentik`, WAL and
  nightly backups to `s3://ivp-cnpg/authentik`.
- Hostname `auth.ivanpanev.net` is a Cloudflare Access application
  (`public = false`), the same operator-OTP gate as Grafana/Argo/Hubble.
  Access still validates JWTs at the tunnel origin (ADR-0005). Authentik
  does not become a public IdP on day one.
- No application in this repository implements its own user database
  (ADR-0014). Grafana and Argo CD keep their Phase 1 Access-JWT / local-admin
  paths until a follow-up milestone federates Access to Authentik and switches
  those apps to OIDC.
- Chart-bundled Bitnami PostgreSQL and GeoIP are off. Redis is not deployed.
- Error reporting to Sentry is off.

## Alternatives considered

- Pocket ID: passkey-only; rejected for family members (OD-3 default was
  Authentik).
- Kanidm / Keycloak: heavier or less documented for this size; Authentik
  already speaks OIDC, SAML, LDAP, and forward-auth for apps that do not.
- Public `auth.` without Access: the bootstrap `/if/flow/initial-setup/`
  would be on the internet; rejected.

## Consequences

- ~2 GiB RAM for server + worker plus one 10Gi CNPG volume (~€0.50/mo).
- Identity state is Postgres + object storage, restorable with the same
  drill pattern as the notebook cluster.
- Federating Cloudflare Access to Authentik, then Grafana/Argo OIDC, is a
  later milestone; this ADR only stands up the IdP behind Access.
