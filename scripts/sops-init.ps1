#Requires -Version 5.1
<#
.SYNOPSIS
  Create the operator's age keypair for SOPS and print what to do next.

.DESCRIPTION
  Generates a key at $env:APPDATA\sops\age\keys.txt (the default location
  SOPS searches on Windows) unless one exists. Never overwrites. Prints the
  public key to paste into .sops.yaml.
#>
[CmdletBinding()]
param(
  [string]$KeyFile = (Join-Path $env:APPDATA 'sops\age\keys.txt')
)

$ErrorActionPreference = 'Stop'

foreach ($tool in 'age-keygen', 'sops') {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    throw "$tool not found. Run scripts/setup-windows.ps1 -Group secrets first."
  }
}

if (Test-Path $KeyFile) {
  Write-Host "Key file already exists: $KeyFile (not overwriting)" -ForegroundColor Yellow
} else {
  New-Item -ItemType Directory -Force -Path (Split-Path $KeyFile) | Out-Null
  age-keygen -o $KeyFile
  Write-Host "Generated $KeyFile" -ForegroundColor Green
}

$pub = (Select-String -Path $KeyFile -Pattern '^# public key: (age1\w+)').Matches[0].Groups[1].Value

Write-Host ''
Write-Host 'Public key (paste into .sops.yaml as the operator recipient):' -ForegroundColor Cyan
Write-Host "  $pub"
Write-Host ''
Write-Host 'Next steps:'
Write-Host "  1. Replace the placeholder in .sops.yaml with $pub"
Write-Host "  2. Back up $KeyFile to your password manager. Losing it loses every encrypted file."
Write-Host '  3. Optional: set SOPS_AGE_KEY_FILE if you keep the key elsewhere.'
Write-Host '  4. Encrypt a file:  sops --encrypt --in-place path/to/file.enc.yaml'
