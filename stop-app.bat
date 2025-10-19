@echo off
REM Stop Script for Roadtrip Route Planner

echo ========================================
echo Stopping Roadtrip Route Planner
echo ========================================
echo.

echo Stopping Nginx...
if exist "C:\nginx\nginx.exe" (
    cd C:\nginx
    nginx.exe -s stop
    echo Nginx stopped
) else (
    echo Nginx not found at C:\nginx
)
echo.

echo Stopping Backend API...
echo Please close the Backend API window manually (if still running)
echo.

echo ========================================
echo Application stopped
echo ========================================
pause
