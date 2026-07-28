#requires -Version 7.0
<#
.SYNOPSIS
  Terminal Auto-Approver (console-attach engine).
  Watches EVERY Windows Terminal tab (foreground or background), detects Y/N and
  numbered permission prompts, and presses the right option.

.DESCRIPTION
  Reads each tab's console screen buffer and injects keystrokes via the Win32
  console API (AttachConsole + ReadConsoleOutputCharacterW / WriteConsoleInputW).
  This reaches BACKGROUND tabs that UI Automation cannot see, and never steals
  foreground focus.

  Because a process can attach to only one console at a time, this script frees
  and re-attaches per target. It therefore loses its own console after the first
  attach -> all output goes to the log FILE. Run hidden; tail the log.

.PARAMETER DryRun   Detect + log decisions, never press. Use first.
.PARAMETER Classify Enable local-model security gate (mode=classify).
.PARAMETER Once     One scan pass then exit.
.PARAMETER SelfTest Offline detection test, then exit.
.PARAMETER ParentPid
  PID of the launching app. The daemon exits as soon as that process is gone.
  Without it, a crashed or force-killed host leaves this script running with no
  UI to stop it — still pressing keys in the user's terminal tabs.

.EXAMPLE
  pwsh -File Approver.ps1 -SelfTest
  pwsh -File Approver.ps1 -DryRun ; Get-Content approver.log -Wait
  pwsh -File Approver.ps1
  pwsh -File Approver.ps1 -Classify
#>
[CmdletBinding()]
param(
  [string]$Config = "$PSScriptRoot\config.json",
  [switch]$DryRun,
  [switch]$Classify,
  [switch]$Once,
  [switch]$SelfTest,
  [int]$ParentPid = 0
)

$cfg = Get-Content -Raw -LiteralPath $Config | ConvertFrom-Json
if ($Classify) { $cfg.policy.mode = 'classify' }
$logFile = if ([System.IO.Path]::IsPathRooted($cfg.logPath)) { $cfg.logPath } else { Join-Path $PSScriptRoot $cfg.logPath }

function Write-Log([string]$msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $msg
  try { Write-Host $line } catch {}
  try { Add-Content -LiteralPath $logFile -Value $line } catch {}
}

# --- Win32 console attach: read buffer + write input -------------------------
$src = @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class ConIO {
  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool FreeConsole();
  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool AttachConsole(uint pid);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool GetConsoleScreenBufferInfo(IntPtr h, out CSBI i);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool ReadConsoleOutputCharacterW(IntPtr h, [Out] char[] buf, uint len, uint coord, out uint read);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool WriteConsoleInputW(IntPtr h, INPUT_RECORD[] buf, uint len, out uint written);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern IntPtr CreateFileW(string name, uint access, uint share, IntPtr sec, uint disp, uint flags, IntPtr tmpl);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
  [DllImport("user32.dll")] static extern short VkKeyScanW(char c);

  [StructLayout(LayoutKind.Sequential)] public struct COORD { public short X, Y; }
  [StructLayout(LayoutKind.Sequential)] public struct SMALL_RECT { public short Left,Top,Right,Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct CSBI { public COORD dwSize; public COORD cur; public short attr; public SMALL_RECT win; public COORD maxw; }
  [StructLayout(LayoutKind.Sequential)] public struct KEY_EVENT_RECORD {
    [MarshalAs(UnmanagedType.Bool)] public bool bKeyDown;
    public ushort wRepeatCount; public ushort wVirtualKeyCode; public ushort wVirtualScanCode;
    public char UnicodeChar; public uint dwControlKeyState; }
  [StructLayout(LayoutKind.Explicit)] public struct INPUT_RECORD {
    [FieldOffset(0)] public ushort EventType; [FieldOffset(4)] public KEY_EVENT_RECORD Key; }

  static IntPtr ConHandle(string name){ return CreateFileW(name, 0x80000000u|0x40000000u, 1u|2u, IntPtr.Zero, 3u, 0u, IntPtr.Zero); }

  public static string Read(uint pid){
    FreeConsole();
    if(!AttachConsole(pid)) return null;  // not a console client / gone
    IntPtr h = ConHandle("CONOUT$");
    if(h==(IntPtr)(-1)){ FreeConsole(); return null; }
    CSBI info;
    if(!GetConsoleScreenBufferInfo(h, out info)){ CloseHandle(h); FreeConsole(); return null; }
    var sb = new StringBuilder();
    int w = info.win.Right - info.win.Left + 1;
    for(short y=info.win.Top; y<=info.win.Bottom; y++){
      char[] buf = new char[w]; uint read;
      uint coord = (uint)(((ushort)y<<16)|(ushort)info.win.Left);
      ReadConsoleOutputCharacterW(h, buf, (uint)w, coord, out read);
      sb.Append(new string(buf,0,(int)read).TrimEnd()).Append('\n');
    }
    CloseHandle(h); FreeConsole();
    return sb.ToString();
  }

  static INPUT_RECORD Rec(char c, ushort vk, bool down){
    var r = new INPUT_RECORD(); r.EventType = 1;
    r.Key.bKeyDown = down; r.Key.wRepeatCount = 1; r.Key.wVirtualKeyCode = vk; r.Key.UnicodeChar = c;
    return r;
  }
  public static bool Send(uint pid, string keys){
    FreeConsole();
    if(!AttachConsole(pid)) return false;
    IntPtr h = ConHandle("CONIN$");
    if(h==(IntPtr)(-1)){ FreeConsole(); return false; }
    foreach(char c in keys){
      ushort vk = (c=='\r') ? (ushort)0x0D : (ushort)(VkKeyScanW(c) & 0xFF);
      var recs = new INPUT_RECORD[]{ Rec(c,vk,true), Rec(c,vk,false) };
      uint wr; WriteConsoleInputW(h, recs, 2, out wr);
    }
    CloseHandle(h); FreeConsole();
    return true;
  }
}
"@
Add-Type -TypeDefinition $src -Language CSharp

# --- Find every WT tab's console-client shell PID ----------------------------
# Tab shells are direct children of WindowsTerminal.exe that are not OpenConsole.exe.
function Get-TabPids {
  $all = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue
  $wt  = $all | Where-Object Name -eq 'WindowsTerminal.exe'
  if (-not $wt) { return @() }
  $wtIds = $wt.ProcessId
  $all | Where-Object {
    $_.ParentProcessId -in $wtIds -and $_.Name -ne 'OpenConsole.exe'
  } | Select-Object -ExpandProperty ProcessId
}

# --- Prompt detection (same brain as before) ---------------------------------
function Find-Prompt([string]$text) {
  if (-not $text) { return $null }
  $lines = ($text -replace "`r", "") -split "`n"
  $tail = $lines | Select-Object -Last ([int]$cfg.scanLines)

  $allowAlwaysRx = [regex]::new($cfg.patterns.allowAlways, 'IgnoreCase')
  $allowRx       = [regex]::new($cfg.patterns.allow,       'IgnoreCase')
  $denyRx        = [regex]::new($cfg.patterns.deny,        'IgnoreCase')
  $optRx = [regex]::new('^[\s>>❯▶\*\-]*([0-9])[\.\)]\s+(.+?)\s*$')

  $options = @()
  foreach ($ln in $tail) {
    $m = $optRx.Match($ln)
    if ($m.Success) {
      $opt = [pscustomobject]@{ num=$m.Groups[1].Value; label=$m.Groups[2].Value.Trim(); kind='other' }
      if     ($allowAlwaysRx.IsMatch($opt.label)) { $opt.kind = 'allowAlways' }
      elseif ($allowRx.IsMatch($opt.label))       { $opt.kind = 'allow' }
      elseif ($denyRx.IsMatch($opt.label))        { $opt.kind = 'deny' }
      $options += $opt
    }
  }
  if ($options.Count -ge 2) {
    return [pscustomobject]@{ type='menu'; options=$options; context=($tail -join "`n") }
  }
  $joined = $tail -join "`n"
  if ($joined -match '\((y(es)?\/n(o)?)\)|\[(y(es)?\/n(o)?)\]' -and $joined -notmatch '\d[\.\)]\s') {
    return [pscustomobject]@{ type='yn'; options=@(); context=$joined }
  }
  return $null
}

# --- Phase 2 classifier ------------------------------------------------------
function Invoke-Classifier([string]$context) {
  $sys = @"
You are a security gate for a developer terminal. A permission prompt is asking
to run an action. Reply with EXACTLY one word:
ALLOW - safe routine dev action (read files, run tests, fetch docs, build, git status).
DENY  - destructive/dangerous (rm -rf, disk format, force push to main, curl|sh
        from unknown host, credential or secret exfiltration, mass delete).
ASK   - unclear/ambiguous/not confident.
Prompt:
---
$context
---
One word only:
"@
  $body = @{ model=$cfg.classifier.model; prompt=$sys; stream=$false } | ConvertTo-Json
  try {
    $resp = Invoke-RestMethod -Uri $cfg.classifier.url -Method Post -Body $body -ContentType 'application/json' -TimeoutSec $cfg.classifier.timeoutSec
    $word = ($resp.response -replace '[^A-Za-z]','').ToUpper()
    if ($word -like 'ALLOW*') { return 'allow' }
    if ($word -like 'DENY*')  { return 'deny' }
    return 'ask'
  } catch {
    Write-Log "classifier error: $($_.Exception.Message) -> fallback=$($cfg.classifier.fallbackOnError)"
    return $cfg.classifier.fallbackOnError
  }
}

# --- Decide keystroke --------------------------------------------------------
function Resolve-Action($prompt) {
  if ($cfg.policy.mode -eq 'off') { return $null }
  $verdict = 'allow'
  if ($cfg.policy.mode -eq 'classify') {
    $verdict = Invoke-Classifier $prompt.context
    Write-Log "classifier verdict: $verdict"
    if ($verdict -eq 'ask' -and $cfg.policy.skipOnClassifierAsk) {
      return [pscustomobject]@{ keys=$null; why='classifier=ASK, leaving for human' }
    }
  }
  if ($prompt.type -eq 'yn') {
    if ($verdict -eq 'deny') { return [pscustomobject]@{ keys="n`r"; why='y/n -> DENY' } }
    $k = if ($cfg.keystroke.ynPrompt -eq 'yEnter') { "y`r" } else { "y" }
    return [pscustomobject]@{ keys=$k; why='y/n -> allow' }
  }
  $pick=$null; $why=''
  if ($verdict -eq 'deny' -and $cfg.policy.denyOnClassifierDeny) {
    $pick = $prompt.options | Where-Object kind -eq 'deny' | Select-Object -First 1; $why='DENY -> deny option'
  }
  if (-not $pick) {
    if ($cfg.policy.preferAllowAlways) {
      $pick = $prompt.options | Where-Object kind -eq 'allowAlways' | Select-Object -First 1
      if ($pick) { $why='allow-always option' }
    }
    if (-not $pick) {
      $pick = $prompt.options | Where-Object kind -eq 'allow' | Select-Object -First 1
      if ($pick) { $why='allow option' }
    }
  }
  if (-not $pick) { return $null }
  $keys = if ($cfg.keystroke.numberedMenu -eq 'digitEnter') { "$($pick.num)`r" } else { "$($pick.num)" }
  return [pscustomobject]@{ keys=$keys; why="$why (#$($pick.num): $($pick.label))" }
}

function Get-Hash([string]$s) {
  $md5 = [System.Security.Cryptography.MD5]::Create()
  [System.BitConverter]::ToString($md5.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($s)))
}

# --- Self test ---------------------------------------------------------------
if ($SelfTest) {
  $cases = @(
    @{ name='Claude fetch menu'; text="Do you want to allow Claude to fetch this content?`n> 1. Yes`n  2. Yes, and don't ask again for example.com`n  3. No, and tell Claude what to do differently (esc)" },
    @{ name='Allow/Deny menu';   text="Run command: npm test`n> 1. Allow`n  2. Deny" },
    @{ name='Plain y/n';         text="Overwrite existing file? (y/n)" },
    @{ name='Normal output';     text="build complete in 3.2s`nwrote dist/app.js" }
  )
  $cfg.policy.mode = 'approve'
  foreach ($c in $cases) {
    $p = Find-Prompt $c.text
    if (-not $p) { Write-Host ("[{0,-20}] no prompt" -f $c.name); continue }
    $a = Resolve-Action $p
    $keys = if ($a -and $a.keys) { ($a.keys -replace "`r",'<CR>') } else { '(skip)' }
    $why  = if ($a) { $a.why } else { 'no match' }
    Write-Host ("[{0,-20}] type={1,-4} press={2,-6} :: {3}" -f $c.name,$p.type,$keys,$why)
  }
  return
}

# --- Parent watchdog ---------------------------------------------------------
# This daemon presses keys in the user's terminals, so it must never outlive the
# app that owns it. The host stops it on a clean quit; this covers a crash or a
# force-kill, where no shutdown code runs at all.
function Test-ParentAlive {
  if ($ParentPid -le 0) { return $true }
  try { return $null -ne (Get-Process -Id $ParentPid -ErrorAction Stop) }
  catch { return $false }
}

# --- Main loop ---------------------------------------------------------------
Write-Log ("START engine=console-attach mode={0} dryrun={1} once={2} poll={3}ms parent={4}" -f $cfg.policy.mode,$DryRun,$Once,$cfg.pollMs,$ParentPid)
if (-not (Test-ParentAlive)) {
  Write-Log "EXIT parent $ParentPid is not running"
  return
}
$handled = @{}          # pid -> @{ hash=...; at=DateTime }
$tabPids = @()
$refresh = 0

while ($true) {
  if ($refresh -le 0) { $tabPids = @(Get-TabPids); $refresh = 10 }
  $refresh--

  foreach ($tp in $tabPids) {
    $text = [ConIO]::Read([uint32]$tp)
    if (-not $text) { continue }
    $prompt = Find-Prompt $text
    if (-not $prompt) { $handled.Remove($tp); continue }

    $hash = Get-Hash $prompt.context
    $prev = $handled[$tp]
    if ($prev) {
      $cool = ((Get-Date) - $prev.at).TotalMilliseconds -lt $cfg.cooldownMs
      if ($prev.hash -eq $hash -or $cool) { continue }
    }

    $action = Resolve-Action $prompt
    if ($null -eq $action) { Write-Log "tab $tp prompt($($prompt.type)): no matching action"; continue }
    if (-not $action.keys) { Write-Log "tab $tp prompt($($prompt.type)): $($action.why)"; continue }

    $shown = $action.keys -replace "`r",'<CR>'
    if ($DryRun) {
      Write-Log "tab $tp DRYRUN would press '$shown' :: $($action.why)"
    } else {
      $ok = [ConIO]::Send([uint32]$tp, $action.keys)
      Write-Log "tab $tp PRESS '$shown' ok=$ok :: $($action.why)"
    }
    $handled[$tp] = @{ hash=$hash; at=(Get-Date) }
  }

  if ($Once) { break }

  # Stop as soon as the owning app is gone, before the next scan pass.
  if (-not (Test-ParentAlive)) {
    Write-Log "EXIT parent $ParentPid exited"
    break
  }

  Start-Sleep -Milliseconds $cfg.pollMs
}
