#!/usr/bin/env bash
# Install the ivanpanev.net toolchain inside WSL or any Linux (Fedora or Debian family).
#
# Every download is a pinned release (scripts/versions.env) verified against the
# project's published SHA-256 checksum file. No `curl | sh` installers (M0-R1-F09).
#
# Usage:
#   scripts/setup-wsl.sh [--check] [group ...]
#     groups: web go infra cluster secrets all (default: all)
#     --check  resolve every download URL (HTTP HEAD) without installing;
#              used to produce evidence that the pins are valid.
set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=versions.env
set -a; # export everything from versions.env
# shellcheck disable=SC1091
source "$HERE/versions.env"
set +a

CHECK_ONLY=0
GROUPS_WANTED=()
for a in "$@"; do
  case "$a" in
    --check) CHECK_ONLY=1 ;;
    web|go|infra|cluster|secrets|all) GROUPS_WANTED+=("$a") ;;
    *) echo "unknown argument: $a" >&2; exit 2 ;;
  esac
done
[[ ${#GROUPS_WANTED[@]} -eq 0 ]] && GROUPS_WANTED=(all)

want() { [[ " ${GROUPS_WANTED[*]} " == *" all "* || " ${GROUPS_WANTED[*]} " == *" $1 "* ]]; }
have() { command -v "$1" >/dev/null 2>&1; }
log()  { printf '\033[36m[%s]\033[0m %s\n' "$1" "$2"; }

ARCH=$(uname -m)
case "$ARCH" in
  x86_64)  GOARCH=amd64; NODEARCH=x64 ;;
  aarch64) GOARCH=arm64; NODEARCH=arm64 ;;
  *) echo "unsupported arch $ARCH" >&2; exit 1 ;;
esac

BIN="${HOME}/.local/bin"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$BIN"
case ":$PATH:" in *":$BIN:"*) ;; *) echo "NOTE: add $BIN to PATH (e.g. in ~/.bashrc)"; export PATH="$BIN:$PATH" ;; esac

FAILED=0

# head_ok URL -> exit 0 if the URL resolves (follows redirects)
head_ok() { curl -fsSIL -o /dev/null "$1"; }

# fetch URL DEST  -> download or, in --check mode, only verify the URL resolves
fetch() {
  local url=$1 dest=$2
  if (( CHECK_ONLY )); then
    if head_ok "$url"; then echo "  ok   $url"; else echo "  FAIL $url"; FAILED=1; fi
    return 0
  fi
  curl -fsSL --retry 3 -o "$dest" "$url"
}

# verify FILE CHECKSUM_FILE [NAME]
#   NAME is the file name as it appears in the checksum file (defaults to basename).
verify() {
  local file=$1 sums=$2 name=${3:-$(basename "$1")}
  (( CHECK_ONLY )) && return 0
  local expected
  # checksum files are "<sha256>  <name>" or "<sha256> *<name>"; a bare sha256 file has one field
  expected=$( { grep -E "[[:space:]]\*?${name//./\\.}\$" "$sums" || true; } | awk '{print $1}' | head -n1)
  if [[ -z "$expected" && $(wc -w <"$sums") -eq 1 ]]; then expected=$(tr -d '[:space:]' <"$sums"); fi
  if [[ -z "$expected" ]]; then echo "checksum for $name not found in $sums" >&2; exit 1; fi
  echo "$expected  $file" | sha256sum -c --quiet - || { echo "CHECKSUM MISMATCH for $name" >&2; exit 1; }
}

# install_bin SRC NAME -> place executable in $BIN
install_bin() { (( CHECK_ONLY )) && return 0; install -m 0755 "$1" "$BIN/$2"; }

pkg_install() {
  (( CHECK_ONLY )) && { echo "  ok   distro packages: $*"; return 0; }
  if have dnf; then sudo dnf install -y "$@"
  elif have apt-get; then sudo apt-get install -y "$@"
  else echo "no supported package manager (dnf/apt-get)" >&2; exit 1; fi
}

if ! (( CHECK_ONLY )); then
  have apt-get && sudo apt-get update -y
  pkg_install git curl jq unzip tar xz-utils 2>/dev/null || pkg_install git curl jq unzip tar xz
fi

# ---------------------------------------------------------------- web
if want web; then
  if (( CHECK_ONLY )) || ! have node || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt "${MIN_NODE%%.*}" ]]; then
    log install "Node.js ${PIN_NODE}"
    f="node-v${PIN_NODE}-linux-${NODEARCH}.tar.xz"
    fetch "https://nodejs.org/dist/v${PIN_NODE}/${f}" "$TMP/$f"
    fetch "https://nodejs.org/dist/v${PIN_NODE}/SHASUMS256.txt" "$TMP/SHASUMS256.txt"
    verify "$TMP/$f" "$TMP/SHASUMS256.txt"
    if ! (( CHECK_ONLY )); then
      sudo mkdir -p /usr/local/lib/nodejs && sudo tar -xJf "$TMP/$f" -C /usr/local/lib/nodejs
      sudo ln -sfn "/usr/local/lib/nodejs/node-v${PIN_NODE}-linux-${NODEARCH}/bin/node" /usr/local/bin/node
      sudo ln -sfn "/usr/local/lib/nodejs/node-v${PIN_NODE}-linux-${NODEARCH}/bin/npm"  /usr/local/bin/npm
      sudo ln -sfn "/usr/local/lib/nodejs/node-v${PIN_NODE}-linux-${NODEARCH}/bin/npx"  /usr/local/bin/npx
    fi
  fi
  if (( CHECK_ONLY )); then
    fetch "https://registry.npmjs.org/pnpm/${PIN_PNPM}" /dev/null
  elif ! have pnpm; then
    log install "pnpm ${PIN_PNPM}"
    npm install -g "pnpm@${PIN_PNPM}"
  fi
fi

# ---------------------------------------------------------------- go
if want go && { (( CHECK_ONLY )) || ! have go; }; then
  log install "Go ${PIN_GO}"
  f="go${PIN_GO}.linux-${GOARCH}.tar.gz"
  fetch "https://go.dev/dl/${f}" "$TMP/$f"
  fetch "https://go.dev/dl/${f}.sha256" "$TMP/$f.sha256"
  if ! (( CHECK_ONLY )); then
    echo "$(cat "$TMP/$f.sha256")  $TMP/$f" | sha256sum -c --quiet -
    sudo rm -rf /usr/local/go && sudo tar -C /usr/local -xzf "$TMP/$f"
    echo "NOTE: add /usr/local/go/bin to PATH"
  fi
fi

# ---------------------------------------------------------------- infra
if want infra; then
  for tool in terraform packer; do
    if (( CHECK_ONLY )) || ! have "$tool"; then
      v=$(tool_upper=${tool^^}; eval "echo \$PIN_${tool_upper}")
      log install "$tool $v"
      f="${tool}_${v}_linux_${GOARCH}.zip"
      fetch "https://releases.hashicorp.com/${tool}/${v}/${f}" "$TMP/$f"
      fetch "https://releases.hashicorp.com/${tool}/${v}/${tool}_${v}_SHA256SUMS" "$TMP/${tool}_SHA256SUMS"
      verify "$TMP/$f" "$TMP/${tool}_SHA256SUMS"
      (( CHECK_ONLY )) || unzip -qo "$TMP/$f" "$tool" -d "$BIN"
    fi
  done
  if (( CHECK_ONLY )) || ! have hcloud; then
    log install "hcloud ${PIN_HCLOUD}"
    f="hcloud-linux-${GOARCH}.tar.gz"
    base="https://github.com/hetznercloud/cli/releases/download/v${PIN_HCLOUD}"
    fetch "$base/$f" "$TMP/$f"; fetch "$base/checksums.txt" "$TMP/hcloud_checksums.txt"
    verify "$TMP/$f" "$TMP/hcloud_checksums.txt"
    (( CHECK_ONLY )) || { tar -xzf "$TMP/$f" -C "$TMP" hcloud && install_bin "$TMP/hcloud" hcloud; }
  fi
fi

# ---------------------------------------------------------------- cluster
if want cluster; then
  if (( CHECK_ONLY )) || ! have kubectl; then
    log install "kubectl ${PIN_KUBECTL}"
    base="https://dl.k8s.io/release/v${PIN_KUBECTL}/bin/linux/${GOARCH}"
    fetch "$base/kubectl" "$TMP/kubectl"; fetch "$base/kubectl.sha256" "$TMP/kubectl.sha256"
    if ! (( CHECK_ONLY )); then
      echo "$(cat "$TMP/kubectl.sha256")  $TMP/kubectl" | sha256sum -c --quiet -
      install_bin "$TMP/kubectl" kubectl
    fi
  fi
  if (( CHECK_ONLY )) || ! have helm; then
    log install "helm ${PIN_HELM}"
    f="helm-v${PIN_HELM}-linux-${GOARCH}.tar.gz"
    fetch "https://get.helm.sh/${f}" "$TMP/$f"; fetch "https://get.helm.sh/${f}.sha256sum" "$TMP/$f.sha256sum"
    verify "$TMP/$f" "$TMP/$f.sha256sum"
    (( CHECK_ONLY )) || { tar -xzf "$TMP/$f" -C "$TMP" "linux-${GOARCH}/helm" && install_bin "$TMP/linux-${GOARCH}/helm" helm; }
  fi
  if (( CHECK_ONLY )) || ! have kustomize; then
    log install "kustomize ${PIN_KUSTOMIZE}"
    f="kustomize_v${PIN_KUSTOMIZE}_linux_${GOARCH}.tar.gz"
    base="https://github.com/kubernetes-sigs/kustomize/releases/download/kustomize%2Fv${PIN_KUSTOMIZE}"
    fetch "$base/$f" "$TMP/$f"; fetch "$base/checksums.txt" "$TMP/kustomize_checksums.txt"
    verify "$TMP/$f" "$TMP/kustomize_checksums.txt"
    (( CHECK_ONLY )) || { tar -xzf "$TMP/$f" -C "$TMP" kustomize && install_bin "$TMP/kustomize" kustomize; }
  fi
  if (( CHECK_ONLY )) || ! have talosctl; then
    log install "talosctl ${PIN_TALOSCTL}"
    base="https://github.com/siderolabs/talos/releases/download/v${PIN_TALOSCTL}"
    fetch "$base/talosctl-linux-${GOARCH}" "$TMP/talosctl"; fetch "$base/sha256sum.txt" "$TMP/talos_sha256sum.txt"
    verify "$TMP/talosctl" "$TMP/talos_sha256sum.txt" "talosctl-linux-${GOARCH}"
    install_bin "$TMP/talosctl" talosctl
  fi
  if (( CHECK_ONLY )) || ! have argocd; then
    log install "argocd ${PIN_ARGOCD}"
    base="https://github.com/argoproj/argo-cd/releases/download/v${PIN_ARGOCD}"
    fetch "$base/argocd-linux-${GOARCH}" "$TMP/argocd"; fetch "$base/cli_checksums.txt" "$TMP/argocd_checksums.txt"
    verify "$TMP/argocd" "$TMP/argocd_checksums.txt" "argocd-linux-${GOARCH}"
    install_bin "$TMP/argocd" argocd
  fi
  if (( CHECK_ONLY )) || ! have kubeconform; then
    log install "kubeconform ${PIN_KUBECONFORM}"
    f="kubeconform-linux-${GOARCH}.tar.gz"
    base="https://github.com/yannh/kubeconform/releases/download/v${PIN_KUBECONFORM}"
    fetch "$base/$f" "$TMP/$f"; fetch "$base/CHECKSUMS" "$TMP/kubeconform_CHECKSUMS"
    verify "$TMP/$f" "$TMP/kubeconform_CHECKSUMS"
    (( CHECK_ONLY )) || { tar -xzf "$TMP/$f" -C "$TMP" kubeconform && install_bin "$TMP/kubeconform" kubeconform; }
  fi
  if (( CHECK_ONLY )) || ! have cosign; then
    log install "cosign ${PIN_COSIGN}"
    base="https://github.com/sigstore/cosign/releases/download/v${PIN_COSIGN}"
    fetch "$base/cosign-linux-${GOARCH}" "$TMP/cosign"; fetch "$base/cosign_checksums.txt" "$TMP/cosign_checksums.txt"
    verify "$TMP/cosign" "$TMP/cosign_checksums.txt" "cosign-linux-${GOARCH}"
    install_bin "$TMP/cosign" cosign
  fi
fi

# ---------------------------------------------------------------- secrets
if want secrets; then
  if (( CHECK_ONLY )) || ! have sops; then
    log install "sops ${PIN_SOPS}"
    base="https://github.com/getsops/sops/releases/download/v${PIN_SOPS}"
    fetch "$base/sops-v${PIN_SOPS}.linux.${GOARCH}" "$TMP/sops"; fetch "$base/sops-v${PIN_SOPS}.checksums.txt" "$TMP/sops_checksums.txt"
    verify "$TMP/sops" "$TMP/sops_checksums.txt" "sops-v${PIN_SOPS}.linux.${GOARCH}"
    install_bin "$TMP/sops" sops
  fi
  # age publishes no checksum file; use the distro package (Fedora and Debian both ship it).
  if (( CHECK_ONLY )) || ! have age; then pkg_install age; fi
fi

# ---------------------------------------------------------------- always: gh
if (( CHECK_ONLY )) || ! have gh; then
  log install "gh ${PIN_GH}"
  f="gh_${PIN_GH}_linux_${GOARCH}.tar.gz"
  base="https://github.com/cli/cli/releases/download/v${PIN_GH}"
  fetch "$base/$f" "$TMP/$f"; fetch "$base/gh_${PIN_GH}_checksums.txt" "$TMP/gh_checksums.txt"
  verify "$TMP/$f" "$TMP/gh_checksums.txt"
  (( CHECK_ONLY )) || { tar -xzf "$TMP/$f" -C "$TMP" "gh_${PIN_GH}_linux_${GOARCH}/bin/gh" && install_bin "$TMP/gh_${PIN_GH}_linux_${GOARCH}/bin/gh" gh; }
fi

if (( CHECK_ONLY )); then
  if (( FAILED )); then echo; echo "Some pinned URLs did not resolve. Fix scripts/versions.env."; exit 1; fi
  echo; echo "All pinned URLs resolve."
  exit 0
fi
printf '\n\033[32mDone.\033[0m Run scripts/check-toolchain.sh to verify versions.\n'
