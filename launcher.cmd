@echo off
where pwsh >nul 2>nul
if %errorlevel%==0 (
  start "" pwsh -WindowStyle Hidden -File "%~dp0launcher.ps1"
) else (
  start "" powershell -WindowStyle Hidden -File "%~dp0launcher.ps1"
)
