@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   [X] Node.js was not found on this computer.
  echo       Please install it from https://nodejs.org/ and run this file again.
  echo.
  pause
  exit /b 1
)

node publish.js
pause
