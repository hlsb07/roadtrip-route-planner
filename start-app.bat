@echo off
REM Quick Start Script for Roadtrip Route Planner with Nginx

echo ========================================
echo Starting Roadtrip Route Planner
echo ========================================
echo.

REM Check if Nginx is installed
if not exist "C:\nginx\nginx.exe" (
    echo ERROR: Nginx not found!
    echo Please run: nginx\setup-nginx.bat first
    echo See: docs\nginx-installation.md for installation
    pause
    exit /b 1
)

REM Check if backend directory exists
if not exist "src\backend\RoutePlanner.API\RoutePlanner.API.csproj" (
    echo ERROR: Backend project not found!
    pause
    exit /b 1
)

echo [1/3] Starting Backend API...
echo ========================================
start "Backend API" cmd /k "cd /d %~dp0src\backend\RoutePlanner.API && dotnet run"
echo Backend starting on http://localhost:5166
echo Waiting 5 seconds for backend to start...
timeout /t 5 /nobreak >nul
echo.

echo [2/3] Starting Nginx...
echo ========================================
cd C:\nginx

REM Stop any existing Nginx instances
nginx.exe -s stop 2>nul
timeout /t 2 /nobreak >nul

REM Start Nginx
start nginx
echo Nginx started on http://localhost
echo.

echo [3/3] Application Ready!
echo ========================================
echo.
echo Open your browser to: http://localhost
echo.
echo Services:
echo   Frontend:  http://localhost
echo   Backend:   http://localhost:5166 (direct)
echo   API:       http://localhost/api (via Nginx)
echo   Images:    http://localhost/images (via Nginx)
echo.
echo Press any key to open in browser...
pause >nul

REM Open browser
start http://localhost

echo.
echo ========================================
echo Application is running!
echo ========================================
echo.
echo To stop the application:
echo   1. Close this window (or Ctrl+C)
echo   2. Close the Backend API window
echo   3. Run: C:\nginx\nginx.exe -s stop
echo.
echo To view logs:
echo   - Backend: See the Backend API window
echo   - Nginx: C:\nginx\logs\error.log
echo.
pause
