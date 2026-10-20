@echo off
title Hajji Mohammad Nabi Autos - Shutdown Server
color 0C
cd /d "%~dp0"

echo ===================================================================
echo     Stopping Hajji Mohammad Nabi Autos Background Server...
echo ===================================================================

for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5000') do (
    taskkill /f /pid %%a >nul 2>nul
)

echo Server stopped cleanly.
timeout /t 2 >nul
exit
