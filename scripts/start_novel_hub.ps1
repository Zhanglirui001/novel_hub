# 唤起 novel_hub：后端 uvicorn(8000) + 前端 Next.js(3001)
# 说明：
#   - 数据库是 SQLite 单文件（novel_hub.db），不再需要 MySQL。
#   - Python 优先用 .venv；没有 .venv（或 .venv 缺依赖）时自动回退到系统 python。
#   - 前端用 webpack 模式启动：Next 16 默认 Turbopack，在离线/受限网络下 next/font 的
#     内置模块会解析失败、首页 500；webpack 模式可正常渲染。
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot          # novel_hub/
$web = Join-Path $root 'web'
$logDir = Join-Path $root '.runtime'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function PortOpen([int]$port) {
    (Test-NetConnection -ComputerName 127.0.0.1 -Port $port -InformationLevel Quiet -WarningAction SilentlyContinue) -eq $true
}

function Wait-Port([int]$port, [int]$seconds = 90) {
    $deadline = (Get-Date).AddSeconds($seconds)
    while ((Get-Date) -lt $deadline) {
        if (PortOpen $port) { return $true }
        Start-Sleep -Milliseconds 700
    }
    return (PortOpen $port)
}

# 找可用的 Python：先 .venv，再系统 python；必须能 import fastapi + uvicorn
function Test-Python([string]$exe) {
    if (-not $exe -or -not (Test-Path $exe)) { return $false }
    & $exe -c "import uvicorn, fastapi" 2>$null | Out-Null
    return ($LASTEXITCODE -eq 0)
}

function Resolve-Python {
    $venv = Join-Path $root '.venv\Scripts\python.exe'
    if (Test-Python $venv) { return $venv }
    $sys = (Get-Command python -ErrorAction SilentlyContinue).Source
    if ($sys -and (Test-Python $sys)) { return $sys }
    throw '未找到可用的 Python（需要 fastapi + uvicorn）。请按《使用手册》附录第 2 步创建 .venv 并安装 requirements.txt。'
}

if (-not (Test-Path (Join-Path $root 'novel_hub.db'))) {
    Write-Warning '未找到 novel_hub.db，后端首次启动会自动建空库。'
}

if (-not (PortOpen 8000)) {
    $python = Resolve-Python
    Write-Host "启动后端 uvicorn (http://127.0.0.1:8000)，解释器：$python"
    Start-Process -FilePath $python `
        -ArgumentList '-m', 'uvicorn', 'app.api:app', '--host', '127.0.0.1', '--port', '8000' `
        -WorkingDirectory $root -WindowStyle Minimized `
        -RedirectStandardOutput (Join-Path $logDir 'backend.stdout.log') `
        -RedirectStandardError (Join-Path $logDir 'backend.stderr.log')
} else {
    Write-Host '后端已在运行 (8000)。'
}

if (-not (PortOpen 3001)) {
    # 清掉可能卡死/损坏的 .next 缓存
    $nextCache = Join-Path $web '.next'
    if (Test-Path $nextCache) {
        Remove-Item -Recurse -Force $nextCache -ErrorAction SilentlyContinue
        Write-Host '已清理陈旧的 .next 缓存。'
    }
    Write-Host '启动前端 Next.js (http://localhost:3001)，webpack 模式...'
    $npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
    if (-not $npm) { throw '未找到 npm.cmd，请确认 Node.js 已安装。' }
    Start-Process -FilePath $npm `
        -ArgumentList 'run', 'dev', '--', '--webpack' `
        -WorkingDirectory $web -WindowStyle Minimized `
        -RedirectStandardOutput (Join-Path $logDir 'frontend.stdout.log') `
        -RedirectStandardError (Join-Path $logDir 'frontend.stderr.log')
} else {
    Write-Host '前端已在运行 (3001)。'
}

Write-Host ''
Write-Host '等待服务就绪...'
$backendOk = PortOpen 8000
$frontendOk = PortOpen 3001
if (-not $backendOk) { $backendOk = Wait-Port 8000 90 }
if (-not $frontendOk) { $frontendOk = Wait-Port 3001 120 }

Write-Host ''
Write-Host 'novel_hub 已唤起：'
Write-Host ("  后端  http://127.0.0.1:8000/docs   [{0}]" -f $(if ($backendOk) { 'OK' } else { '未就绪，见 .runtime\backend.stderr.log' }))
Write-Host ("  前端  http://localhost:3001        [{0}]" -f $(if ($frontendOk) { 'OK' } else { '未就绪，见 .runtime\frontend.stderr.log' }))
Write-Host '  停止：scripts\stop_novel_hub.ps1'
