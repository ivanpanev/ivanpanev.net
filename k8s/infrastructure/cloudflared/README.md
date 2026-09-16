# cloudflared

M3 deploys two `cloudflared` replicas that register the named Tunnel
created in `infra/terraform/cloudflare`.

After the Cloudflare apply, the operator encrypts the tunnel token as
`tunnel.secret.yaml` (SOPS in-place, `stringData` only) per
`docs/runbooks/cluster-bootstrap.md`. Recipients: operator + cluster
(`argocd_hetzner` in `.sops.yaml`). That file is not created by CI and
must never exist in plaintext.

Two replicas, PDB `minAvailable: 1`, metrics on `:2000`. Origin is the
ClusterIP Gateway in `gateway`.
