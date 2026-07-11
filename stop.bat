@echo off
title ZKTeco Attendance System - Stopping All Services
color 0C

echo ============================================================
echo   Stopping All ZKTeco Attendance Services...
echo ============================================================
echo.

echo [1/3] Stopping Next.js Dev Server (port 3000)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
echo    Done.

echo [2/3] Stopping WebSocket Service (port 3003/3004)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3003 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3004 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
echo    Done.

echo [3/3] Stopping Python Bridge...
taskkill /FI "WINDOWTITLE eq ZKTeco Bridge" /F >nul 2>&1
echo    Done.

echo.
echo ============================================================
echo   All services stopped.
echo ============================================================
echo.
pause
