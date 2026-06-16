param(
  [int]$Port = 3100,
  [switch]$Lan
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$bundledNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$node = if (Test-Path $bundledNode) { $bundledNode } else { "node" }
$hostName = if ($Lan) { "0.0.0.0" } else { "127.0.0.1" }
$nextBin = Join-Path $root "node_modules\next\dist\bin\next"

if (-not (Test-Path $nextBin)) {
  throw "Next.js is not installed. Run npm install first."
}

Write-Host "Starting Toby's Rune Rush on http://$hostName`:$Port"
Set-Location $root
& $node $nextBin dev -H $hostName -p $Port
