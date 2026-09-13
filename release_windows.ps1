[CmdletBinding()]
param(
    [switch]$SkipDependencyInstall,
    [switch]$SkipInstaller
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$root = $PSScriptRoot
$webRoot = Join-Path $root "web"
$srcTauriRoot = Join-Path $webRoot "src-tauri"
$cargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
if (Test-Path (Join-Path $cargoBin "cargo.exe")) {
    $env:PATH = "$cargoBin;$env:PATH"
}

function Step([string]$message) {
    Write-Host "[Novel Hub Release] $message" -ForegroundColor Cyan
}

function Stop-StaleSidecarPort {
    param([int]$Port)

    $netstat = & netstat -ano -p tcp 2>$null
    if ($LASTEXITCODE -ne 0) { return }

    foreach ($line in $netstat) {
        if ($line -match "LISTENING\s+(\d+)$") {
            $procId = [int]$Matches[1]
            if ($line -match ":$Port\s+0\.0\.0\.0:0\s+LISTENING\s+$procId$") {
                try {
                    Stop-Process -Id $procId -Force -ErrorAction Stop
                    Write-Host "Stopped stale sidecar on port $Port (PID $procId)" -ForegroundColor Yellow
                }
                catch {
                    Write-Host "Could not stop stale sidecar on port $Port (PID $procId): $($_.Exception.Message)" -ForegroundColor Yellow
                }
            }
        }
    }
}

function Stop-DesktopProcesses {
    $names = @('novel-hub', 'novelhub-sidecar')
    foreach ($name in $names) {
        Get-Process -Name $name -ErrorAction SilentlyContinue | ForEach-Object {
            try {
                Stop-Process -Id $_.Id -Force -ErrorAction Stop
                Write-Host "Stopped desktop process $($_.ProcessName) (PID $($_.Id))" -ForegroundColor Yellow
            }
            catch {
                Write-Host "Could not stop $($_.ProcessName) (PID $($_.Id)): $($_.Exception.Message)" -ForegroundColor Yellow
            }
        }
    }
}

if (-not (Get-Command cargo.exe -ErrorAction SilentlyContinue)) {
    throw "Rust stable is required for the Tauri shell. Install it from https://rustup.rs/."
}
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    throw "Node.js and npm are required to build the embedded Web UI."
}

Push-Location $root
try {
    Step "Cleaning stale desktop artifacts"
    Stop-DesktopProcesses
    if (Test-Path (Join-Path $srcTauriRoot "target")) {
        Push-Location $srcTauriRoot
        try {
            & cargo clean
            if ($LASTEXITCODE -ne 0) { throw "cargo clean failed." }
        }
        finally {
            Pop-Location
        }
    }

    Step "Stopping stale local sidecars"
    Stop-StaleSidecarPort -Port 17831

    Step "Checking release version"
    & python (Join-Path $root "scripts\check_release_version.py")
    if ($LASTEXITCODE -ne 0) { throw "Release versions do not match." }

    if (-not $SkipDependencyInstall) {
        Step "Installing Python build dependencies"
        & python -m pip install -r requirements-build.txt
        if ($LASTEXITCODE -ne 0) { throw "Python dependency installation failed." }

        Step "Installing Web/Tauri dependencies"
        Push-Location $webRoot
        try {
            & npm.cmd ci
            if ($LASTEXITCODE -ne 0) { throw "npm install failed." }
        }
        finally {
            Pop-Location
        }
    }

    Step "Building the FastAPI sidecar"
    & (Join-Path $root "scripts\prepare_tauri_sidecar.ps1") -SkipDependencyInstall
    if ($LASTEXITCODE -ne 0) { throw "FastAPI sidecar build failed." }

    Step "Building the desktop app"
    Push-Location $webRoot
    try {
        if ($SkipInstaller) {
            & npx.cmd tauri build --no-bundle -- --offline
        }
        else {
            & npx.cmd tauri build -- --offline
        }
        if ($LASTEXITCODE -ne 0) { throw "Tauri build failed." }
    }
    finally {
        Pop-Location
    }

    Step "Build complete: web\src-tauri\target\release"
    if (-not $SkipInstaller) {
        $version = (Get-Content (Join-Path $webRoot "package.json") -Raw | ConvertFrom-Json).version
        $destination = Join-Path $root "release\$version"
        New-Item -ItemType Directory -Force -Path $destination | Out-Null
        $packages = Get-ChildItem (Join-Path $webRoot "src-tauri\target\release\bundle") -Recurse -File |
            Where-Object { $_.Extension -in '.exe', '.msi' }
        if (-not $packages) { throw "No installer artifacts were produced." }
        foreach ($package in $packages) {
            Copy-Item -LiteralPath $package.FullName -Destination $destination -Force
        }
        Get-ChildItem $destination -File | Get-FileHash -Algorithm SHA256 | Format-Table
        Step "Installers copied to release\$version"
    }

    Write-Host "Release succeeded." -ForegroundColor Green
}
finally {
    Pop-Location
}
