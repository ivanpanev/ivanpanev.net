#Requires -Version 5.1
<#
.SYNOPSIS
  Install or upgrade the ivanpanev.net toolchain on Windows.

.DESCRIPTION
  Idempotent. Two mechanisms:
    * winget packages for tools with a plain minimum version (MIN_* in
      scripts/versions.env): installed when missing, upgraded when below the
      minimum. `winget install` is used for both paths because it upgrades
      in place and does not depend on winget having recorded the original
      install (M0-R2-F05). Failures are recorded and the script continues.
    * Pinned, checksum-verified binaries for the two cluster-bound tools
      (kubectl, talosctl), whose versions must track the cluster rather than
      winget's latest (M0-R2-F01). They are placed in %LOCALAPPDATA%\ivp\bin,
      which is added to the user PATH.
  Package identifiers were verified against the winget source on 2026-09-16.

.PARAMETER Group
  Subset to install: web, go, infra, cluster, secrets, all (default).

.PARAMETER Check
  Do not install. Resolve every winget id with `winget search --exact`, HEAD
  every pinned download URL, and confirm each checksum file carries a digest
  for its artefact. Used to produce evidence that the pins are valid.

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
$script:failures = New-Object System.Collections.Generic.List[string]
$PinnedBin = Join-Path $env:LOCALAPPDATA 'ivp\bin'

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
    else      { Write-Host "  FAIL $WingetId not found in winget source" -ForegroundColor Red; $script:failures.Add($WingetId) }
    return
  }

  $installed = Get-ToolVersion -Name $Command
  $min = if ($MinKey) { $versions[$MinKey] } else { $null }
  if ($installed -and $min -and (Compare-Version $installed $min) -ge 0) {
    Write-Host "[skip] $Display $installed satisfies minimum $min" -ForegroundColor DarkGray
    return
  }
  $verb = if ($installed) { 'upgrade' } else { 'install' }
  Write-Host "[$verb] $Display ($WingetId)" -ForegroundColor Cyan
  # `winget install` upgrades an existing install regardless of how it was originally installed.
  winget install --id $WingetId --exact --silent --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0) {
    Write-Host "  winget exited $LASTEXITCODE for $WingetId; continuing" -ForegroundColor Yellow
    $script:failures.Add("$Display ($WingetId) exit $LASTEXITCODE")
  }
}

function Get-ExpectedDigest {
  <# Extract the 64-hex digest for $Name from a checksum file's text ("<sha>  <name>", "<sha> *<name>", or bare hash). #>
  param([Parameter(Mandatory)] [string]$Text, [Parameter(Mandatory)] [string]$Name)
  $m = [regex]::Match($Text, '(?m)^([0-9a-fA-F]{64})\s+\*?' + [regex]::Escape($Name) + '\s*$')
  if ($m.Success) { return $m.Groups[1].Value }
  $t = $Text.Trim()
  if ($t -match '^[0-9a-fA-F]{64}$') { return $t }
  return $null
}

function Ensure-PinnedBinary {
  <#
    Download a single pinned executable, verify SHA-256 against the project's checksum file,
    and install it as $PinnedBin\<Command>.exe. Skips when the installed binary already has
    the pinned version. In -Check mode only validates the URLs and the checksum file.
  #>
  param(
    [Parameter(Mandatory)] [string]$Command,
    [Parameter(Mandatory)] [string]$Version,
    [Parameter(Mandatory)] [string]$Url,
    [Parameter(Mandatory)] [string]$ChecksumUrl,
    [Parameter(Mandatory)] [string]$AssetName
  )
  if ($Check) {
    try {
      $head = Invoke-WebRequest -Uri $Url -Method Head -UseBasicParsing -MaximumRedirection 5
      $ctype = [string]$head.Headers['Content-Type']
      if ($ctype -like 'text/html*') { throw "served $ctype" }
      Write-Host "  ok   $Url"
    } catch { Write-Host "  FAIL $Url ($($_.Exception.Message))" -ForegroundColor Red; $script:failures.Add($Url) }
    try {
      $sums = (Invoke-WebRequest -Uri $ChecksumUrl -UseBasicParsing).Content
      if ($sums -is [byte[]]) { $sums = [Text.Encoding]::UTF8.GetString($sums) }
      if (Get-ExpectedDigest -Text $sums -Name $AssetName) { Write-Host "  ok   digest for $AssetName present in $ChecksumUrl" }
      else { throw "no digest for $AssetName" }
    } catch { Write-Host "  FAIL $ChecksumUrl ($($_.Exception.Message))" -ForegroundColor Red; $script:failures.Add($ChecksumUrl) }
    return
  }

  $target = Join-Path $PinnedBin "$Command.exe"
  if (Test-Path $target) {
    $have = Get-ToolVersion -Name $Command -Path $target
    if ($have -eq $Version) { Write-Host "[skip] $Command $Version already installed at $target" -ForegroundColor DarkGray; return }
  }
  Write-Host "[install] $Command $Version (pinned binary)" -ForegroundColor Cyan
  New-Item -ItemType Directory -Force -Path $PinnedBin | Out-Null
  $tmp = Join-Path $env:TEMP ("ivp-" + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $tmp | Out-Null
  try {
    $file = Join-Path $tmp $AssetName
    Invoke-WebRequest -Uri $Url -OutFile $file -UseBasicParsing
    $sums = (Invoke-WebRequest -Uri $ChecksumUrl -UseBasicParsing).Content
    if ($sums -is [byte[]]) { $sums = [Text.Encoding]::UTF8.GetString($sums) }
    $expected = Get-ExpectedDigest -Text $sums -Name $AssetName
    if (-not $expected) { throw "no sha256 digest for $AssetName in $ChecksumUrl" }
    $actual = (Get-FileHash -Algorithm SHA256 -Path $file).Hash
    if ($actual -ne $expected.ToUpperInvariant()) { throw "CHECKSUM MISMATCH for $AssetName (expected $expected, got $actual)" }
    Move-Item -Force $file $target
    Write-Host "  verified sha256 and installed $target"
  } catch {
    Write-Host "  $($_.Exception.Message); continuing" -ForegroundColor Yellow
    $script:failures.Add("$Command $Version")
  } finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
  }

  # Make sure the pinned directory is on the user PATH and warn if another copy shadows it.
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  if (($userPath -split ';') -notcontains $PinnedBin) {
    [Environment]::SetEnvironmentVariable('Path', ($userPath.TrimEnd(';') + ';' + $PinnedBin), 'User')
    Write-Host "  added $PinnedBin to the user PATH (takes effect in new terminals)"
  }
  $resolved = Get-Command $Command -ErrorAction SilentlyContinue
  if ($resolved -and $resolved.Source -ne $target) {
    Write-Host "  WARNING: '$Command' currently resolves to $($resolved.Source), which shadows the pinned binary." -ForegroundColor Yellow
    Write-Host "           Remove or reorder that PATH entry (Docker Desktop ships its own kubectl), or move $PinnedBin ahead of it." -ForegroundColor Yellow
  }
}

# ---------------------------------------------------------------- always
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
  # Cluster-bound tools: pinned binaries that follow versions.env, not winget's latest.
  $kv = $versions.PIN_KUBECTL
  Ensure-PinnedBinary -Command kubectl -Version $kv -AssetName 'kubectl.exe' `
    -Url "https://dl.k8s.io/release/v$kv/bin/windows/amd64/kubectl.exe" `
    -ChecksumUrl "https://dl.k8s.io/release/v$kv/bin/windows/amd64/kubectl.exe.sha256"
  $tv = $versions.PIN_TALOSCTL
  Ensure-PinnedBinary -Command talosctl -Version $tv -AssetName 'talosctl-windows-amd64.exe' `
    -Url "https://github.com/siderolabs/talos/releases/download/v$tv/talosctl-windows-amd64.exe" `
    -ChecksumUrl "https://github.com/siderolabs/talos/releases/download/v$tv/sha256sum.txt"

  Ensure-Package -Command helm        -WingetId Helm.Helm             -MinKey MIN_HELM        -Display 'Helm'
  Ensure-Package -Command kustomize   -WingetId Kubernetes.kustomize  -MinKey MIN_KUSTOMIZE   -Display 'kustomize'
  Ensure-Package -Command argocd      -WingetId argoproj.argocd       -MinKey MIN_ARGOCD      -Display 'Argo CD CLI'
  Ensure-Package -Command kubeconform -WingetId YannHamon.kubeconform -MinKey MIN_KUBECONFORM -Display 'kubeconform'
  Ensure-Package -Command cosign      -WingetId Sigstore.Cosign       -MinKey MIN_COSIGN      -Display 'cosign'
}

if (& $want 'secrets') {
  Ensure-Package -Command sops -WingetId SecretsOPerationS.SOPS -MinKey MIN_SOPS -Display 'SOPS'
  Ensure-Package -Command age  -WingetId FiloSottile.age        -MinKey MIN_AGE  -Display 'age'
}

# ---------------------------------------------------------------- summary
if ($Check) {
  if ($script:failures.Count -gt 0) {
    Write-Host "$($script:failures.Count) check(s) failed:" -ForegroundColor Red
    $script:failures | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    exit 1
  }
  Write-Host 'All package ids resolve; all pinned URLs and checksum files are valid.' -ForegroundColor Green
  exit 0
}

Write-Host ''
if ($script:failures.Count -gt 0) {
  Write-Host "Finished with $($script:failures.Count) failure(s):" -ForegroundColor Yellow
  $script:failures | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
  Write-Host 'Open a new terminal and run scripts/check-toolchain.ps1 to see what is still missing.'
  exit 1
}
Write-Host 'Done. Open a new terminal so PATH changes apply, then run scripts/check-toolchain.ps1.' -ForegroundColor Green
