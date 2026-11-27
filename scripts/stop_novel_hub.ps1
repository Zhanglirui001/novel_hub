# 停止 novel_hub（按端口 8000 / 3001 结束监听进程）
$ErrorActionPreference = 'SilentlyContinue'

# 优先用 Get-NetTCPConnection；某些受限环境下该命令不可用，回退到 netstat。
function Get-ListeningPids([int]$port) {
    try {
        $found = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop |
            Select-Object -ExpandProperty OwningProcess -Unique
        if ($found) { return $found }
    } catch { }

    return netstat -ano | Select-String 'LISTENING' |
        Where-Object { $_.Line -match ":$port\s" } |
        ForEach-Object { ($_.Line -split '\s+')[-1] } |
        Select-Object -Unique
}

foreach ($p in 8000, 3001) {
    $owners = @(Get-ListeningPids $p)
    if ($owners.Count -eq 0) {
        Write-Host "端口 $p 没有监听进程。"
        continue
    }
    foreach ($owner in $owners) {
        if ($owner -and $owner -ne '0') {
            Write-Host "停止端口 $p (PID $owner)..."
            Stop-Process -Id ([int]$owner) -Force
        }
    }
}
Write-Host '完成。'
