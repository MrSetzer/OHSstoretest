@echo off
title OHS Store - Change Password
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto nonode

echo.
echo    Choose a NEW password for the owner dashboard.
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
echo.
echo    Done! If the store is running right now, close its window
echo    and double-click "Start OHS Store" again.
echo.
pause
exit /b

:nonode
echo.
echo    Node.js isn't installed yet. Double-click "Start OHS Store" first.
echo.
pause
exit /b

:giveup
echo.
echo    No password was saved. Close this window and try again.
echo.
pause
