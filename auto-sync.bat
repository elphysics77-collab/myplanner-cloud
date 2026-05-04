@echo off
cd /d c:\Users\pkontog\Projects\myplanner-cloud

REM Pull remote changes first (other devices' edits)
git pull --rebase --autostash >> auto-sync.log 2>&1

REM Stage local changes
git add -A

REM If there are changes, commit and push
git diff-index --quiet HEAD --
if errorlevel 1 (
  git commit -m "auto-sync from PC %date% %time%" >> auto-sync.log 2>&1
  git push >> auto-sync.log 2>&1
  echo [%date% %time%] Pushed local changes >> auto-sync.log
) else (
  echo [%date% %time%] No local changes >> auto-sync.log
)
