#!/usr/bin/env bash
# Print every git-tracked file that matches a creation rule in .sops.yaml.
# Single source of truth for "which files must be encrypted", used by
# docs/runbooks/secrets.md and .github/workflows/hygiene.yml (M0-R1-F04).
#
# Requires: git, yq (mikefarah, v4). Exits non-zero if yq is missing.
set -euo pipefail

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"

command -v yq >/dev/null 2>&1 || { echo "yq (mikefarah v4) is required" >&2; exit 2; }

# Collect path_regex values; SOPS matches them against the path relative to .sops.yaml.
mapfile -t patterns < <(yq -r '.creation_rules[].path_regex' .sops.yaml)

git ls-files -z | while IFS= read -r -d '' f; do
  for re in "${patterns[@]}"; do
    if [[ "$f" =~ $re ]]; then printf '%s\n' "$f"; break; fi
  done
done
