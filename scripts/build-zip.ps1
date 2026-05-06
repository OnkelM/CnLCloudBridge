# Build a Chrome-Web-Store-ready ZIP of the extension.
# Usage:  pwsh ./scripts/build-zip.ps1
# Output: dist/cnl-cloud-bridge-<version>.zip

$ErrorActionPreference = "Stop"

$root = Resolve-Path "$PSScriptRoot\.."
Set-Location $root

$manifestPath = Join-Path $root "manifest.json"
if (-not (Test-Path $manifestPath)) {
    throw "manifest.json not found at $manifestPath"
}

$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$name = ($manifest.name -replace "[^a-zA-Z0-9]+", "-").ToLower().Trim("-")
$version = $manifest.version
$distDir = Join-Path $root "dist"
$zipPath = Join-Path $distDir "$name-$version.zip"

if (-not (Test-Path $distDir)) { New-Item -ItemType Directory -Path $distDir | Out-Null }
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$included = @(
    "manifest.json",
    "background",
    "content",
    "popup",
    "shared",
    "icons"
) | ForEach-Object { Join-Path $root $_ }

foreach ($p in $included) {
    if (-not (Test-Path $p)) { throw "Missing required path: $p" }
}

Write-Host "Building $zipPath ..."
Compress-Archive -Path $included -DestinationPath $zipPath -CompressionLevel Optimal

$size = (Get-Item $zipPath).Length
Write-Host ("OK: {0} ({1:N0} bytes)" -f $zipPath, $size)
