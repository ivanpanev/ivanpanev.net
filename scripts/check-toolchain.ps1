#Requires -Version 5.1
<#
.SYNOPSIS
  Report installed toolchain versions against scripts/versions.env.

.DESCRIPTION
  Minimums come from MIN_* keys. kubectl is checked for version skew against
  KUBERNETES_VERSION (within one minor); talosctl must match TALOS_VERSION's
  minor exactly. Exit code 1 if anything is missing or out of range.
#>
[CmdletBinding()]
param()

. (Join-Path $PSScriptRoot 'toolchain-common.ps1')
$v = Read-VersionsEnv (Join-Path $PSScriptRoot 'versions.env')

$tools = @(
  @{ Name = 'git';         Min = $v.MIN_GIT }
  @{ Name = 'node';        Min = $v.MIN_NODE }
  @{ Name = 'pnpm';        Min = $v.MIN_PNPM }
  @{ Name = 'go';          Min = $v.MIN_GO }
  @{ Name = 'docker';      Min = $v.MIN_DOCKER }
  @{ Name = 'terraform';   Min = $v.MIN_TERRAFORM }
  @{ Name = 'packer';      Min = $v.MIN_PACKER }
  @{ Name = 'hcloud';      Min = $v.MIN_HCLOUD }
  @{ Name = 'talosctl';    Skew = 'talos' }
  @{ Name = 'kubectl';     Skew = 'kubernetes' }
  @{ Name = 'helm';        Min = $v.MIN_HELM }
  @{ Name = 'kustomize';   Min = $v.MIN_KUSTOMIZE }
  @{ Name = 'kubeconform'; Min = $v.MIN_KUBECONFORM }
  @{ Name = 'argocd';      Min = $v.MIN_ARGOCD }
  @{ Name = 'sops';        Min = $v.MIN_SOPS }
  @{ Name = 'age';         Min = $v.MIN_AGE }
  @{ Name = 'gh';          Min = $v.MIN_GH }
  @{ Name = 'cosign';      Min = $v.MIN_COSIGN }
)

$rows = foreach ($t in $tools) {
  $installed = Get-ToolVersion -Name $t.Name
  $req = if ($t.Skew -eq 'talos') { "= $($v.TALOS_VERSION).x" }
         elseif ($t.Skew -eq 'kubernetes') { "$($v.KUBERNETES_VERSION) +/-1 minor" }
         else { ">= $($t.Min)" }
  if (-not (Get-Command $t.Name -ErrorAction SilentlyContinue)) {
    [pscustomobject]@{ Tool = $t.Name; Installed = '-'; Required = $req; Status = 'MISSING' }; continue
  }
  if (-not $installed) {
    [pscustomobject]@{ Tool = $t.Name; Installed = 'unknown'; Required = $req; Status = 'UNKNOWN' }; continue
  }
  $ok = switch ($t.Skew) {
    'talos'      { (Get-MinorNumber $installed) -eq (Get-MinorNumber $v.TALOS_VERSION) }
    'kubernetes' { [math]::Abs((Get-MinorNumber $installed) - (Get-MinorNumber $v.KUBERNETES_VERSION)) -le 1 }
    default      { (Compare-Version $installed $t.Min) -ge 0 }
  }
  [pscustomobject]@{ Tool = $t.Name; Installed = $installed; Required = $req; Status = $(if ($ok) { 'ok' } else { 'OUT OF RANGE' }) }
}

$rows | Format-Table -AutoSize
$bad = @($rows | Where-Object { $_.Status -ne 'ok' })
if ($bad.Count -gt 0) {
  Write-Host "$($bad.Count) tool(s) missing or out of range. See docs/toolchain.md." -ForegroundColor Yellow
  exit 1
}
Write-Host 'All tools present and in range.' -ForegroundColor Green
