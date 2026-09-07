@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop.ps1" %*
set "NOVEL_HUB_EXIT=%ERRORLEVEL%"
if not "%NOVEL_HUB_EXIT%"=="0" pause
exit /b %NOVEL_HUB_EXIT%
