@echo off
rem Dev-Projects launcher shim. Existing shortcuts keep working: starts the
rem .NET 9 app if published, otherwise falls back to the legacy PS launcher.
if exist "%~dp0publish\Dev-Projects.exe" (
  start "" "%~dp0publish\Dev-Projects.exe"
) else (
  where pwsh >nul 2>nul
  if %errorlevel%==0 (
    start "" pwsh -WindowStyle Hidden -File "%~dp0legacy\launcher.ps1"
  ) else (
    start "" powershell -WindowStyle Hidden -File "%~dp0legacy\launcher.ps1"
  )
)
