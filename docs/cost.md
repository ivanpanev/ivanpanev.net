# Cost review (updated Milestone 6)

First full invoice has not landed: the cluster was applied 2026-09-16.
This is a **projected** monthly cap from published Hetzner Cloud prices
(Falkenstein, 15 June 2026 adjustment) plus the Terraform inventory, not
a pasted console bill. Replace the “actual” column when the first full
month appears.

Sources: [Hetzner price adjustment 15 June 2026](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/)
(CX23 €5.49 / CX43 €15.99 excl. IPv4). Advertised create-flow prices
including IPv4 are ~€5.99 / €16.49 excl. VAT. Volumes billed per GiB;
Object Storage is usage-based and small at this volume.

| Line | Inventory | Published monthly (excl. VAT) | Actual (paste invoice) |
| --- | --- | --- | --- |
| Control plane | 1× CX23 fsn1 | €5.99 incl. IPv4 | |
| Workers | 2× CX43 fsn1 | 2 × €16.49 = €32.98 | |
| Block volumes | Prometheus 20Gi + Loki 10Gi + Alertmanager 2Gi + notebook 10Gi + authentik 10Gi = 52Gi | ~€2.48 at €0.0476/GiB | |
| Object Storage | `ivp-loki`, `ivp-cnpg`, `ivp-tfstate`, `ivp-etcd` | < €1 at Phase 1 size | |
| Traffic | 20 TB included per instance | €0 expected | |
| Cloudflare | Free plan (DNS, Tunnel, Access, Workers Static Assets) | €0 | |
| GitHub | public Actions minutes | €0 | |
| **Projected total** | | **~€42–45 / month** | |

## What would change the number

- Scaling workers or replacing CX43 after the Cost-Optimized SKU went
  unavailable in the create UI (existing servers keep billing).
- Expanding Prometheus/Loki PVCs (PVCNearFull).
- A restore-drill PVC left behind (~€0.50 until deleted).
- Enabling a Hetzner Load Balancer — forbidden by ADR-0005; would add ~€5.39.

## Operator action

When the first full-month invoice is in the Hetzner console, paste the
line totals into the Actual column (no payment tokens) and keep this file
in Git. Do not retarget buckets to R2 to “save” Object Storage.
