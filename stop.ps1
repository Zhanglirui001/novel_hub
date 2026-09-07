[CmdletBinding()]
param(
    [switch]$Quiet
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RuntimeRoot = Join-Path $PSScriptRoot ".runtime"
$StatePath = Join-Path $RuntimeRoot "processes.json"

function Write-Status([string]$Message, [ConsoleColor]$Color = [ConsoleColor]::Cyan) {
    if (-not $Quiet) { Write-Host "[Novel Hub] $Message" -ForegroundColor $Color }
}

function Test-RecordedProcess($Record) {
    $process = Get-Process -Id ([int]$Record.pid) -ErrorAction SilentlyContinue
    if ($null -eq $process) { return $false }
    try {
        $recorded = [DateTimeOffset]::Parse([string]$Record.startTimeUtc).UtcDateTime
        $actual = $process.StartTime.ToUniversalTime()
        return [Math]::Abs(($actual - $recorded).TotalSeconds) -lt 2
    }
    catch {
        return $false
    }
}

if (-not (Test-Path $StatePath)) {
    Write-Status "No managed Novel Hub processes were found." Yellow
    exit 0
}

try {
    $state = Get-Content -Raw $StatePath | ConvertFrom-Json
}
catch {
    Write-Status "The runtime state was invalid. It was removed; no process was stopped." Yellow
    Remove-Item -LiteralPath $StatePath -Force
    exit 1
}

$stoppedAny = $false

# Stop the frontend first, then the backend. taskkill /T includes child processes.
foreach ($record in @($state.processes | Sort-Object { if ($_.role -eq "frontend") { 0 } else { 1 } })) {
    if (-not (Test-RecordedProcess $record)) {
        Write-Status "$($record.role) already exited or its PID was reused; skipping it." Yellow
        continue
    }

    $rootPid = [int]$record.pid
    & taskkill.exe /PID $rootPid /T /F 2>$null | Out-Null
    Start-Sleep -Milliseconds 200
    if ($null -ne (Get-Process -Id $rootPid -ErrorAction SilentlyContinue)) {
        throw "[Novel Hub] Could not stop $($record.role) (PID $rootPid). The runtime state was kept for retry."
    }
    Write-Status "Stopped $($record.role) (PID $rootPid)." Green
    $stoppedAny = $true
}

Remove-Item -LiteralPath $StatePath -Force -ErrorAction SilentlyContinue
if (-not $stoppedAny) {
    Write-Status "The processes had already exited; stale runtime state was removed." Yellow
}
else {
    Write-Status "Novel Hub has stopped." Green
}

exit 0
