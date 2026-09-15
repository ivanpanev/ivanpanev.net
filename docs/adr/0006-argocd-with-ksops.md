# ADR-0006: Argo CD for GitOps with SOPS/age secrets via KSOPS

- Status: Accepted
- Date: 2026-09-16
- Deciders: Ivan Panev

## Context

Everything in the cluster must be declared in Git and reconciled
continuously, on two clusters over time (Hetzner, then home). Both Argo CD
and Flux are CNCF-graduated. Flux is lighter and decrypts SOPS natively;
Argo CD has a UI, broader industry recognition, and a central-management
model. The operator chose Argo CD.

Secrets must be committed encrypted, decryptable by the operator and by the
cluster, and must move to the home cluster without re-encryption ceremonies
tied to a specific cluster's key material.

## Decision

- Argo CD installed via the official Helm chart from
  `k8s/bootstrap/argocd/` (applied once by hand, then self-managed by an
  Argo CD Application).
- App-of-apps: `k8s/clusters/<cluster>/` contains the root Application;
  infrastructure and application Applications are ordered with sync waves
  (CRDs and operators before their custom resources).
- Secrets: SOPS with age recipients (`.sops.yaml`). Argo CD decrypts through
  the KSOPS Kustomize plugin (repo-server init container copies the `ksops`
  binary; `kustomize.buildOptions: --enable-alpha-plugins --enable-exec`).
  The cluster's age private key is a Kubernetes Secret in the `argocd`
  namespace created by hand during bootstrap and never committed.
- Two recipients per file: the operator key and the cluster key. Adding the
  home cluster means adding a third recipient and running `sops updatekeys`.
- Argo CD UI is reachable only through the tunnel behind Cloudflare Access
  (ADR-0005); local admin access uses `argocd login --port-forward`.

## Alternatives considered

- Flux: lighter, native SOPS; rejected by operator preference for Argo CD's UI.
- Sealed Secrets: encryption bound to one cluster's key; migration requires
  re-sealing everything or migrating the sealing key.
- External Secrets Operator with a hosted secret manager: adds an external
  dependency and account; not needed for a single operator.

## Consequences

- ~300 MB more memory than Flux; acceptable on CX43 workers.
- KSOPS is a community plugin; if it breaks, the fallback is the Argo CD
  Config Management Plugin sidecar running `sops -d` directly.
- Argo CD's own manifests contain the bootstrap chicken-and-egg: documented
  in `docs/runbooks/cluster-bootstrap.md`.
