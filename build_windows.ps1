[CmdletBinding()]
param(
    [switch]$SkipDependencyInstall,
    [switch]$SkipInstaller
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Root = $PSScriptRoot
$WebRoot = Join-Path $Root "web"
$ReleaseRoot = Join-Path $Root "release"
$StageRoot = Join-Path $ReleaseRoot "NovelHub"

function Step([string]$Message) {
    Write-Host "[Novel Hub Build] $Message" -ForegroundColor Cyan
}

Push-Location $Root
try {
    if (-not $SkipDependencyInstall) {
        Step "Installing Python build dependencies..."
        & python -m pip install -r requirements-build.txt
        if ($LASTEXITCODE -ne 0) { throw "Python dependency installation failed." }

        Step "Installing frontend dependencies..."
        Push-Location $WebRoot
        try {
            & npm.cmd install
            if ($LASTEXITCODE -ne 0) { throw "Frontend dependency installation failed." }
        }
        finally { Pop-Location }
    }

    Step "Building the production Next.js standalone server..."
    Push-Location $WebRoot
    try {
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw "Next.js build failed." }
    }
    finally { Pop-Location }

    Step "Building the Python launcher and API..."
    & python -m PyInstaller --noconfirm NovelHub.spec
    if ($LASTEXITCODE -ne 0) { throw "PyInstaller build failed." }

    if (Test-Path $StageRoot) {
        Remove-Item -LiteralPath $StageRoot -Recurse -Force
    }
    New-Item -ItemType Directory -Path (Join-Path $StageRoot "runtime") -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $StageRoot "web") -Force | Out-Null
    Copy-Item (Join-Path $Root "dist\NovelHub.exe") $StageRoot

    $node = Get-Command node.exe -ErrorAction Stop
    Copy-Item $node.Source (Join-Path $StageRoot "runtime\node.exe")
    $nodeLicense = Join-Path (Split-Path $node.Source) "LICENSE"
    if (Test-Path $nodeLicense) { Copy-Item $nodeLicense (Join-Path $StageRoot "runtime\NODE-LICENSE.txt") }

    $standaloneRoot = Join-Path $WebRoot ".next\standalone"
    $server = Get-ChildItem $standaloneRoot -Filter server.js -Recurse | Where-Object {
        $_.FullName -match "[\\/]web[\\/]server\.js$"
    } | Select-Object -First 1
    if ($null -eq $server) {
        $server = Get-ChildItem $standaloneRoot -Filter server.js -Recurse | Select-Object -First 1
    }
    if ($null -eq $server) { throw "Could not locate the standalone Next.js server.js." }
    Copy-Item (Join-Path $server.Directory.FullName "*") (Join-Path $StageRoot "web") -Recurse -Force

    $staticTarget = Join-Path $StageRoot "web\.next\static"
    New-Item -ItemType Directory -Path $staticTarget -Force | Out-Null
    Copy-Item (Join-Path $WebRoot ".next\static\*") $staticTarget -Recurse -Force
    $publicRoot = Join-Path $WebRoot "public"
    if (Test-Path $publicRoot) { Copy-Item $publicRoot (Join-Path $StageRoot "web\public") -Recurse -Force }

    if (-not $SkipInstaller) {
        $iscc = Get-Command ISCC.exe -ErrorAction SilentlyContinue
        if ($null -eq $iscc) {
            $knownIscc = @(
                "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
                "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
                "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
            ) | Where-Object { Test-Path $_ } | Select-Object -First 1
            if ($knownIscc) { $iscc = Get-Item $knownIscc }
        }
        if ($null -eq $iscc) {
            throw "Inno Setup 6 was not found. Install it or build with -SkipInstaller."
        }
        Step "Building the Windows installer..."
        & $iscc.FullName (Join-Path $Root "installer\NovelHub.iss")
        if ($LASTEXITCODE -ne 0) { throw "Inno Setup build failed." }
    }

    Step "Build complete: $ReleaseRoot"
}
finally {
    Pop-Location
}
