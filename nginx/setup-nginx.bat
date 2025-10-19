@echo off
REM Nginx Setup Script for Roadtrip Route Planner

echo ========================================
echo Nginx Setup for Roadtrip Route Planner
echo ========================================
echo.

REM Check if Nginx is installed
if not exist "C:\nginx\nginx.exe" (
    echo ERROR: Nginx not found at C:\nginx\
    echo Please install Nginx first. See docs\nginx-installation.md
    pause
    exit /b 1
)

echo Nginx found at C:\nginx\
echo.

REM Stop Nginx if running
echo Stopping Nginx (if running)...
cd C:\nginx
nginx.exe -s stop 2>nul
timeout /t 2 /nobreak >nul
echo.

REM Backup existing config
if exist "C:\nginx\conf\nginx.conf" (
    echo Backing up existing nginx.conf...
    copy "C:\nginx\conf\nginx.conf" "C:\nginx\conf\nginx.conf.backup.%date:~-4,4%%date:~-10,2%%date:~-7,2%_%time:~0,2%%time:~3,2%%time:~6,2%" >nul 2>&1
    echo Backup created
)

REM Copy new config
echo Copying new nginx configuration...
copy /Y "%~dp0nginx.conf" "C:\nginx\conf\nginx.conf"
if %errorlevel% neq 0 (
    echo ERROR: Failed to copy configuration file!
    echo Make sure you have write permissions to C:\nginx\conf\
    pause
    exit /b 1
)
echo Configuration copied successfully!
echo.

REM Test configuration
echo Testing Nginx configuration...
cd C:\nginx
nginx.exe -t
set TEST_RESULT=%errorlevel%
echo.

if %TEST_RESULT% equ 0 (
    echo ========================================
    echo SUCCESS: Configuration is valid!
    echo ========================================
    echo.
    echo Starting Nginx with new configuration...
    start nginx
    timeout /t 2 /nobreak >nul
    echo.
    echo Nginx is now running!
    echo.
    echo ========================================
    echo Next steps:
    echo ========================================
    echo 1. Start your backend API: dotnet run (in backend folder)
    echo 2. Open browser to: http://localhost
    echo.
    echo Useful commands:
    echo   Reload config:  cd C:\nginx ^&^& nginx.exe -s reload
    echo   Stop Nginx:     cd C:\nginx ^&^& nginx.exe -s stop
    echo   View logs:      type C:\nginx\logs\error.log
    echo.
) else (
    echo ========================================
    echo ERROR: Configuration test failed!
    echo ========================================
    echo Please check the error messages above.
    echo.
    echo Common issues:
    echo   - Check paths in nginx.conf match your system
    echo   - Make sure frontend directory exists
    echo   - Make sure shared images directory exists
    echo.
)

pause
