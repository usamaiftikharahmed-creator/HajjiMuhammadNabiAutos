@echo off
title Hajji Mohammad Nabi Autos - System Installer
color 0A

echo ===================================================================
echo        HAJJI MOHAMMAD NABI AUTOS - SHOP MANAGEMENT SYSTEM
echo            Automated Desktop Installer for Windows
echo ===================================================================
echo.

:: 1. Check Node.js (Bundled or System)
cd /d "%~dp0"
if exist "backend\node.exe" (
    echo [1/3] Bundled Node.js runtime detected successfully.
) else (
    where node >nul 2>nul
    if %errorlevel% equ 0 (
        echo [1/3] System Node.js detected successfully:
        node -v
    ) else (
        echo [INFO] Node.js is not yet installed on this computer.
        echo Opening Node.js official download page...
        start https://nodejs.org/
        echo.
        echo Please install Node.js and run this installer again.
        pause
        exit /b 1
    )
)
echo.

:: 2. Compile/Ensure Native Desktop Executable (.exe)
echo [2/3] Checking Desktop Executable (.exe)...
if not exist "Hajji_Mohammad_Nabi_Autos.exe" (
    if exist "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe" (
        C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /target:winexe /win32icon:app_icon.ico /out:Hajji_Mohammad_Nabi_Autos.exe Launcher.cs >nul 2>nul
    )
)
if exist "Hajji_Mohammad_Nabi_Autos.exe" (
    echo Native Executable (Hajji_Mohammad_Nabi_Autos.exe) is ready!
) else (
    echo Using Start_Shop_Manager.bat launcher fallback.
)
echo.

:: 3. Create Windows Desktop Application Shortcut with Icon
echo [3/3] Creating Windows Desktop Application Shortcut with Shop Icon...
powershell -ExecutionPolicy Bypass -File "%~dp0create_shortcut.ps1"

echo.
echo ===================================================================
echo     [SUCCESS] SYSTEM SUCCESSFULLY CONFIGURED ON THIS COMPUTER!
echo ===================================================================
echo.
echo A desktop shortcut has been created on your Windows Desktop:
echo    👉 "Hajji Mohammad Nabi Autos"
echo.
echo You can now:
echo 1. Double-click the Desktop shortcut, OR
echo 2. Double-click "Hajji_Mohammad_Nabi_Autos.exe" in this folder, OR
echo 3. Double-click "Start_Shop_Manager.bat".
echo.
echo The application will launch instantly as a native desktop window!
echo ===================================================================
echo.
pause
