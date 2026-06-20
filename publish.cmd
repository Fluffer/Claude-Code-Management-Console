@echo off
rem Builds the unpackaged self-contained release into publish\ (what launcher.cmd starts).
rem Same command as documented in README.md.
setlocal
cd /d "%~dp0"

rem dotnet publish cannot overwrite a locked ccmc.exe — bail out early if it's running.
tasklist /fi "imagename eq ccmc.exe" 2>nul | find /i "ccmc.exe" >nul
if not errorlevel 1 (
  echo ccmc.exe is running. Close it ^(or Exit via the tray icon^) and run this again.
  exit /b 1
)

echo Publishing unpackaged self-contained build to publish\ ...
dotnet publish "src\Ccmc.WinUI" -c Release -r win-x64 -p:Platform=x64 -p:UnpackagedPublish=true -o publish
if errorlevel 1 (
  echo.
  echo Publish FAILED.
  exit /b 1
)

echo.
echo Done. launcher.cmd now starts publish\ccmc.exe
endlocal
