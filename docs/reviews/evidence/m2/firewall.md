# Firewall and API exposure (static review)

Source of truth: `infra/terraform/hetzner/kubernetes.tf`.

| Control | Setting | Effect |
| --- | --- | --- |
| Kubernetes/Talos API source | `firewall_api_source = null` (default) plus `firewall_use_current_ipv4 = true` | Module adds the apply machine's IPv4 to the Hetzner firewall for kube API and Talos API only. |
| Explicit CIDR | `firewall_api_source` non-empty list | Replaces the current-IP allow-list. Empty list is rejected by validation (would lock the APIs). |
| IPv6 API | `firewall_use_current_ipv6 = false` | No IPv6 API allow. |
| Kubernetes API load balancer | `kube_api_load_balancer_enabled = false` | Module does not create `hcloud_load_balancer.kube_api`. |
| CCM Service controller | `hcloud_ccm_load_balancers_enabled = false` | A Service/Gateway of type LoadBalancer cannot mint a Hetzner LB (ADR-0005). |
| Ingress NGINX | `ingress_nginx_enabled = false` | No ingress-nginx LB either. |
| Cilium PROXY protocol | `cilium_gateway_api_proxy_protocol_enabled = false` | cloudflared speaks plain HTTP to the ClusterIP Gateway. |

Live confirmation (`hcloud firewall describe`, `kubectl get svc -A` has no LoadBalancer) is an operator step after apply.
