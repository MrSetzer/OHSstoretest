@echo off
title OHS Store
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto nonode

if exist "data\store.json" goto start

echo.
echo  =====================================================
echo    FIRST-TIME SETUP
echo  =====================================================
echo.
echo    Make up a password for the owner dashboard.
echo    Use at least 10 characters, and write it down somewhere safe.
echo.
set /a TRIES=0
:askpw
set /a TRIES+=1
if %TRIES% gtr 5 goto giveup
set "OHS_NEW_PASSWORD="
set /p "OHS_NEW_PASSWORD=   Type your new password and press Enter: "
node scripts\set-password.js
if errorlevel 1 goto askpw
set "OHS_NEW_PASSWORD="

:start
cls
echo.
echo  =====================================================
echo    The OHS Store is running.
echo  =====================================================
echo.
echo    Store:      http://localhost:3000
echo    Dashboard:  http://localhost:3000/admin
echo.
echo    Your web browser will open by itself in a moment.
echo.
echo    KEEP THIS WINDOW OPEN while you use the store.
echo    To stop the store, just close this window.
echo.
node server.js --open
echo.
pause
exit /b

:nonode
echo.
echo    One thing to install first: Node.js (free).
echo.
echo    Your browser will now open the Node.js website.
echo    Click the big green button that says "LTS", install it
echo    (just keep clicking Next), then double-click
echo    "Start OHS Store" again.
echo.
start "" https://nodejs.org/
pause
exit /b

:giveup
echo.
echo    No password was saved. Close this window and try again.
echo.
pause
