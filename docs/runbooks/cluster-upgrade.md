# Runbook: keep cluster versions and the Terraform module in lockstep

Talos and Kubernetes versions are pinned on the Hetzner Terraform module
(`talos_version`, `kubernetes_version` in `infra/terraform/hetzner`).
`scripts/versions.env` (`TALOS_VERSION`, `KUBERNETES_VERSION`,
`PIN_TALOSCTL`, `PIN_KUBECTL`) must match those pins so the operator's
`talosctl`/`kubectl` can talk to the cluster. This runbook is the
procedure for the first apply and for later bumps.

A full in-place `talosctl upgrade` / `talosctl upgrade-k8s` of a live
cluster is also recorded here so it is not invented under pressure.
Argo CD workload upgrades stay in Milestone 3.

## After the first apply (bootstrap)

```bash
cd infra/terraform/hetzner
terraform output talos_version        # e.g. v1.13.10
terraform output kubernetes_version   # e.g. v1.34.11
export TALOSCONFIG="$PWD/talosconfig"
export KUBECONFIG="$PWD/kubeconfig"
talosctl version --nodes "$(talosctl get members -o jsonpath='{.items[0].metadata.id}' 2>/dev/null || true)"
kubectl version --short
```

Edit `scripts/versions.env`:

- `TALOS_VERSION` = Talos minor (`1.13` for `v1.13.10`)
- `KUBERNETES_VERSION` = Kubernetes minor (`1.34` for `v1.34.11`)
- `PIN_TALOSCTL` = exact Talos version without `v`
- `PIN_KUBECTL` = exact Kubernetes version without `v`

Re-run `scripts/setup-windows.ps1 -Group cluster` or `scripts/setup-wsl.sh cluster`
so the pinned binaries match, then `scripts/check-toolchain.ps1` (or `.sh`).

## Bump the Terraform module (control-plane OS + Kubernetes)

1. Read the module changelog for
   `hcloud-k8s/kubernetes/hcloud` and note its default `talos_version` /
   `kubernetes_version`.
2. Confirm CloudNativePG still supports that Kubernetes minor (ADR-0008:
   1.34–1.36 for CNPG 1.30).
3. Change `version`, `talos_version`, and `kubernetes_version` in
   `infra/terraform/hetzner/kubernetes.tf` (and the variable defaults) in
   **one** PR. Update `scripts/versions.env` in the same PR.
4. `terraform plan` on the Hetzner root. The plan must show the intended
   Talos/Kubernetes change and nothing else unexpected (no accidental
   node recreate unless you mean it).
5. Apply from a machine whose IP is already on `firewall_api_source` (or
   `firewall_use_current_ipv4`). Keep the session until `kubectl get nodes`
   is Ready on every node.
6. Install the matching `talosctl` / `kubectl` **before** you need them
   for the next upgrade. `talosctl` must match the **new** minor to talk
   to upgraded nodes.

## Live upgrade without replacing VMs

Use this when the module pin has moved and the nodes are still on the
previous schematic.

```bash
export TALOSCONFIG="$PWD/infra/terraform/hetzner/talosconfig"
export KUBECONFIG="$PWD/infra/terraform/hetzner/kubeconfig"

# OS first, one node at a time, workers then the control plane.
talosctl upgrade --nodes <worker-ip> --image <installer-image-from-plan>
talosctl upgrade --nodes <cp-ip>     --image <installer-image-from-plan>

# Kubernetes second.
talosctl upgrade-k8s --to v1.34.11
```

Do not skip a Kubernetes minor. Do not upgrade the control plane before
workers if the module's notes say otherwise — follow the plan output.

## Rollback

- A failed `talosctl upgrade` on one node: the node can be rebuilt from
  Terraform (`terraform apply` will recreate a missing server) at the
  cost of that node's empty root disk. User data is not on the root disk
  (ADR-0010).
- A failed `upgrade-k8s`: stay on the previous Kubernetes version; do not
  run another `--to` until `kubectl get nodes` is healthy.
- Module apply that started replacing nodes: `terraform plan` again; if
  delete protection is on, the apply will refuse to destroy the control
  plane. Flip nothing in panic.

## Verify

- `talosctl version` on every node matches `terraform output talos_version`.
- `kubectl version` server minor matches `terraform output kubernetes_version`.
- `scripts/check-toolchain.ps1` is green for kubectl and talosctl.
- `kubectl get nodes` all Ready; `kubectl get pods -A` no CrashLoop from
  the version skew.
