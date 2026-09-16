#!/usr/bin/env bash
# Every platform PrometheusRule alert must have a matching incidents.md heading.
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
RULES="$ROOT/k8s/infrastructure/kube-prometheus-stack/resources/platform-alerts.yaml"
RB="$ROOT/docs/runbooks/incidents.md"

mapfile -t alerts < <(awk '/^[[:space:]]+- alert:/{print $3}' "$RULES")
if [[ ${#alerts[@]} -eq 0 ]]; then
  echo "check-alerts: no alerts in $RULES" >&2
  exit 1
fi
fail=0
for a in "${alerts[@]}"; do
  slug=$(printf '%s' "$a" | tr '[:upper:]' '[:lower:]')
  if ! grep -q "^## ${a}\$" "$RB"; then
    echo "check-alerts: missing heading ## $a in incidents.md" >&2
    fail=1
  fi
  if ! grep -q "runbook: docs/runbooks/incidents.md#${slug}" "$RULES"; then
    echo "check-alerts: $a missing runbook annotation #${slug}" >&2
    fail=1
  fi
done
if [[ $fail -ne 0 ]]; then
  exit 1
fi
echo "check-alerts: ok (${#alerts[@]} alerts)"
