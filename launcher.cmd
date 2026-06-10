@echo off
rem Claude Code Management Console launcher shim. Existing shortcuts keep working:
rem starts the .NET app if published, otherwise falls back to the legacy PS launcher.
if exist "%~dp0publish\ccmc.exe" (
  start "" "%~dp0publish\ccmc.exe"
) else (
  where pwsh >nul 2>nul
  if %errorlevel%==0 (
    start "" pwsh -WindowStyle Hidden -File "%~dp0legacy\launcher.ps1"
  ) else (
    start "" powershell -WindowStyle Hidden -File "%~dp0legacy\launcher.ps1"
  )
)
