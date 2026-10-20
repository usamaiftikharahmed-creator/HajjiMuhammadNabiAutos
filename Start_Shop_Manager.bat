@echo off
title Hajji Mohammad Nabi Autos - Launcher
cd /d "%~dp0"

:: 1. Check if server is already running on port 5000
netstat -ano | findstr :5000 | findstr LISTEN >nul 2>nul
if %errorlevel% equ 0 goto SERVER_READY

echo Starting Hajji Mohammad Nabi Autos Server...
cd /d "%~dp0backend"

:: Detect Node.js (prefer bundled node.exe for 100% portability)
set "NODE_CMD="
if exist "%~dp0backend\node.exe" (
    set "NODE_CMD=%~dp0backend\node.exe"
) else (
    where node >nul 2>nul
    if %errorlevel% equ 0 (
        set "NODE_CMD=node"
    ) else (
        echo [ERROR] Node.js is required but not found!
        echo Please ensure backend\node.exe is present.
        pause
        exit /b 1
    )
)

start /b "" "%NODE_CMD%" server.js > "%~dp0server.log" 2>&1

:: Wait dynamically until port 5000 is listening
set attempts=0

:WAIT_PORT
powershell -ExecutionPolicy Bypass -Command "Start-Sleep -Milliseconds 400" >nul 2>nul
netstat -ano | findstr :5000 | findstr LISTEN >nul 2>nul
if %errorlevel% equ 0 goto SERVER_READY

set /a attempts=%attempts%+1
if %attempts% lss 30 goto WAIT_PORT

:SERVER_READY
cd /d "%~dp0"

:: 2. Try Microsoft Edge (Native App Mode: standalone window, no URL bar)
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app=http://localhost:5000 --window-size=1366,820
    exit
)
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --app=http://localhost:5000 --window-size=1366,820
    exit
)

:: 3. Try Google Chrome (Native App Mode)
if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" --app=http://localhost:5000 --window-size=1366,820
    exit
)
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app=http://localhost:5000 --window-size=1366,820
    exit
)
if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
    start "" "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" --app=http://localhost:5000 --window-size=1366,820
    exit
)

:: 4. Try Brave Browser (Native App Mode)
if exist "%ProgramFiles%\BraveSoftware\Brave-Browser\Application\brave.exe" (
    start "" "%ProgramFiles%\BraveSoftware\Brave-Browser\Application\brave.exe" --app=http://localhost:5000 --window-size=1366,820
    exit
)

:: 5. Try WHERE lookup on PATH
where msedge >nul 2>nul
if %errorlevel% equ 0 (
    start "" msedge --app=http://localhost:5000 --window-size=1366,820
    exit
)
where chrome >nul 2>nul
if %errorlevel% equ 0 (
    start "" chrome --app=http://localhost:5000 --window-size=1366,820
    exit
)

:: 6. Fallback to default browser
start http://localhost:5000
exit
