#!/usr/bin/env bash
# Install the ivanpanev.net toolchain inside WSL (Fedora or Debian/Ubuntu).
# Idempotent. Usage: scripts/setup-wsl.sh [web|go|infra|cluster|secrets|all]
set -euo pipefail

GROUPS_WANTED=("${@:-all}")
want() { [[ " ${GROUPS_WANTED[*]} " == *" all "* || " ${GROUPS_WANTED[*]} " == *" $1 "* ]]; }
have() { command -v "$1" >/dev/null 2>&1; }
log()  { printf '\033[36m[%s]\033[0m %s\n' "$1" "$2"; }

ARCH=$(uname -m)
case "$ARCH" in
  x86_64) GOARCH=amd64 ;;
  aarch64) GOARCH=arm64 ;;
  *) echo "unsupported arch $ARCH" >&2; exit 1 ;;
esac

BIN="${HOME}/.local/bin"
mkdir -p "$BIN"
case ":$PATH:" in *":$BIN:"*) ;; *) echo "Add $BIN to PATH (e.g. in ~/.bashrc)"; export PATH="$BIN:$PATH" ;; esac

if have dnf; then
  PKG="sudo dnf install -y"
elif have apt-get; then
  PKG="sudo apt-get install -y"
  sudo apt-get update -y
else
  echo "no supported package manager" >&2; exit 1
fi

$PKG git curl jq unzip tar >/dev/null

if want web; then
  if ! have node || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 22 ]]; then
    log install "Node.js 22 via nvm"
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
    # shellcheck disable=SC1090
    source "$HOME/.nvm/nvm.sh"
    nvm install 22
  fi
  corepack enable || true
fi

if want go && ! have go; then
  GO_VERSION=1.23.4
  log install "Go $GO_VERSION"
  curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-${GOARCH}.tar.gz" -o /tmp/go.tgz
  sudo rm -rf /usr/local/go && sudo tar -C /usr/local -xzf /tmp/go.tgz
  echo 'Add /usr/local/go/bin to PATH'
fi

if want infra; then
  have terraform || { log install terraform; curl -fsSL https://releases.hashicorp.com/terraform/1.10.5/terraform_1.10.5_linux_${GOARCH}.zip -o /tmp/tf.zip && unzip -qo /tmp/tf.zip -d "$BIN"; }
  have packer    || { log install packer;    curl -fsSL https://releases.hashicorp.com/packer/1.11.2/packer_1.11.2_linux_${GOARCH}.zip -o /tmp/pk.zip && unzip -qo /tmp/pk.zip -d "$BIN"; }
  have hcloud    || { log install hcloud;    curl -fsSL "https://github.com/hetznercloud/cli/releases/latest/download/hcloud-linux-${GOARCH}.tar.gz" | tar -xz -C "$BIN" hcloud; }
fi

if want cluster; then
  have kubectl   || { log install kubectl;   KV=$(curl -fsSL https://dl.k8s.io/release/stable.txt); curl -fsSL "https://dl.k8s.io/release/${KV}/bin/linux/${GOARCH}/kubectl" -o "$BIN/kubectl" && chmod +x "$BIN/kubectl"; }
  have helm      || { log install helm;      curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | HELM_INSTALL_DIR="$BIN" USE_SUDO=false bash; }
  have kustomize || { log install kustomize; curl -fsSL https://raw.githubusercontent.com/kubernetes-sigs/kustomize/master/hack/install_kustomize.sh | bash -s -- 5.5.0 "$BIN"; }
  have talosctl  || { log install talosctl;  curl -fsSL https://talos.dev/install | sh; }
  have argocd    || { log install argocd;    curl -fsSL "https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-${GOARCH}" -o "$BIN/argocd" && chmod +x "$BIN/argocd"; }
  have kubeconform || { log install kubeconform; curl -fsSL "https://github.com/yannh/kubeconform/releases/latest/download/kubeconform-linux-${GOARCH}.tar.gz" | tar -xz -C "$BIN" kubeconform; }
  have cosign    || { log install cosign;    curl -fsSL "https://github.com/sigstore/cosign/releases/latest/download/cosign-linux-${GOARCH}" -o "$BIN/cosign" && chmod +x "$BIN/cosign"; }
fi

if want secrets; then
  have sops || { log install sops; curl -fsSL "https://github.com/getsops/sops/releases/latest/download/sops-v3.9.4.linux.${GOARCH}" -o "$BIN/sops" && chmod +x "$BIN/sops"; }
  have age  || { log install age;  curl -fsSL "https://github.com/FiloSottile/age/releases/latest/download/age-v1.2.1-linux-${GOARCH}.tar.gz" | tar -xz --strip-components=1 -C "$BIN" age/age age/age-keygen; }
fi

printf '\n\033[32mDone.\033[0m Run scripts/check-toolchain.sh to verify versions.\n'
