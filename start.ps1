[CmdletBinding()]
param(
    [switch]$SkipInstall,
    [switch]$NoBrowser,
    [int]$StartupTimeoutSeconds = 60
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ProjectRoot = $PSScriptRoot
$WebRoot = Join-Path $ProjectRoot "web"
$RuntimeRoot = Join-Path $ProjectRoot ".runtime"
$StatePath = Join-Path $RuntimeRoot "processes.json"
$BackendOutLog = Join-Path $RuntimeRoot "backend.stdout.log"
$BackendErrLog = Join-Path $RuntimeRoot "backend.stderr.log"
$FrontendOutLog = Join-Path $RuntimeRoot "frontend.stdout.log"
$FrontendErrLog = Join-Path $RuntimeRoot "frontend.stderr.log"
$BackendUrl = "http://127.0.0.1:8000"
$FrontendUrl = "http://localhost:3001"

function Write-Step([string]$Message) {
    Write-Host "[Novel Hub] $Message" -ForegroundColor Cyan
}

function Fail([string]$Message) {
    throw "[Novel Hub] $Message"
}

function Get-MajorVersion([string]$Value) {
    $match = [regex]::Match($Value, "(?<major>\d+)(\.\d+)?")
    if (-not $match.Success) { return 0 }
    return [int]$match.Groups["major"].Value
}

function Get-NativeVersion([string]$FilePath, [string]$Arguments = "--version") {
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $FilePath
    $startInfo.Arguments = $Arguments
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    try {
        if (-not $process.Start()) {
            return [PSCustomObject]@{ ExitCode = -1; Output = "" }
        }
    }
    catch {
        return [PSCustomObject]@{ ExitCode = -1; Output = $_.Exception.Message }
    }
    $stdout = $process.StandardOutput.ReadToEnd().Trim()
    $stderr = $process.StandardError.ReadToEnd().Trim()
    $process.WaitForExit()
    $output = if ($stdout) { $stdout } else { $stderr }
    return [PSCustomObject]@{ ExitCode = $process.ExitCode; Output = $output }
}

function Assert-PortAvailable([int]$Port) {
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($null -ne $listener) {
        Fail "Port $Port is already used by process $($listener.OwningProcess). Close it first or run stop.ps1."
    }
}

function Get-ProcessRecord([System.Diagnostics.Process]$Process, [string]$Role) {
    return [ordered]@{
        role = $Role
        pid = $Process.Id
        startTimeUtc = $Process.StartTime.ToUniversalTime().ToString("o")
    }
}

function Test-HttpReady([string]$Url) {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
    }
    catch {
        return $false
    }
}

function Show-LogTail([string]$Label, [string]$Path) {
    if (Test-Path $Path) {
        Write-Host "`n--- $Label ---" -ForegroundColor Yellow
        Get-Content $Path -Tail 30
    }
}

if (-not (Test-Path $WebRoot)) {
    Fail "The web directory was not found. Run this script from the project root."
}

New-Item -ItemType Directory -Path $RuntimeRoot -Force | Out-Null

if (Test-Path $StatePath) {
    Write-Step "Cleaning up the previous runtime state."
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $ProjectRoot "stop.ps1") -Quiet
    if ($LASTEXITCODE -ne 0) { Fail "Could not clean up the previous runtime state." }
}

$pythonCandidates = @()
$configuredPython = [Environment]::GetEnvironmentVariable("NOVEL_HUB_PYTHON")
if (-not [string]::IsNullOrWhiteSpace($configuredPython)) {
    $pythonCandidates += [PSCustomObject]@{ Path = $configuredPython; Prefix = @() }
}
foreach ($commandName in @("python.exe", "python3.exe")) {
    foreach ($command in @(Get-Command $commandName -All -ErrorAction SilentlyContinue)) {
        $pythonCandidates += [PSCustomObject]@{ Path = $command.Source; Prefix = @() }
    }
}
foreach ($command in @(Get-Command "py.exe" -All -ErrorAction SilentlyContinue)) {
    $pythonCandidates += [PSCustomObject]@{ Path = $command.Source; Prefix = @("-3") }
}

$knownPythonPaths = @(
    (Join-Path $env:USERPROFILE "Miniconda3\python.exe"),
    (Join-Path $env:USERPROFILE "miniconda3\python.exe"),
    (Join-Path $env:USERPROFILE "Anaconda3\python.exe")
)
foreach ($knownPath in $knownPythonPaths) {
    if (Test-Path $knownPath) {
        $pythonCandidates += [PSCustomObject]@{ Path = $knownPath; Prefix = @() }
    }
}
foreach ($knownPath in @(Get-ChildItem (Join-Path $env:LOCALAPPDATA "Programs\Python\Python*\python.exe") -ErrorAction SilentlyContinue)) {
    $pythonCandidates += [PSCustomObject]@{ Path = $knownPath.FullName; Prefix = @() }
}
foreach ($knownPath in @(Get-ChildItem (Join-Path $env:SystemDrive "Users\*\Miniconda3\python.exe"), (Join-Path $env:SystemDrive "Users\*\miniconda3\python.exe"), (Join-Path $env:SystemDrive "Users\*\Anaconda3\python.exe") -ErrorAction SilentlyContinue)) {
    $pythonCandidates += [PSCustomObject]@{ Path = $knownPath.FullName; Prefix = @() }
}
foreach ($knownPath in @(Get-ChildItem (Join-Path $env:APPDATA "uv\python\*\python.exe") -ErrorAction SilentlyContinue)) {
    $pythonCandidates += [PSCustomObject]@{ Path = $knownPath.FullName; Prefix = @() }
}

$pythonExecutable = $null
$pythonPrefixArgs = @()
$pythonVersionText = ""
$seenPythonCandidates = @{}
foreach ($candidate in $pythonCandidates) {
    $candidateKey = "$($candidate.Path)|$($candidate.Prefix -join ' ')"
    if ($seenPythonCandidates.ContainsKey($candidateKey)) { continue }
    $seenPythonCandidates[$candidateKey] = $true
    $versionArguments = (@($candidate.Prefix) + @("--version")) -join " "
    $candidateVersion = Get-NativeVersion $candidate.Path $versionArguments
    $candidateVersionText = [string]$candidateVersion.Output
    $candidateMatch = [regex]::Match($candidateVersionText, "Python\s+(?<major>\d+)\.(?<minor>\d+)")
    if ($candidateVersion.ExitCode -eq 0 -and $candidateMatch.Success -and
        ([int]$candidateMatch.Groups["major"].Value -gt 3 -or
         ([int]$candidateMatch.Groups["major"].Value -eq 3 -and [int]$candidateMatch.Groups["minor"].Value -ge 10))) {
        $pythonExecutable = [string]$candidate.Path
        $pythonPrefixArgs = @($candidate.Prefix)
        $pythonVersionText = $candidateVersionText
        break
    }
}
if ($null -eq $pythonExecutable) {
    Fail "No usable Python 3.10+ installation was found. Install Python or run this project from a terminal where Python works."
}

$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if ($null -eq $npmCommand) { Fail "npm was not found. Install Node.js 18+ and add it to PATH." }
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($null -eq $nodeCommand) { Fail "Node.js was not found. Install Node.js 18+ and add it to PATH." }
$nodeVersion = Get-NativeVersion $nodeCommand.Source
$nodeVersionText = [string]$nodeVersion.Output
if ($nodeVersion.ExitCode -ne 0 -or (Get-MajorVersion $nodeVersionText) -lt 18) {
    Fail "Current Node.js version is $nodeVersionText; Novel Hub requires Node.js 18+."
}

Write-Step "Environment OK: $pythonVersionText, Node.js $nodeVersionText."

if (-not $SkipInstall) {
    & $pythonExecutable @pythonPrefixArgs -c "import fastapi, uvicorn, pydantic, pymysql, langgraph" 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Step "Installing backend dependencies..."
        & $pythonExecutable @pythonPrefixArgs -m pip install -r (Join-Path $ProjectRoot "requirements.txt")
        if ($LASTEXITCODE -ne 0) { Fail "Backend dependency installation failed." }
    }

    if (-not (Test-Path (Join-Path $WebRoot "node_modules"))) {
        Write-Step "Installing frontend dependencies..."
        Push-Location $WebRoot
        try {
            & npm.cmd install
            if ($LASTEXITCODE -ne 0) { Fail "Frontend dependency installation failed." }
        }
        finally {
            Pop-Location
        }
    }
}

Write-Step "Initializing and checking MySQL..."
Push-Location $ProjectRoot
try {
    & $pythonExecutable @pythonPrefixArgs -c "from app.database import init_db; init_db()"
    if ($LASTEXITCODE -ne 0) {
        Fail "Database initialization failed. Make sure MySQL is running and check the root .env file."
    }
}
finally {
    Pop-Location
}

Assert-PortAvailable 8000
Assert-PortAvailable 3001

Remove-Item $BackendOutLog, $BackendErrLog, $FrontendOutLog, $FrontendErrLog -Force -ErrorAction SilentlyContinue

$backend = $null
$frontend = $null
try {
    Write-Step "Starting the backend API..."
    $backendArguments = @($pythonPrefixArgs) + @("-m", "uvicorn", "app.api:app", "--host", "127.0.0.1", "--port", "8000")
    $backend = Start-Process -FilePath $pythonExecutable `
        -ArgumentList $backendArguments `
        -WorkingDirectory $ProjectRoot `
        -RedirectStandardOutput $BackendOutLog `
        -RedirectStandardError $BackendErrLog `
        -WindowStyle Hidden -PassThru

    Write-Step "Starting the frontend..."
    $frontend = Start-Process -FilePath $npmCommand.Source `
        -ArgumentList @("run", "dev") `
        -WorkingDirectory $WebRoot `
        -RedirectStandardOutput $FrontendOutLog `
        -RedirectStandardError $FrontendErrLog `
        -WindowStyle Hidden -PassThru

    Start-Sleep -Milliseconds 300
    $state = [ordered]@{
        projectRoot = $ProjectRoot
        createdAtUtc = [DateTime]::UtcNow.ToString("o")
        processes = @(
            (Get-ProcessRecord -Process $backend -Role "backend"),
            (Get-ProcessRecord -Process $frontend -Role "frontend")
        )
    }
    $state | ConvertTo-Json -Depth 4 | Set-Content -Path $StatePath -Encoding UTF8

    Write-Step "Waiting for services to become ready..."
    $deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
    $backendReady = $false
    $frontendReady = $false
    do {
        if ($backend.HasExited) { Fail "Backend exited early with code $($backend.ExitCode)." }
        if ($frontend.HasExited) { Fail "Frontend exited early with code $($frontend.ExitCode)." }
        if (-not $backendReady) { $backendReady = Test-HttpReady "$BackendUrl/docs" }
        if (-not $frontendReady) { $frontendReady = Test-HttpReady $FrontendUrl }
        if ($backendReady -and $frontendReady) { break }
        Start-Sleep -Seconds 1
    } while ((Get-Date) -lt $deadline)

    if (-not $backendReady -or -not $frontendReady) {
        Fail "Services did not become ready within $StartupTimeoutSeconds seconds."
    }

    Write-Host ""
    Write-Host "Novel Hub is running." -ForegroundColor Green
    Write-Host "  Web:      $FrontendUrl"
    Write-Host "  API:      $BackendUrl"
    Write-Host "  API docs: $BackendUrl/docs"
    Write-Host "  Logs:     $RuntimeRoot"
    Write-Host "  Stop:     .\stop.ps1"

    if (-not $NoBrowser) {
        Start-Process $FrontendUrl
    }
}
catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    Show-LogTail "backend stderr" $BackendErrLog
    Show-LogTail "frontend stderr" $FrontendErrLog
    if (Test-Path $StatePath) {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $ProjectRoot "stop.ps1") -Quiet
    }
    else {
        if ($null -ne $frontend -and -not $frontend.HasExited) { Stop-Process -Id $frontend.Id -Force -ErrorAction SilentlyContinue }
        if ($null -ne $backend -and -not $backend.HasExited) { Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue }
    }
    exit 1
}
