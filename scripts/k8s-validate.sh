#!/usr/bin/env bash
# Render and schema-check every Kubernetes Application in this repo.
# CI cannot decrypt KSOPS, so generators are stripped before kustomize build
# and *.secret.yaml is never passed to kubeconform. hygiene.yml still asserts
# those files are SOPS-encrypted.
set -euo pipefail

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"

command -v kubeconform >/dev/null 2>&1 || { echo "kubeconform is required" >&2; exit 2; }
command -v helm >/dev/null 2>&1 || { echo "helm is required" >&2; exit 2; }
command -v kustomize >/dev/null 2>&1 || { echo "kustomize is required" >&2; exit 2; }

"$ROOT/scripts/check-alerts.sh"

if grep -R --include='*.yaml' -n 'isWALArchiver:[[:space:]]*true' k8s/apps/notebook-restore >/dev/null; then
  echo "k8s-validate: notebook-restore must not set isWALArchiver: true" >&2
  exit 1
fi
if ! grep -q 'cnpg.io/skipWalArchiving: enabled' k8s/apps/notebook-restore/cluster.yaml; then
  echo "k8s-validate: notebook-restore Cluster must set cnpg.io/skipWalArchiving: enabled" >&2
  exit 1
fi
if grep -q '^[[:space:]]*plugins:' k8s/apps/notebook-restore/cluster.yaml; then
  echo "k8s-validate: notebook-restore must not enable spec.plugins (WAL-capable sidecar)" >&2
  exit 1
fi
if ! grep -q 'AUTHENTIK_POSTGRESQL__HOST' k8s/apps/authentik/values.yaml; then
  echo "k8s-validate: authentik must set AUTHENTIK_POSTGRESQL__HOST (existingSecret ignores authentik.postgresql)" >&2
  exit 1
fi

KUBECONFORM_ARGS=(
  -strict
  -ignore-missing-schemas
  -schema-location default
  -schema-location 'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json'
  -summary
)

strip_ksops() {
  local d=$1
  if [[ -f "$d/kustomization.yaml" ]] && grep -q '^generators:' "$d/kustomization.yaml"; then
    # Drop KSOPS generators so CI can render without the age key.
    awk '
      /^generators:/ { skip=1; next }
      skip && /^[[:space:]]+- / { next }
      skip && /^[^[:space:]]/ { skip=0 }
      skip { next }
      { print }
    ' "$d/kustomization.yaml" > "$d/kustomization.yaml.ci"
    mv "$d/kustomization.yaml.ci" "$d/kustomization.yaml"
    rm -f "$d"/ksops-generator.yaml "$d"/*.secret.yaml
  fi
}

render_kustomize() {
  local dir=$1
  local tmp
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' RETURN
  if [[ "$dir" == */overlays/* ]]; then
    # Preserve ../../base relative to the overlay (e.g. notebook-api).
    local app
    app=$(dirname "$(dirname "$dir")")
    mkdir -p "$tmp/$app"
    cp -a "$app/." "$tmp/$app/"
    strip_ksops "$tmp/$app/base"
    strip_ksops "$tmp/$dir"
    echo "==> kustomize build $dir"
    kustomize build --enable-helm --load-restrictor LoadRestrictionsNone "$tmp/$dir" \
      | kubeconform "${KUBECONFORM_ARGS[@]}"
    return
  fi
  cp -a "$dir/." "$tmp/"
  strip_ksops "$tmp"
  echo "==> kustomize build $dir"
  kustomize build --enable-helm --load-restrictor LoadRestrictionsNone "$tmp" \
    | kubeconform "${KUBECONFORM_ARGS[@]}"
}

helm_template() {
  local release=$1 repo=$2 chart=$3 version=$4 values=$5 ns=$6
  echo "==> helm template $chart $version ($values)"
  helm template "$release" "$chart" \
    --repo "$repo" \
    --version "$version" \
    --namespace "$ns" \
    --include-crds \
    -f "$values" \
    | kubeconform "${KUBECONFORM_ARGS[@]}"
}

echo "==> kubeconform static manifests"
while IFS= read -r f; do
  case "$f" in
    *.secret.yaml|*/ksops-generator.yaml|*/values.yaml) continue ;;
  esac
  kubeconform "${KUBECONFORM_ARGS[@]}" "$f"
done < <(git ls-files 'k8s/**/*.yaml' 'k8s/**/*.yml')

render_kustomize k8s/infrastructure/gateway
render_kustomize k8s/infrastructure/cloudflared
render_kustomize k8s/infrastructure/cert-manager-issuers
render_kustomize k8s/infrastructure/kube-prometheus-stack/resources
render_kustomize k8s/infrastructure/loki/resources
render_kustomize k8s/infrastructure/cnpg-operator/resources
render_kustomize k8s/apps/notebook-api/overlays/hetzner
render_kustomize k8s/apps/notebook-restore
render_kustomize k8s/apps/authentik/resources
render_kustomize k8s/clusters/hetzner

helm_template argocd \
  https://argoproj.github.io/argo-helm argo-cd 10.9.1 \
  k8s/bootstrap/argocd/values.yaml argocd

helm_template kube-prometheus-stack \
  https://prometheus-community.github.io/helm-charts kube-prometheus-stack 91.4.1 \
  k8s/infrastructure/kube-prometheus-stack/values.yaml monitoring

helm_template loki \
  https://grafana-community.github.io/helm-charts loki 18.11.7 \
  k8s/infrastructure/loki/values.yaml loki

helm_template k8s-monitoring \
  https://grafana.github.io/helm-charts k8s-monitoring 4.5.2 \
  k8s/infrastructure/k8s-monitoring/values.yaml monitoring

helm_template cnpg \
  https://cloudnative-pg.github.io/charts cloudnative-pg 0.29.0 \
  k8s/infrastructure/cnpg-operator/values.yaml cnpg-system

helm_template plugin-barman-cloud \
  https://cloudnative-pg.github.io/charts plugin-barman-cloud 0.8.0 \
  k8s/infrastructure/barman-cloud/values.yaml cnpg-system

helm_template authentik \
  https://charts.goauthentik.io authentik 2026.8.2 \
  k8s/apps/authentik/values.yaml authentik

echo "k8s-validate: ok"
