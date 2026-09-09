[CmdletBinding()]
param(
    [switch]$SkipDependencyInstall,
    [switch]$SkipInstaller
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$root = $PSScriptRoot
$webRoot = Join-Path $root "web"

function Step([string]$message) {
    Write-Host "[Novel Hub Desktop] $message" -ForegroundColor Cyan
}

if (-not (Get-Command cargo.exe -ErrorAction SilentlyContinue)) {
    throw "Rust stable is required for the Tauri shell. Install it from https://rustup.rs/."
}
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    throw "Node.js and npm are required to build the embedded Web UI."
}

Push-Location $root
try {
    if (-not $SkipDependencyInstall) {
        Step "Installing Python build dependencies"
        & python -m pip install -r requirements-build.txt
        if ($LASTEXITCODE -ne 0) { throw "Python dependency installation failed." }
        Step "Installing Web/Tauri dependencies"
        Push-Location $webRoot
        try {
            & npm.cmd install
            if ($LASTEXITCODE -ne 0) { throw "npm install failed." }
        }
        finally { Pop-Location }
    }

    Step "Building the FastAPI sidecar"
    & (Join-Path $root "scripts\prepare_tauri_sidecar.ps1") -SkipDependencyInstall

    Step "Building the Tauri desktop application"
    Push-Location $webRoot
    try {
        if ($SkipInstaller) {
            & npx.cmd tauri build --no-bundle
        }
        else {
            & npx.cmd tauri build
        }
        if ($LASTEXITCODE -ne 0) { throw "Tauri build failed." }
    }
    finally { Pop-Location }

    Step "Build complete: web\src-tauri\target\release"
}
finally {
    Pop-Location
}
