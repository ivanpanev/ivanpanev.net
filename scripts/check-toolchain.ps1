#Requires -Version 5.1
<#
.SYNOPSIS
  Report installed toolchain versions against docs/toolchain.md minimums.
#>
[CmdletBinding()]
param()

$tools = @(
  @{ Name = 'git';        Min = '2.40';  Args = '--version';         Regex = '(\d+\.\d+(\.\d+)?)' }
  @{ Name = 'node';       Min = '22.12'; Args = '--version';         Regex = 'v(\d+\.\d+\.\d+)' }
  @{ Name = 'pnpm';       Min = '10.0';  Args = '--version';         Regex = '(\d+\.\d+\.\d+)' }
  @{ Name = 'go';         Min = '1.23';  Args = 'version';           Regex = 'go(\d+\.\d+(\.\d+)?)' }
  @{ Name = 'docker';     Min = '27.0';  Args = '--version';         Regex = '(\d+\.\d+\.\d+)' }
  @{ Name = 'terraform';  Min = '1.10';  Args = '--version';         Regex = 'v(\d+\.\d+\.\d+)' }
  @{ Name = 'packer';     Min = '1.11';  Args = '--version';         Regex = 'v?(\d+\.\d+\.\d+)' }
  @{ Name = 'talosctl';   Min = '1.9';   Args = 'version --client';  Regex = 'v(\d+\.\d+\.\d+)' }
  @{ Name = 'kubectl';    Min = '1.32';  Args = 'version --client';  Regex = 'v(\d+\.\d+\.\d+)' }
  @{ Name = 'helm';       Min = '3.16';  Args = 'version --short';   Regex = 'v(\d+\.\d+\.\d+)' }
  @{ Name = 'kustomize';  Min = '5.5';   Args = 'version';           Regex = 'v?(\d+\.\d+\.\d+)' }
  @{ Name = 'kubeconform';Min = '0.6';   Args = '-v';                Regex = 'v?(\d+\.\d+\.\d+)' }
  @{ Name = 'argocd';     Min = '2.13';  Args = 'version --client --short'; Regex = 'v(\d+\.\d+\.\d+)' }
  @{ Name = 'sops';       Min = '3.9';   Args = '--version';         Regex = '(\d+\.\d+\.\d+)' }
  @{ Name = 'age';        Min = '1.2';   Args = '--version';         Regex = 'v?(\d+\.\d+\.\d+)' }
  @{ Name = 'gh';         Min = '2.60';  Args = '--version';         Regex = '(\d+\.\d+\.\d+)' }
  @{ Name = 'cosign';     Min = '2.4';   Args = 'version';           Regex = 'v?(\d+\.\d+\.\d+)' }
)

$rows = foreach ($t in $tools) {
  $cmd = Get-Command $t.Name -ErrorAction SilentlyContinue
  if (-not $cmd) {
    [pscustomobject]@{ Tool = $t.Name; Installed = '-'; Minimum = $t.Min; Status = 'MISSING' }
    continue
  }
  try {
    $out = (& $t.Name $t.Args.Split(' ') 2>&1 | Out-String)
    $m = [regex]::Match($out, $t.Regex)
    $ver = if ($m.Success) { $m.Groups[1].Value } else { 'unknown' }
    $ok = $false
    if ($ver -ne 'unknown') {
      $v = [version]($ver + ('.0' * (3 - ($ver.Split('.').Count))))
      $min = [version]($t.Min + ('.0' * (3 - ($t.Min.Split('.').Count))))
      $ok = $v -ge $min
    }
    [pscustomobject]@{ Tool = $t.Name; Installed = $ver; Minimum = $t.Min; Status = $(if ($ok) { 'ok' } else { 'TOO OLD' }) }
  } catch {
    [pscustomobject]@{ Tool = $t.Name; Installed = 'error'; Minimum = $t.Min; Status = 'ERROR' }
  }
}

$rows | Format-Table -AutoSize
$missing = @($rows | Where-Object { $_.Status -ne 'ok' })
if ($missing.Count -gt 0) {
  Write-Host "$($missing.Count) tool(s) missing or outdated. See docs/toolchain.md." -ForegroundColor Yellow
  exit 1
}
Write-Host 'All tools present.' -ForegroundColor Green
