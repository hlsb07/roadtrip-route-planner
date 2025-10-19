@echo off
REM Fix Nginx Issues - Kill, Test, and Start Fresh

echo ========================================
echo Nginx Fix Script
echo ========================================
echo.

echo [1] Killing any existing Nginx processes...
taskkill /F /IM nginx.exe >nul 2>&1
timeout /t 2 /nobreak >nul
echo    Done (any errors are OK if nginx wasn't running)
echo.

echo [2] Cleaning up PID file...
if exist "C:\nginx\logs\nginx.pid" (
    del "C:\nginx\logs\nginx.pid"
    echo    Deleted old PID file
) else (
    echo    No PID file to delete
)
echo.

echo [3] Testing Nginx configuration...
cd C:\nginx
nginx.exe -t
set CONFIG_TEST=%errorlevel%
echo.

if %CONFIG_TEST% neq 0 (
    echo ========================================
    echo ERROR: Configuration test failed!
    echo ========================================
    echo.
    echo The configuration has errors. Please fix them before starting Nginx.
    echo.
    echo Common fixes:
    echo   1. Check paths in C:\nginx\conf\nginx.conf
    echo   2. Make sure frontend directory exists
    echo   3. Run setup-nginx.bat to copy the correct config
    echo.
    pause
    exit /b 1
)

echo [4] Starting Nginx with fresh configuration...
start nginx
timeout /t 2 /nobreak >nul
echo.

echo [5] Checking if Nginx is running...
tasklist | findstr nginx.exe
if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo SUCCESS! Nginx is running!
    echo ========================================
    echo.
    echo You can now access:
    echo   http://localhost           - Your application
    echo   http://localhost/api       - API (proxied to backend)
    echo   http://localhost/images    - Shared images
    echo.
    echo To check logs:
    echo   type C:\nginx\logs\error.log
    echo   type C:\nginx\logs\access.log
    echo.
) else (
    echo.
    echo ========================================
    echo ERROR: Nginx failed to start!
    echo ========================================
    echo.
    echo Please check C:\nginx\logs\error.log for details.
    echo.
    type C:\nginx\logs\error.log
    echo.
)

pause
