@echo off
REM Launch the armed auto-approver hidden (it detaches its own console while
REM attaching to other tabs, so it has no usable window of its own).
REM Add -Classify to enable the local-model security gate.
REM Watch progress with:  Get-Content approver.log -Wait
start "TerminalAutoApprover" pwsh -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0Approver.ps1" %*
