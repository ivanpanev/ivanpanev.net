---
title: "This site and its platform"
section: platform
order: 1
status: active
stack: [Astro, React, Cloudflare, Talos, Kubernetes, Argo CD, Go, PostgreSQL]
repo: https://github.com/ivanpanev/ivanpanev.net
summary: "A static site at the edge, a small Kubernetes cluster behind a tunnel, and the decisions that keep the two apart."
updated: 2026-09-16
---

## Shape

Two halves that never share a failure domain:

- **Static site.** Built by Astro into a directory of files and uploaded to
  Cloudflare Workers Static Assets. No server, no cold starts, no adapter.
- **Cluster.** Three Talos Linux nodes on Hetzner Cloud, reachable only
  through a Cloudflare Tunnel. Everything dynamic (currently the encrypted
  notebook API) lives here on its own subdomain.

If the cluster is down, the site is unaffected. If Cloudflare is down, well.

## Why not one thing

The temptation is to render the site from the cluster too. It would let pages
read from a database and would make the architecture diagram shorter. It
would also make a personal blog depend on a Kubernetes control plane I
administer alone, at night, for fun. The static half is the part that has to
stay up when I am not looking.

## Decisions

Every non-obvious choice is an architecture decision record in the
repository. The ones that shape everything else:

- Static edge for content, cluster for dynamic services (ADR-0002).
- Astro with React islands, no SSR adapter (ADR-0003).
- Talos on Hetzner via the `hcloud-k8s` Terraform module (ADR-0004).
- Cloudflare Tunnel as the only ingress; no load balancer, no public node
  ports (ADR-0005).
- Argo CD with SOPS/age-encrypted secrets in Git (ADR-0006).
- Persistent state only in Postgres or S3-compatible storage, so the cluster
  can move home later (ADR-0010).

## Migration path

The cluster is designed to be rebuilt. Terraform creates it, Argo CD
populates it from Git, CloudNativePG restores data from object storage. The
plan for moving it to a home rack is the same sequence with a different
Terraform provider and a Garage or MinIO bucket.

## Status

Milestone 1 (this site) is built and under review. Milestones 2 to 5 cover
the cluster, the platform services, the notebook API and a hardening pass
with a real restore drill.
