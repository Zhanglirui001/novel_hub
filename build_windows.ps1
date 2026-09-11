[CmdletBinding()]
param(
    [switch]$SkipDependencyInstall,
    [switch]$SkipInstaller
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$root = $PSScriptRoot
$webRoot = Join-Path $root "web"
$cargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
if (Test-Path (Join-Path $cargoBin "cargo.exe")) { $env:PATH = "$cargoBin;$env:PATH" }
$portableRoot = Join-Path $root ".runtime\msvc"
if (Test-Path (Join-Path $portableRoot "setup_x64.bat")) {
    $vc = Get-ChildItem (Join-Path $portableRoot 'VC\Tools\MSVC') -Directory | Sort-Object Name -Descending | Select-Object -First 1
    $sdk = Get-ChildItem (Join-Path $portableRoot 'Windows Kits\10\Lib') -Directory | Sort-Object Name -Descending | Select-Object -First 1
    $sdkRoot = Join-Path $portableRoot 'Windows Kits\10'
    $env:PATH = "$($vc.FullName)\bin\Hostx64\x64;$sdkRoot\bin\$($sdk.Name)\x64;$env:PATH"
    $env:INCLUDE = "$($vc.FullName)\include;$sdkRoot\Include\$($sdk.Name)\ucrt;$sdkRoot\Include\$($sdk.Name)\shared;$sdkRoot\Include\$($sdk.Name)\um;$sdkRoot\Include\$($sdk.Name)\winrt"
    $env:LIB = "$($vc.FullName)\lib\x64;$sdkRoot\Lib\$($sdk.Name)\ucrt\x64;$sdkRoot\Lib\$($sdk.Name)\um\x64"
    $env:VCToolsInstallDir = "$($vc.FullName)\"
    $env:WindowsSdkDir = "$sdkRoot\"
    $env:WindowsSDKVersion = "$($sdk.Name)\"
}

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
        finally { Pop-Location }
    }

    Step "Building the FastAPI sidecar"
    & (Join-Path $root "scripts\prepare_tauri_sidecar.ps1") -SkipDependencyInstall

    Step "Building the Tauri desktop application"
    Push-Location $webRoot
    try {
        if ($SkipInstaller) {
            & npx.cmd tauri build --no-bundle -- --locked
        }
        else {
            & npx.cmd tauri build -- --locked
        }
        if ($LASTEXITCODE -ne 0) { throw "Tauri build failed." }
    }
    finally { Pop-Location }

    Step "Build complete: web\src-tauri\target\release"
    if (-not $SkipInstaller) {
        $version = (Get-Content (Join-Path $webRoot "package.json") -Raw | ConvertFrom-Json).version
        $destination = Join-Path $root "release\$version"
        New-Item -ItemType Directory -Force -Path $destination | Out-Null
        $packages = Get-ChildItem (Join-Path $webRoot "src-tauri\target\release\bundle") -Recurse -File | Where-Object { $_.Extension -in '.exe', '.msi' }
        if (-not $packages) { throw "No installer artifacts were produced." }
        foreach ($package in $packages) { Copy-Item -LiteralPath $package.FullName -Destination $destination -Force }
        Get-ChildItem $destination -File | Get-FileHash -Algorithm SHA256 | Format-Table
        Step "Installers copied to release\$version"
    }
}
finally {
    Pop-Location
}
