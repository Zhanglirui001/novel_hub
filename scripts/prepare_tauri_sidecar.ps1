[CmdletBinding()]
param([switch]$SkipDependencyInstall)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$binaryDir = Join-Path $root "web\src-tauri\binaries"

Push-Location $root
try {
    if (-not $SkipDependencyInstall) {
        & python -m pip install -r requirements-build.txt
        if ($LASTEXITCODE -ne 0) { throw "Python build dependency installation failed." }
    }
    & python -m PyInstaller --noconfirm NovelHubSidecar.spec
    if ($LASTEXITCODE -ne 0) { throw "FastAPI sidecar build failed." }

    New-Item -ItemType Directory -Force -Path $binaryDir | Out-Null
    Copy-Item -Force (Join-Path $root "dist\novelhub-sidecar.exe") `
        (Join-Path $binaryDir "novelhub-sidecar-x86_64-pc-windows-msvc.exe")
    Write-Host "Tauri sidecar is ready." -ForegroundColor Green
}
finally {
    Pop-Location
}
