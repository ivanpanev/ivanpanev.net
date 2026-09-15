# ADR-0004: Talos Linux on Hetzner Cloud via the hcloud-k8s Terraform module

- Status: Accepted
- Date: 2026-09-16
- Deciders: Ivan Panev

## Context

Requirements: upstream Kubernetes (explicitly not k3s), containerised,
migratable to a home cluster, run as a learning exercise by an SRE. Hetzner
offers no first-party managed Kubernetes as of September 2026. Hetzner
raised prices on 15 June 2026: CPX/CCX families roughly 2.5x, CX/CAX ~1.3x,
so the CX line is now the value option (CX23 2 vCPU/4 GB EUR 5.49, CX43
8 vCPU/16 GB EUR 15.99, Germany/Finland, excl. VAT).

Candidate provisioning routes: kubeadm by hand, kube-hetzner (k3s on
MicroOS), hetzner-k3s, Cluster API, Talos via `hcloud-talos/talos/hcloud`, or
Talos via `hcloud-k8s/kubernetes/hcloud`.

## Decision

- Operating system: Talos Linux. Immutable, API-driven, no SSH, runs vanilla
  Kubernetes components. The same OS runs on Hetzner VMs and on homelab metal
  or Proxmox VMs, so the migration is a configuration change.
- Provisioning: Terraform module `hcloud-k8s/kubernetes/hcloud`, which
  bundles Cilium (CNI and Gateway API), the Hetzner Cloud Controller Manager,
  the hcloud CSI driver, cert-manager, metrics-server, and Talos image
  creation. Root module in `infra/terraform/hetzner/`.
- Initial shape: 1x CX23 control plane, 2x CX43 workers, location `fsn1`.
  The module requires >= 4 GB per control-plane node; CX23 meets it. Control
  plane can be grown to 3 nodes later by changing `count`.
- Kubernetes and Talos APIs are firewalled to the operator's source address
  (`firewall_use_current_ipv4` / `firewall_api_source`); nothing else on the
  nodes is reachable from the internet.
- Ingress NGINX is disabled (retired upstream March 2026); Gateway API via
  Cilium is the routing layer (see ADR-0005).
- Storage class named `default` backed by hcloud CSI; workloads reference the
  class name only.

## Alternatives considered

- kube-hetzner: mature, but k3s + MicroOS, which the requirements exclude.
- hcloud-talos module: good and leaner; chosen module bundles more of the
  platform pieces we need with sane defaults.
- Cluster API: heavier management-cluster model, unnecessary at this scale.
- Managed control plane via a third party: removes the learning objective.

## Consequences

- No SSH: all node operations go through `talosctl`; upgrades are
  `talosctl upgrade` and `talosctl upgrade-k8s`, documented in runbooks.
- A single control-plane node is a single point of failure for the API
  server (workloads keep running). Accepted for cost; documented as a known
  risk with the upgrade path.
- Packer and `talosctl` are required on the operator machine.
- Revisit when Hetzner ships managed Kubernetes, or when the home cluster
  becomes primary.
