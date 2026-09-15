#Requires -Version 5.1
<#
.SYNOPSIS
  Install the ivanpanev.net toolchain on Windows with winget.

.DESCRIPTION
  Idempotent: skips tools that are already present. Pass -Group to install a
  subset: web, go, infra, cluster, secrets, all (default).
  Run from an elevated PowerShell only if winget prompts for it; most
  packages install per-user.

.EXAMPLE
  pwsh -File scripts/setup-windows.ps1 -Group web,secrets
#>
[CmdletBinding()]
param(
  [ValidateSet('web', 'go', 'infra', 'cluster', 'secrets', 'all')]
  [string[]]$Group = @('all')
)

$ErrorActionPreference = 'Stop'

function Install-IfMissing {
  param(
    [Parameter(Mandatory)] [string]$Command,
    [Parameter(Mandatory)] [string]$WingetId,
    [string]$Display = $Command
  )
  if (Get-Command $Command -ErrorAction SilentlyContinue) {
    Write-Host "[skip] $Display already installed" -ForegroundColor DarkGray
    return
  }
  Write-Host "[install] $Display ($WingetId)" -ForegroundColor Cyan
  winget install --id $WingetId --exact --silent --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0) { throw "winget failed for $WingetId (exit $LASTEXITCODE)" }
}

if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
  throw 'winget is required. Install "App Installer" from the Microsoft Store.'
}

$want = { param($g) $Group -contains 'all' -or $Group -contains $g }

Install-IfMissing -Command git -WingetId Git.Git -Display 'Git'
Install-IfMissing -Command gh  -WingetId GitHub.cli -Display 'GitHub CLI'

if (& $want 'web') {
  Install-IfMissing -Command node -WingetId OpenJS.NodeJS.LTS -Display 'Node.js LTS'
  Write-Host '[configure] corepack enable (pnpm)' -ForegroundColor Cyan
  corepack enable 2>$null
}

if (& $want 'go') {
  Install-IfMissing -Command go -WingetId GoLang.Go -Display 'Go'
}

if (& $want 'infra') {
  Install-IfMissing -Command terraform -WingetId Hashicorp.Terraform -Display 'Terraform'
  Install-IfMissing -Command packer    -WingetId Hashicorp.Packer    -Display 'Packer'
  Install-IfMissing -Command hcloud    -WingetId Hetzner.hcloud      -Display 'hcloud CLI'
}

if (& $want 'cluster') {
  Install-IfMissing -Command kubectl     -WingetId Kubernetes.kubectl        -Display 'kubectl'
  Install-IfMissing -Command helm        -WingetId Helm.Helm                 -Display 'Helm'
  Install-IfMissing -Command kustomize   -WingetId Kubernetes.kustomize      -Display 'kustomize'
  Install-IfMissing -Command talosctl    -WingetId Sidero.talosctl           -Display 'talosctl'
  Install-IfMissing -Command argocd      -WingetId ArgoProj.ArgoCD           -Display 'Argo CD CLI'
  Install-IfMissing -Command kubeconform -WingetId YannHamon.kubeconform     -Display 'kubeconform'
  Install-IfMissing -Command cosign      -WingetId Sigstore.cosign           -Display 'cosign'
}

if (& $want 'secrets') {
  Install-IfMissing -Command sops -WingetId Mozilla.sops -Display 'SOPS'
  Install-IfMissing -Command age  -WingetId FiloSottile.age -Display 'age'
}

Write-Host ''
Write-Host 'Done. Open a new terminal so PATH changes apply, then run scripts/check-toolchain.ps1.' -ForegroundColor Green
Write-Host 'Note: winget package IDs change occasionally; if one fails, search with: winget search <name>' -ForegroundColor DarkGray
