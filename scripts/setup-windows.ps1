#Requires -Version 5.1
<#
.SYNOPSIS
  Install or upgrade the ivanpanev.net toolchain on Windows with winget.

.DESCRIPTION
  Idempotent. A tool is installed when missing and upgraded when the installed
  version is below the minimum in scripts/versions.env (M0-R1-F13).
  Package identifiers were verified against the winget source on 2026-09-16
  (`winget search --id <id> --exact`).

.PARAMETER Group
  Subset to install: web, go, infra, cluster, secrets, all (default).

.PARAMETER Check
  Resolve every package identifier with `winget search --exact` and report,
  without installing anything. Used to produce evidence that the IDs are valid.

.EXAMPLE
  pwsh -File scripts/setup-windows.ps1 -Group web,secrets
  pwsh -File scripts/setup-windows.ps1 -Check
#>
[CmdletBinding()]
param(
  [ValidateSet('web', 'go', 'infra', 'cluster', 'secrets', 'all')]
  [string[]]$Group = @('all'),
  [switch]$Check
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'toolchain-common.ps1')
$versions = Read-VersionsEnv (Join-Path $PSScriptRoot 'versions.env')

if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
  throw 'winget is required. Install "App Installer" from the Microsoft Store.'
}

$want = { param($g) $Group -contains 'all' -or $Group -contains $g }
$script:failed = 0

function Ensure-Package {
  param(
    [Parameter(Mandatory)] [string]$Command,
    [Parameter(Mandatory)] [string]$WingetId,
    [string]$MinKey,
    [string]$Display = $Command
  )
  if ($Check) {
    $hit = winget search --id $WingetId --exact --accept-source-agreements 2>&1 |
      Select-String -Pattern ("\s" + [regex]::Escape($WingetId) + "\s")
    if ($hit) { Write-Host "  ok   $WingetId  ($($hit.Line.Trim()))" }
    else      { Write-Host "  FAIL $WingetId not found in winget source" -ForegroundColor Red; $script:failed++ }
    return
  }

  $installed = Get-ToolVersion -Name $Command
  $min = if ($MinKey) { $versions[$MinKey] } else { $null }
  if ($installed -and (-not $min -or (Compare-Version $installed $min) -ge 0)) {
    Write-Host "[skip] $Display $installed already satisfies minimum $min" -ForegroundColor DarkGray
    return
  }
  $verb = if ($installed) { 'upgrade' } else { 'install' }
  Write-Host "[$verb] $Display ($WingetId)" -ForegroundColor Cyan
  winget $verb --id $WingetId --exact --silent --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0) { throw "winget $verb failed for $WingetId (exit $LASTEXITCODE)" }
}

Ensure-Package -Command git -WingetId Git.Git    -MinKey MIN_GIT -Display 'Git'
Ensure-Package -Command gh  -WingetId GitHub.cli -MinKey MIN_GH  -Display 'GitHub CLI'

if (& $want 'web') {
  Ensure-Package -Command node -WingetId OpenJS.NodeJS.LTS -MinKey MIN_NODE -Display 'Node.js LTS'
  Ensure-Package -Command pnpm -WingetId pnpm.pnpm         -MinKey MIN_PNPM -Display 'pnpm'
}

if (& $want 'go') {
  Ensure-Package -Command go -WingetId GoLang.Go -MinKey MIN_GO -Display 'Go'
}

if (& $want 'infra') {
  Ensure-Package -Command terraform -WingetId Hashicorp.Terraform -MinKey MIN_TERRAFORM -Display 'Terraform'
  Ensure-Package -Command packer    -WingetId Hashicorp.Packer    -MinKey MIN_PACKER    -Display 'Packer'
  Ensure-Package -Command hcloud    -WingetId HetznerCloud.CLI    -MinKey MIN_HCLOUD    -Display 'hcloud CLI'
}

if (& $want 'cluster') {
  Ensure-Package -Command kubectl     -WingetId Kubernetes.kubectl    -Display 'kubectl'      # skew-checked by check-toolchain
  Ensure-Package -Command helm        -WingetId Helm.Helm             -MinKey MIN_HELM        -Display 'Helm'
  Ensure-Package -Command kustomize   -WingetId Kubernetes.kustomize  -MinKey MIN_KUSTOMIZE   -Display 'kustomize'
  Ensure-Package -Command talosctl    -WingetId Sidero.talosctl       -Display 'talosctl'     # must match cluster Talos minor
  Ensure-Package -Command argocd      -WingetId argoproj.argocd       -MinKey MIN_ARGOCD      -Display 'Argo CD CLI'
  Ensure-Package -Command kubeconform -WingetId YannHamon.kubeconform -MinKey MIN_KUBECONFORM -Display 'kubeconform'
  Ensure-Package -Command cosign      -WingetId Sigstore.Cosign       -MinKey MIN_COSIGN      -Display 'cosign'
}

if (& $want 'secrets') {
  Ensure-Package -Command sops -WingetId SecretsOPerationS.SOPS -MinKey MIN_SOPS -Display 'SOPS'
  Ensure-Package -Command age  -WingetId FiloSottile.age        -MinKey MIN_AGE  -Display 'age'
}

if ($Check) {
  if ($script:failed -gt 0) { Write-Host "$($script:failed) package id(s) failed to resolve." -ForegroundColor Red; exit 1 }
  Write-Host 'All package ids resolve.' -ForegroundColor Green
  exit 0
}

Write-Host ''
Write-Host 'Done. Open a new terminal so PATH changes apply, then run scripts/check-toolchain.ps1.' -ForegroundColor Green
