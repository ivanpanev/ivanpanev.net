#!/usr/bin/env bash
# Create the operator's age keypair for SOPS and print what to do next.
# Default location is what SOPS searches on Linux/macOS.
set -euo pipefail

KEY_FILE="${1:-${XDG_CONFIG_HOME:-$HOME/.config}/sops/age/keys.txt}"

for t in age-keygen sops; do
  command -v "$t" >/dev/null 2>&1 || { echo "$t not found. Run scripts/setup-wsl.sh secrets first." >&2; exit 1; }
done

if [[ -f "$KEY_FILE" ]]; then
  echo "Key file already exists: $KEY_FILE (not overwriting)"
else
  mkdir -p "$(dirname "$KEY_FILE")"
  age-keygen -o "$KEY_FILE"
  chmod 600 "$KEY_FILE"
  echo "Generated $KEY_FILE"
fi

PUB=$(grep -Eo 'age1[0-9a-z]+' "$KEY_FILE" | head -n1)

cat <<EOF

Public key (paste into .sops.yaml as the operator recipient):
  $PUB

Next steps:
  1. Replace the placeholder in .sops.yaml with $PUB
  2. Back up $KEY_FILE to your password manager. Losing it loses every encrypted file.
  3. Optional: export SOPS_AGE_KEY_FILE=$KEY_FILE if you keep the key elsewhere.
  4. Encrypt a file:  sops --encrypt --in-place path/to/file.enc.yaml
EOF
