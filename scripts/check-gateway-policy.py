#!/usr/bin/env python3
"""Cross-check HTTPRoute backends against the Cilium policies the Gateway path needs.

Cilium's Gateway data path is the per-node Envoy. For every HTTPRoute backend
two policies must exist besides the route (M7-R1-F05):

  1. cloudflared egress: a `toEndpoints` rule in
     k8s/infrastructure/cloudflared/ciliumnetworkpolicy.yaml selecting pods in
     the backend's namespace on the backend's container port (Envoy enforces
     the client's egress policy against the backend pod, not the Gateway VIP);
  2. backend ingress: a CiliumNetworkPolicy in the backend's namespace that
     allows `fromEntities: [ingress]` on the same container port.

This script asserts that both exist for every backend namespace referenced by
an HTTPRoute and that the two agree on the container port. It cannot know the
Service -> pod label mapping of Helm-managed backends, so label drift after a
chart rename is still only visible in Hubble; the runbook covers that.

Exit codes: 0 ok, 1 policy gap, 2 usage / missing dependency.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

try:
    import yaml
except ImportError:  # pragma: no cover - CI installs python3-yaml
    print("check-gateway-policy: PyYAML is required (apt install python3-yaml)", file=sys.stderr)
    sys.exit(2)

ROOT = Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip())
HTTPROUTES = ROOT / "k8s/infrastructure/gateway/httproutes.yaml"
CLOUDFLARED_CNP = ROOT / "k8s/infrastructure/cloudflared/ciliumnetworkpolicy.yaml"
NS_LABEL = "k8s:io.kubernetes.pod.namespace"


def load_docs(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as fh:
        return [d for d in yaml.safe_load_all(fh) if isinstance(d, dict)]


def ports_of(rule: dict) -> set[str]:
    out: set[str] = set()
    for tp in rule.get("toPorts", []) or []:
        for p in tp.get("ports", []) or []:
            out.add(str(p.get("port")))
    return out


def main() -> int:
    problems: list[str] = []

    # 1. What the routes need: namespace -> set of service names.
    backends: dict[str, set[str]] = {}
    for doc in load_docs(HTTPROUTES):
        if doc.get("kind") != "HTTPRoute":
            continue
        for rule in doc.get("spec", {}).get("rules", []) or []:
            for ref in rule.get("backendRefs", []) or []:
                ns = ref.get("namespace") or doc["metadata"].get("namespace")
                backends.setdefault(ns, set()).add(ref["name"])
    if not backends:
        problems.append(f"{HTTPROUTES.relative_to(ROOT)}: no HTTPRoute backendRefs found")

    # 2. cloudflared egress rules: namespace -> container ports.
    egress: dict[str, set[str]] = {}
    for doc in load_docs(CLOUDFLARED_CNP):
        if doc.get("kind") != "CiliumNetworkPolicy":
            continue
        for rule in doc.get("spec", {}).get("egress", []) or []:
            for ep in rule.get("toEndpoints", []) or []:
                ns = (ep.get("matchLabels") or {}).get(NS_LABEL)
                if ns:
                    egress.setdefault(ns, set()).update(ports_of(rule))

    # 3. backend ingress rules from the reserved `ingress` entity: namespace -> ports.
    ingress: dict[str, set[str]] = {}
    files = subprocess.check_output(["git", "ls-files", "k8s/**/*.yaml", "k8s/*.yaml"], text=True, cwd=ROOT).split()
    for rel in files:
        if rel.endswith(".secret.yaml"):
            continue
        for doc in load_docs(ROOT / rel):
            if doc.get("kind") != "CiliumNetworkPolicy":
                continue
            ns = doc.get("metadata", {}).get("namespace")
            for rule in doc.get("spec", {}).get("ingress", []) or []:
                if "ingress" in (rule.get("fromEntities") or []):
                    ingress.setdefault(ns, set()).update(ports_of(rule))

    for ns, services in sorted(backends.items()):
        svc = ", ".join(sorted(services))
        if ns not in egress:
            problems.append(
                f"HTTPRoute backend {ns}/{svc}: no cloudflared toEndpoints rule for namespace {ns} in "
                f"{CLOUDFLARED_CNP.relative_to(ROOT)}"
            )
        if ns not in ingress:
            problems.append(
                f"HTTPRoute backend {ns}/{svc}: no CiliumNetworkPolicy in namespace {ns} allows fromEntities: [ingress]"
            )
        if ns in egress and ns in ingress and not (egress[ns] & ingress[ns]):
            problems.append(
                f"HTTPRoute backend {ns}/{svc}: cloudflared egress ports {sorted(egress[ns])} share nothing with "
                f"backend ingress ports {sorted(ingress[ns])}"
            )

    for ns in sorted(set(egress) - set(backends)):
        problems.append(f"cloudflared toEndpoints rule for namespace {ns} has no HTTPRoute backend (stale rule)")

    if problems:
        for p in problems:
            print(f"check-gateway-policy: {p}", file=sys.stderr)
        return 1
    print(f"check-gateway-policy: {len(backends)} backend namespace(s) covered on both sides")
    return 0


if __name__ == "__main__":
    sys.exit(main())
