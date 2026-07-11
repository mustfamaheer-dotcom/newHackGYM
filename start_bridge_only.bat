@echo off
cd /d "C:\Users\Moustafa Maher\Desktop\TestDevice\New\workspace-807a2d73-3c72-4cd6-9011-309435dc4651"

echo =============================================
echo  Killing existing bridge processes...
echo =============================================
for /f "tokens=2" %%i in ('tasklist /FI "IMAGENAME eq python.exe" /FO CSV ^| findstr /i "live_device_bridge"') do (
    set PID=%%i
    set PID=!PID:"=!
    taskkill /PID !PID! /F >nul 2>&1
    echo Killed bridge process !PID!
)

timeout /t 2 >nul

echo =============================================
echo  Starting single bridge instance...
echo =============================================
start "ZKTeco Bridge" cmd /c "python download\live_device_bridge.py --config download\config.yaml"

echo Bridge started in new window.
echo Logs: C:\Users\Moustafa Maher\Desktop\bridge_logs\live_bridge.log