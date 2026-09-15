#!/usr/bin/env bash
# Report installed toolchain versions against docs/toolchain.md minimums.
set -uo pipefail

# name|minimum|command to print version|regex capturing the version
TOOLS='
git|2.40|git --version|[0-9]+\.[0-9]+(\.[0-9]+)?
node|22.12|node --version|[0-9]+\.[0-9]+\.[0-9]+
pnpm|10.0|pnpm --version|[0-9]+\.[0-9]+\.[0-9]+
go|1.23|go version|[0-9]+\.[0-9]+(\.[0-9]+)?
docker|27.0|docker --version|[0-9]+\.[0-9]+\.[0-9]+
terraform|1.10|terraform --version|[0-9]+\.[0-9]+\.[0-9]+
packer|1.11|packer --version|[0-9]+\.[0-9]+\.[0-9]+
talosctl|1.9|talosctl version --client|[0-9]+\.[0-9]+\.[0-9]+
kubectl|1.32|kubectl version --client|[0-9]+\.[0-9]+\.[0-9]+
helm|3.16|helm version --short|[0-9]+\.[0-9]+\.[0-9]+
kustomize|5.5|kustomize version|[0-9]+\.[0-9]+\.[0-9]+
kubeconform|0.6|kubeconform -v|[0-9]+\.[0-9]+\.[0-9]+
argocd|2.13|argocd version --client --short|[0-9]+\.[0-9]+\.[0-9]+
sops|3.9|sops --version|[0-9]+\.[0-9]+\.[0-9]+
age|1.2|age --version|[0-9]+\.[0-9]+\.[0-9]+
gh|2.60|gh --version|[0-9]+\.[0-9]+\.[0-9]+
cosign|2.4|cosign version|[0-9]+\.[0-9]+\.[0-9]+
'

vernum() { # 1.2.3 -> comparable integer
  local IFS=.; read -r a b c <<<"$1"; printf '%d' $(( ${a:-0}*1000000 + ${b:-0}*1000 + ${c:-0} ))
}

fail=0
printf '%-12s %-12s %-10s %s\n' TOOL INSTALLED MINIMUM STATUS
while IFS='|' read -r name min cmd re; do
  [[ -z "$name" ]] && continue
  if ! command -v "$name" >/dev/null 2>&1; then
    printf '%-12s %-12s %-10s %s\n' "$name" - "$min" MISSING; fail=1; continue
  fi
  ver=$($cmd 2>&1 | grep -Eo "$re" | head -n1 || true)
  if [[ -z "$ver" ]]; then
    printf '%-12s %-12s %-10s %s\n' "$name" unknown "$min" UNKNOWN; fail=1; continue
  fi
  if (( $(vernum "$ver") >= $(vernum "$min") )); then st=ok; else st='TOO OLD'; fail=1; fi
  printf '%-12s %-12s %-10s %s\n' "$name" "$ver" "$min" "$st"
done <<<"$TOOLS"

if (( fail )); then echo; echo "Some tools are missing or outdated. See docs/toolchain.md."; exit 1; fi
echo; echo "All tools present."
