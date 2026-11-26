# 唤起 novel_hub：后端 uvicorn(8000) + 前端 Next.js(3001)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot          # novel_hub/
$backend = Join-Path $root '.venv\Scripts\python.exe'
$web = Join-Path $root 'web'

function PortOpen([int]$port) {
    (Test-NetConnection -ComputerName 127.0.0.1 -Port $port -InformationLevel Quiet -WarningAction SilentlyContinue) -eq $true
}

if (-not (PortOpen 3306)) {
    Write-Warning 'MySQL(3306) 未检测到，后端将无法连库。请先启动 MySQL 服务。'
}

if (-not (PortOpen 8000)) {
    Write-Host '启动后端 uvicorn (http://127.0.0.1:8000)...'
    Start-Process -FilePath $backend -ArgumentList '-m','uvicorn','app.api:app','--host','127.0.0.1','--port','8000' -WorkingDirectory $root -WindowStyle Minimized
} else {
    Write-Host '后端已在运行 (8000)。'
}

if (-not (PortOpen 3001)) {
    # 清掉可能卡死 Turbopack 首屏编译的陈旧 .next 缓存
    $nextCache = Join-Path $web '.next'
    if (Test-Path $nextCache) {
        Remove-Item -Recurse -Force $nextCache -ErrorAction SilentlyContinue
        Write-Host '已清理陈旧的 .next 缓存。'
    }
    Write-Host '启动前端 Next.js (http://localhost:3001)...'
    $npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
    if (-not $npm) { throw '未找到 npm.cmd，请确认 Node.js 已安装。' }
    Start-Process -FilePath $npm -ArgumentList 'run','dev' -WorkingDirectory $web -WindowStyle Minimized
} else {
    Write-Host '前端已在运行 (3001)。'
}

Write-Host ''
Write-Host 'novel_hub 已唤起：'
Write-Host '  API   http://localhost:8000/docs'
Write-Host '  前端  http://localhost:3001'
