@echo off
title Wise - local preview
cd /d "%~dp0"
if not exist node_modules (
  echo Installing packages, this only happens once...
  call npm install
)
echo.
echo Starting the site. Your browser will open automatically.
echo Keep this window open while you view the site. Close it to stop.
echo.
call npm run dev
pause
