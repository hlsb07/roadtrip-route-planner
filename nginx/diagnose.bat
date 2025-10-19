@echo off
REM Diagnostic script for Nginx configuration issues

echo ========================================
echo Nginx Configuration Diagnostics
echo ========================================
echo.

echo [1] Checking if Nginx is installed...
if exist "C:\nginx\nginx.exe" (
    echo    OK: Nginx found at C:\nginx\
) else (
    echo    ERROR: Nginx not found at C:\nginx\
    pause
    exit /b 1
)
echo.

echo [2] Checking current Nginx configuration...
if exist "C:\nginx\conf\nginx.conf" (
    echo    OK: Config file exists
    echo.
    echo    First few lines of C:\nginx\conf\nginx.conf:
    echo    ----------------------------------------
    powershell -Command "Get-Content 'C:\nginx\conf\nginx.conf' | Select-Object -First 10"
    echo    ----------------------------------------
) else (
    echo    ERROR: C:\nginx\conf\nginx.conf not found!
)
echo.

echo [3] Checking our custom config...
if exist "%~dp0nginx.conf" (
    echo    OK: Custom config found at %~dp0nginx.conf
) else (
    echo    ERROR: Custom config not found!
)
echo.

echo [4] Testing Nginx configuration...
cd C:\nginx
nginx.exe -t
echo.

echo [5] Checking if frontend directory exists...
if exist "C:\Users\JanHu\Documents\Coding\RoadtripRoutPlanner\src\frontend\public\index.html" (
    echo    OK: Frontend index.html found
) else (
    echo    ERROR: Frontend files not found!
)
echo.

echo [6] Checking if shared images directory exists...
if exist "C:\Users\JanHu\Documents\Coding\RoadtripRoutPlanner\src\shared\images\campsites" (
    echo    OK: Shared images directory found
) else (
    echo    WARNING: Shared images directory not found
)
echo.

echo ========================================
echo Diagnostic complete
echo ========================================
echo.
pause
