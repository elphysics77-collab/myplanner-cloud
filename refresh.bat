@echo off
title MyPlanner Refresh
cd /d c:\Users\pkontog\Projects\myplanner-cloud

echo Copying fresh cookies...
copy /Y "c:\Users\pkontog\Projects\myplanner-bot\browser-state.json" "browser-state.json" >nul

echo Sending updated week to phone...
node cloud/combined-pin.js

echo.
echo Triggering calendar update...
echo %date% %time% > .refresh-trigger
git add .refresh-trigger >nul 2>&1
git commit -m "manual refresh" >nul 2>&1
git push >nul 2>&1

echo.
echo Done! Check your phone (notification + updated calendar in ~30 sec).
timeout /t 3 /nobreak >nul
