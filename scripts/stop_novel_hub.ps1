# 停止 novel_hub（按端口 8000 / 3001 结束监听进程）
$ErrorActionPreference = 'SilentlyContinue'
foreach ($p in 8000, 3001) {
    $pids = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($pid_ in $pids) {
        Write-Host "停止端口 $p (PID $pid_)..."
        Stop-Process -Id $pid_ -Force
    }
}
Write-Host '完成。'
