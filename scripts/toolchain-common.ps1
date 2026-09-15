# Shared helpers for the toolchain scripts. Dot-source this file.

function Read-VersionsEnv {
  <# Parse scripts/versions.env (KEY=VALUE, '#' comments) into a hashtable. #>
  param([Parameter(Mandatory)] [string]$Path)
  $map = @{}
  foreach ($line in Get-Content -Path $Path) {
    $l = ($line -replace '#.*$', '').Trim()
    if (-not $l) { continue }
    $k, $v = $l -split '=', 2
    $map[$k.Trim()] = $v.Trim()
  }
  return $map
}

# How to ask each tool for its version and how to extract it.
$script:ToolProbes = @{
  git         = @{ Args = @('--version');                 Regex = '(\d+\.\d+(\.\d+)?)' }
  node        = @{ Args = @('--version');                 Regex = 'v(\d+\.\d+\.\d+)' }
  pnpm        = @{ Args = @('--version');                 Regex = '(\d+\.\d+\.\d+)' }
  go          = @{ Args = @('version');                   Regex = 'go(\d+\.\d+(\.\d+)?)' }
  docker      = @{ Args = @('--version');                 Regex = '(\d+\.\d+\.\d+)' }
  terraform   = @{ Args = @('--version');                 Regex = 'v(\d+\.\d+\.\d+)' }
  packer      = @{ Args = @('--version');                 Regex = 'v?(\d+\.\d+\.\d+)' }
  hcloud      = @{ Args = @('version');                   Regex = 'v?(\d+\.\d+\.\d+)' }
  talosctl    = @{ Args = @('version', '--client');       Regex = 'v(\d+\.\d+\.\d+)' }
  kubectl     = @{ Args = @('version', '--client');       Regex = 'v(\d+\.\d+\.\d+)' }
  helm        = @{ Args = @('version', '--short');        Regex = 'v(\d+\.\d+\.\d+)' }
  kustomize   = @{ Args = @('version');                   Regex = 'v?(\d+\.\d+\.\d+)' }
  kubeconform = @{ Args = @('-v');                        Regex = 'v?(\d+\.\d+\.\d+)' }
  argocd      = @{ Args = @('version', '--client', '--short'); Regex = 'v(\d+\.\d+\.\d+)' }
  sops        = @{ Args = @('--version');                 Regex = '(\d+\.\d+\.\d+)' }
  age         = @{ Args = @('--version');                 Regex = 'v?(\d+\.\d+\.\d+)' }
  gh          = @{ Args = @('--version');                 Regex = '(\d+\.\d+\.\d+)' }
  cosign      = @{ Args = @('version');                   Regex = 'v?(\d+\.\d+\.\d+)' }
}

function Get-ToolVersion {
  <#
    Return the installed version string of a tool, or $null if missing/unknown.
    -Name selects the probe (how to ask for the version); -Path optionally points at a
    specific executable instead of whatever $Name resolves to on PATH.
  #>
  param([Parameter(Mandatory)] [string]$Name, [string]$Path)
  $exe = if ($Path) { $Path } else { $Name }
  $cmd = Get-Command $exe -ErrorAction SilentlyContinue
  if (-not $cmd) { return $null }
  $probe = $script:ToolProbes[$Name]
  if (-not $probe) { return $null }
  try {
    $out = (& $exe @($probe.Args) 2>&1 | Out-String)
  } catch { return $null }
  $m = [regex]::Match($out, $probe.Regex)
  if ($m.Success) { return $m.Groups[1].Value }
  return $null
}

function ConvertTo-Version3 {
  param([Parameter(Mandatory)] [string]$Text)
  $parts = $Text.Split('.')
  while ($parts.Count -lt 3) { $parts += '0' }
  return [version]($parts[0..2] -join '.')
}

function Compare-Version {
  <# -1 if A < B, 0 if equal, 1 if A > B (compares major.minor.patch). #>
  param([Parameter(Mandatory)] [string]$A, [Parameter(Mandatory)] [string]$B)
  $va = ConvertTo-Version3 $A; $vb = ConvertTo-Version3 $B
  if ($va -lt $vb) { return -1 } elseif ($va -gt $vb) { return 1 } else { return 0 }
}

function Get-MinorNumber {
  param([Parameter(Mandatory)] [string]$Text)
  $p = $Text.Split('.'); return [int]$p[0] * 1000 + [int]$p[1]
}
