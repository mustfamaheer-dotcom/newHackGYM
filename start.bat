@echo off
title ZKTeco Attendance System - Starting All Services
color 0A

echo ============================================================
echo   ZKTeco Attendance System - Starting All Services
echo ============================================================
echo.

REM Get the directory where this .bat file is located
set "ROOT=%~dp0"

REM ---- Kill any existing processes on our ports ----
echo [1/5] Cleaning up old processes on ports 3000, 3003, 3004...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3003 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3004 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
timeout /t 2 /nobreak >nul
echo    Done.
echo.

REM ---- Start WebSocket Service ----
echo [2/5] Starting WebSocket Service (port 3003)...
start "WebSocket Service" /min cmd /c "cd /d "%ROOT%mini-services\attendance-ws" && npx tsx index.ts"
timeout /t 3 /nobreak >nul
echo    Done.
echo.

REM ---- Start Next.js Dev Server ----
echo [3/5] Starting Next.js Dev Server (port 3000)...
start "Next.js Dev" /min cmd /c "cd /d "%ROOT%" && npx next dev --webpack -p 3000"
echo    Done. (takes ~10s to fully compile)
echo.

REM ---- Start Python Bridge ----
echo [4/5] Starting Python Device Bridge...
start "ZKTeco Bridge" /min cmd /c "cd /d "%ROOT%" && python download\live_device_bridge.py --config download\config.yaml"
timeout /t 3 /nobreak >nul
echo    Done.
echo.

REM ---- Wait and verify ----
echo [5/5] Waiting for services to initialize...
timeout /t 15 /nobreak >nul

echo.
echo ============================================================
echo   Checking services...
echo ============================================================
echo.

echo    [Port 3000] Next.js Dashboard
netstat -ano | findstr :3000 | findstr LISTENING >nul 2>&1
if %errorlevel%==0 (echo       Status: RUNNING) else (echo       Status: NOT RUNNING)

echo    [Port 3003] WebSocket Server
netstat -ano | findstr :3003 | findstr LISTENING >nul 2>&1
if %errorlevel%==0 (echo       Status: RUNNING) else (echo       Status: NOT RUNNING)

echo    [Port 3004] WebSocket HTTP Push
netstat -ano | findstr :3004 | findstr LISTENING >nul 2>&1
if %errorlevel%==0 (echo       Status: RUNNING) else (echo       Status: NOT RUNNING)

echo.
echo ============================================================
echo   All services started! Open http://localhost:3000
echo ============================================================
echo.
echo   To stop all services, run: stop.bat
echo.
pause
