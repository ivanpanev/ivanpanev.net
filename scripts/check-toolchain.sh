#!/usr/bin/env bash
# Report installed toolchain versions against scripts/versions.env.
# kubectl: within one minor of KUBERNETES_VERSION. talosctl: minor equals TALOS_VERSION.
set -uo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck disable=SC1091
source "$HERE/versions.env"

# name|requirement|command|regex
#   requirement: min:<version> | skew:kubernetes | skew:talos
TOOLS="
git|min:${MIN_GIT}|git --version|[0-9]+\.[0-9]+(\.[0-9]+)?
node|min:${MIN_NODE}|node --version|[0-9]+\.[0-9]+\.[0-9]+
pnpm|min:${MIN_PNPM}|pnpm --version|[0-9]+\.[0-9]+\.[0-9]+
go|min:${MIN_GO}|go version|[0-9]+\.[0-9]+(\.[0-9]+)?
docker|min:${MIN_DOCKER}|docker --version|[0-9]+\.[0-9]+\.[0-9]+
terraform|min:${MIN_TERRAFORM}|terraform --version|[0-9]+\.[0-9]+\.[0-9]+
packer|min:${MIN_PACKER}|packer --version|[0-9]+\.[0-9]+\.[0-9]+
hcloud|min:${MIN_HCLOUD}|hcloud version|[0-9]+\.[0-9]+\.[0-9]+
talosctl|skew:talos|talosctl version --client|[0-9]+\.[0-9]+\.[0-9]+
kubectl|skew:kubernetes|kubectl version --client|[0-9]+\.[0-9]+\.[0-9]+
helm|min:${MIN_HELM}|helm version --short|[0-9]+\.[0-9]+\.[0-9]+
kustomize|min:${MIN_KUSTOMIZE}|kustomize version|[0-9]+\.[0-9]+\.[0-9]+
kubeconform|min:${MIN_KUBECONFORM}|kubeconform -v|[0-9]+\.[0-9]+\.[0-9]+
argocd|min:${MIN_ARGOCD}|argocd version --client --short|[0-9]+\.[0-9]+\.[0-9]+
sops|min:${MIN_SOPS}|sops --version|[0-9]+\.[0-9]+\.[0-9]+
age|min:${MIN_AGE}|age --version|[0-9]+\.[0-9]+\.[0-9]+
gh|min:${MIN_GH}|gh --version|[0-9]+\.[0-9]+\.[0-9]+
cosign|min:${MIN_COSIGN}|cosign version|[0-9]+\.[0-9]+\.[0-9]+
"

vernum() { local IFS=.; read -r a b c <<<"$1"; printf '%d' $(( ${a:-0}*1000000 + ${b:-0}*1000 + ${c:-0} )); }
minor()  { local IFS=.; read -r a b _ <<<"$1"; printf '%d' $(( ${a:-0}*1000 + ${b:-0} )); }

fail=0
printf '%-12s %-12s %-20s %s\n' TOOL INSTALLED REQUIRED STATUS
while IFS='|' read -r name req cmd re; do
  [[ -z "$name" ]] && continue
  case "$req" in
    min:*)           reqtxt=">= ${req#min:}" ;;
    skew:kubernetes) reqtxt="${KUBERNETES_VERSION} +/-1 minor" ;;
    skew:talos)      reqtxt="= ${TALOS_VERSION}.x" ;;
  esac
  if ! command -v "$name" >/dev/null 2>&1; then
    printf '%-12s %-12s %-20s %s\n' "$name" - "$reqtxt" MISSING; fail=1; continue
  fi
  ver=$($cmd 2>&1 | grep -Eo "$re" | head -n1 || true)
  if [[ -z "$ver" ]]; then
    printf '%-12s %-12s %-20s %s\n' "$name" unknown "$reqtxt" UNKNOWN; fail=1; continue
  fi
  ok=0
  case "$req" in
    min:*)           (( $(vernum "$ver") >= $(vernum "${req#min:}") )) && ok=1 ;;
    skew:kubernetes) d=$(( $(minor "$ver") - $(minor "$KUBERNETES_VERSION") )); (( d >= -1 && d <= 1 )) && ok=1 ;;
    skew:talos)      (( $(minor "$ver") == $(minor "$TALOS_VERSION") )) && ok=1 ;;
  esac
  if (( ok )); then st=ok; else st='OUT OF RANGE'; fail=1; fi
  printf '%-12s %-12s %-20s %s\n' "$name" "$ver" "$reqtxt" "$st"
done <<<"$TOOLS"

if (( fail )); then echo; echo "Some tools are missing or out of range. See docs/toolchain.md."; exit 1; fi
echo; echo "All tools present and in range."
