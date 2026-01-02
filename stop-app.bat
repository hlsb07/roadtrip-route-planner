@echo off
setlocal enabledelayedexpansion

echo ========================================
echo Stopping Roadtrip Route Planner
echo ========================================
echo.

echo Stopping Nginx...
if exist "C:\nginx\nginx.exe" (
    cd /d C:\nginx
    REM Wenn nginx nicht läuft, kommt ggf. die pid-Fehlermeldung - ist ok
    nginx.exe -s stop >nul 2>&1
    echo Nginx stop command sent
) else (
    echo Nginx not found at C:\nginx
)
echo.

REM >>> Backend-Port hier eintragen:
set BACKEND_PORT=5000

echo Stopping Backend API on port %BACKEND_PORT%...
echo On problems use: taskkill /IM dotnet.exe /F

REM Ermittelt PIDs, die auf dem Port "Listen"
for /f "usebackq delims=" %%p in (`powershell -NoProfile -Command ^
  "Get-NetTCPConnection -Lo

