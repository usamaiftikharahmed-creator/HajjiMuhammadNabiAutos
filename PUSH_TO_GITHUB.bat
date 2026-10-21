@echo off
title Push Project to GitHub
cd /d "%~dp0"
echo ========================================================
echo        PUSHING CODE TO GITHUB REPOSITORY
echo ========================================================
echo.

echo [1/3] Staging all changed files...
git add .
if %errorlevel% neq 0 (
    echo [ERROR] Failed to stage files.
    pause
    exit /b %errorlevel%
)

echo.
set /p COMMIT_MSG="Enter commit message (Press Enter for default): "
if "%COMMIT_MSG%"=="" set COMMIT_MSG=Update project changes - %date% %time%

echo [2/3] Committing changes...
git commit -m "%COMMIT_MSG%"

echo.
echo [3/3] Pushing to GitHub (origin main)...
git push -u origin main

echo.
echo ========================================================
if %errorlevel% equ 0 (
    echo [SUCCESS] Code successfully pushed to GitHub!
) else (
    echo [ERROR] Push failed. 
    echo If this is your first time or a new repository:
    echo 1. Make sure your GitHub URL is correct: git remote -v
    echo 2. Make sure you are logged into your GitHub account.
)
echo ========================================================
pause
