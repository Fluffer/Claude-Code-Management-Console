# Dev-Projects Launcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A persistent Windows GUI hub that lists projects across configurable root folders, launches Claude Code sessions (new/continue) into Windows Terminal tabs, and creates new project folders.

**Architecture:** PowerShell + WPF. All non-UI logic lives in `functions.ps1` (unit-tested with Pester); `launcher.ps1` loads `MainWindow.xaml` via XamlReader and wires events; `launcher.cmd` picks pwsh or Windows PowerShell 5.1. Config persists to `%APPDATA%\Dev-Projects\config.json`.

**Tech Stack:** PowerShell 7 (5.1-compatible syntax), WPF/XAML, Pester 5, Windows Terminal (`wt.exe`).

**Spec:** `docs/superpowers/specs/2026-06-06-dev-projects-design.md`

**Hard constraints (apply to every task):**
- All `.ps1` code MUST be PowerShell 5.1-compatible: no `&&`/`||` pipeline chains, no ternary (`? :`), no `??`, no `ConvertFrom-Json -AsHashtable`.
- XAML loaded via XamlReader: no `x:Class`, no event attributes in XAML — wire all events in code.
- Run tests with: `pwsh -NoProfile -Command "Invoke-Pester -Path tests -Output Detailed"` from the repo root `C:\Dev\Active\Claude Cli Management`.

---

## File Structure

```
Claude Cli Management\
├─ launcher.cmd                  # shim: pwsh if present, else powershell 5.1
├─ launcher.ps1                  # entry: mutex, load XAML, wire events, dialogs
├─ MainWindow.xaml               # main window UI (sidebar + list)
├─ functions.ps1                 # config, scanner, validation, launch, usage
└─ tests\functions.Tests.ps1     # Pester unit tests for functions.ps1
```

---

### Task 1: Scaffold, Pester check, launcher.cmd

**Files:**
- Create: `launcher.cmd`
- Create: `tests\` (directory)

- [ ] **Step 1: Verify Pester 5 is available**

Run: `pwsh -NoProfile -Command "(Get-Module Pester -ListAvailable | Sort-Object Version -Descending | Select-Object -First 1).Version"`
Expected: `5.x.x`. If lower/missing, run: `pwsh -NoProfile -Command "Install-Module Pester -Force -Scope CurrentUser -SkipPublisherCheck"`

- [ ] **Step 2: Create launcher.cmd**

```bat
@echo off
where pwsh >nul 2>nul
if %errorlevel%==0 (
  start "" pwsh -WindowStyle Hidden -File "%~dp0launcher.ps1"
) else (
  start "" powershell -WindowStyle Hidden -File "%~dp0launcher.ps1"
)
```

- [ ] **Step 3: Verify the shim picks pwsh**

Run: `where pwsh`
Expected: a path is printed (pwsh installed on this machine), so the `if` branch will be used. (`launcher.ps1` doesn't exist yet — do NOT run the cmd yet.)

- [ ] **Step 4: Commit**

```powershell
git add launcher.cmd
git commit -m "feat: add shell-picking launcher shim"
```

---

### Task 2: Config functions

**Files:**
- Create: `functions.ps1`
- Create: `tests\functions.Tests.ps1`

- [ ] **Step 1: Write failing tests for config load/save/defaults/corrupt-recovery**

Create `tests\functions.Tests.ps1`:

```powershell
BeforeAll {
    . (Join-Path (Split-Path $PSScriptRoot -Parent) 'functions.ps1')
}

Describe 'Get-DefaultConfig' {
    It 'seeds the five C:\Dev roots' {
        $config = Get-DefaultConfig
        $config.roots.Count | Should -Be 5
        $config.roots | Should -Contain 'C:\Dev\Active'
        $config.defaultRoot | Should -Be 'C:\Dev\Active'
        $config.ignore.Count | Should -Be 0
    }
}

Describe 'Get-LauncherConfig / Save-LauncherConfig' {
    It 'creates defaults on first run' {
        $path = Join-Path $TestDrive 'cfg\config.json'
        $config = Get-LauncherConfig -Path $path
        $config.defaultRoot | Should -Be 'C:\Dev\Active'
        Test-Path $path | Should -BeTrue
    }

    It 'round-trips saved values' {
        $path = Join-Path $TestDrive 'rt\config.json'
        $config = Get-LauncherConfig -Path $path
        $config.defaultRoot = 'C:\Dev\Scratch'
        Save-LauncherConfig -Config $config -Path $path
        (Get-LauncherConfig -Path $path).defaultRoot | Should -Be 'C:\Dev\Scratch'
    }

    It 'recovers from corrupt JSON, preserving the bad file' {
        $path = Join-Path $TestDrive 'bad\config.json'
        New-Item -ItemType Directory -Path (Split-Path $path -Parent) -Force | Out-Null
        Set-Content -Path $path -Value '{not json!!!'
        $config = Get-LauncherConfig -Path $path
        $config.defaultRoot | Should -Be 'C:\Dev\Active'
        Test-Path "$path.bad" | Should -BeTrue
    }

    It 'backfills missing properties from defaults' {
        $path = Join-Path $TestDrive 'partial\config.json'
        New-Item -ItemType Directory -Path (Split-Path $path -Parent) -Force | Out-Null
        Set-Content -Path $path -Value '{"roots":["C:\\Dev\\Active"]}'
        $config = Get-LauncherConfig -Path $path
        $config.defaultRoot | Should -Be 'C:\Dev\Active'
        $config.PSObject.Properties.Name | Should -Contain 'projects'
        $config.PSObject.Properties.Name | Should -Contain 'ignore'
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pwsh -NoProfile -Command "Invoke-Pester -Path tests -Output Detailed"`
Expected: FAIL — `functions.ps1` does not exist / commands not recognized.

- [ ] **Step 3: Implement config functions**

Create `functions.ps1`:

```powershell
# functions.ps1 — Dev-Projects non-UI logic.
# MUST remain PowerShell 5.1 compatible (no &&/||, no ternary, no ??, no -AsHashtable).
Set-StrictMode -Version 2.0

function Get-ConfigPath {
    return (Join-Path $env:APPDATA 'Dev-Projects\config.json')
}

function Get-DefaultConfig {
    return [pscustomobject]@{
        roots       = @('C:\Dev\Active', 'C:\Dev\Archive', 'C:\Dev\Scratch', 'C:\Dev\Stable', 'C:\Dev\third-party')
        defaultRoot = 'C:\Dev\Active'
        ignore      = @()
        projects    = [pscustomobject]@{}
    }
}

function Save-LauncherConfig {
    param(
        [Parameter(Mandatory)] $Config,
        [string]$Path = (Get-ConfigPath)
    )
    $dir = Split-Path $Path -Parent
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    $Config | ConvertTo-Json -Depth 5 | Set-Content -Path $Path -Encoding UTF8
}

function Get-LauncherConfig {
    param([string]$Path = (Get-ConfigPath))

    if (-not (Test-Path $Path)) {
        $config = Get-DefaultConfig
        Save-LauncherConfig -Config $config -Path $Path
        return $config
    }

    try {
        $raw = Get-Content -Path $Path -Raw -ErrorAction Stop
        $config = $raw | ConvertFrom-Json -ErrorAction Stop
    }
    catch {
        Move-Item -Path $Path -Destination "$Path.bad" -Force
        $config = Get-DefaultConfig
        Save-LauncherConfig -Config $config -Path $Path
        return $config
    }

    # Backfill any properties missing from older/hand-edited configs.
    $defaults = Get-DefaultConfig
    foreach ($prop in @('roots', 'defaultRoot', 'ignore', 'projects')) {
        # Indexer form: .Name throws under StrictMode 2.0 on property-less objects ('{}' config).
        if ($null -eq $config.PSObject.Properties[$prop]) {
            $config | Add-Member -NotePropertyName $prop -NotePropertyValue $defaults.$prop
        }
    }
    return $config
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pwsh -NoProfile -Command "Invoke-Pester -Path tests -Output Detailed"`
Expected: all PASS.

- [ ] **Step 5: Commit**

```powershell
git add functions.ps1 tests/functions.Tests.ps1
git commit -m "feat: config load/save with corrupt-file recovery"
```

---

### Task 3: Project scanner

**Files:**
- Modify: `functions.ps1` (append)
- Modify: `tests\functions.Tests.ps1` (append)

- [ ] **Step 1: Write failing tests for Get-Projects**

Append to `tests\functions.Tests.ps1`:

```powershell
Describe 'Get-Projects' {
    BeforeEach {
        $script:rootA = Join-Path $TestDrive 'RootA'
        $script:rootB = Join-Path $TestDrive 'RootB'
        New-Item -ItemType Directory -Path (Join-Path $rootA 'Proj1') -Force | Out-Null
        New-Item -ItemType Directory -Path (Join-Path $rootA 'Proj2') -Force | Out-Null
        New-Item -ItemType Directory -Path (Join-Path $rootA '.git-stuff') -Force | Out-Null
        New-Item -ItemType Directory -Path (Join-Path $rootA 'notes') -Force | Out-Null
        New-Item -ItemType Directory -Path (Join-Path $rootB 'Proj3') -Force | Out-Null

        $script:config = Get-DefaultConfig
        $config.roots = @($rootA, $rootB, (Join-Path $TestDrive 'Missing'))
        $config.ignore = @('notes')
    }

    It 'finds direct subfolders across roots, skipping dot/ignored folders and missing roots' {
        $projects = @(Get-Projects -Config $config)
        $projects.Count | Should -Be 3
        ($projects | ForEach-Object { $_.Name }) | Should -Not -Contain '.git-stuff'
        ($projects | ForEach-Object { $_.Name }) | Should -Not -Contain 'notes'
    }

    It 'attaches lastUsed and flags from config' {
        $projPath = Join-Path $rootA 'Proj1'
        $config.projects | Add-Member -NotePropertyName $projPath -NotePropertyValue ([pscustomobject]@{
            lastUsed = '2026-06-01T10:00:00.0000000Z'
            flags    = '--model opus'
        })
        $projects = @(Get-Projects -Config $config)
        $p1 = $projects | Where-Object { $_.Path -eq $projPath }
        $p1.Flags | Should -Be '--model opus'
        $p1.LastUsed | Should -BeOfType [datetime]
        ($projects | Where-Object { $_.Name -eq 'Proj2' }).LastUsed | Should -BeNullOrEmpty
    }
}
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `pwsh -NoProfile -Command "Invoke-Pester -Path tests -Output Detailed"`
Expected: prior tests PASS, `Get-Projects` tests FAIL (command not found).

- [ ] **Step 3: Implement Get-Projects**

Append to `functions.ps1`:

```powershell
function Get-Projects {
    param([Parameter(Mandatory)] $Config)

    $projects = @()
    foreach ($root in $Config.roots) {
        if (-not (Test-Path $root)) { continue }
        $dirs = Get-ChildItem -Path $root -Directory | Where-Object {
            ($_.Name -notlike '.*') -and
            (-not ($_.Attributes -band [System.IO.FileAttributes]::Hidden)) -and
            ($Config.ignore -notcontains $_.Name)
        }
        foreach ($dir in $dirs) {
            $lastUsed = $null
            $flags = ''
            # NOTE: .PSObject.Properties.Name throws under StrictMode 2.0 when the
            # object has zero properties — use the indexer form instead.
            if ($null -ne $Config.projects.PSObject.Properties[$dir.FullName]) {
                $saved = $Config.projects.($dir.FullName)
                if ($null -ne $saved.PSObject.Properties['lastUsed']) {
                    if ($saved.lastUsed) {
                        # RoundtripKind preserves Kind=Utc for Z-suffixed ISO strings.
                        $lastUsed = [datetime]::Parse($saved.lastUsed, $null,
                            [System.Globalization.DateTimeStyles]::RoundtripKind)
                    }
                }
                if ($null -ne $saved.PSObject.Properties['flags']) {
                    if ($saved.flags) { $flags = [string]$saved.flags }
                }
            }
            $projects += [pscustomobject]@{
                Name     = $dir.Name
                Root     = $root
                Path     = $dir.FullName
                LastUsed = $lastUsed
                Flags    = $flags
            }
        }
    }
    return $projects
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pwsh -NoProfile -Command "Invoke-Pester -Path tests -Output Detailed"`
Expected: all PASS.

- [ ] **Step 5: Commit**

```powershell
git add functions.ps1 tests/functions.Tests.ps1
git commit -m "feat: project scanner with ignore/hidden filtering"
```

---

### Task 4: Name validation and folder creation

**Files:**
- Modify: `functions.ps1` (append)
- Modify: `tests\functions.Tests.ps1` (append)

- [ ] **Step 1: Write failing tests**

Append to `tests\functions.Tests.ps1`:

```powershell
Describe 'Get-ProjectNameError' {
    BeforeEach {
        $script:root = Join-Path $TestDrive 'NameRoot'
        New-Item -ItemType Directory -Path (Join-Path $root 'Taken') -Force | Out-Null
    }

    It 'rejects empty and whitespace names' {
        Get-ProjectNameError -Name '' -Root $root | Should -Not -BeNullOrEmpty
        Get-ProjectNameError -Name '   ' -Root $root | Should -Not -BeNullOrEmpty
    }

    It 'rejects invalid filename characters' {
        foreach ($bad in @('a<b', 'a>b', 'a:b', 'a"b', 'a/b', 'a\b', 'a|b', 'a?b', 'a*b')) {
            Get-ProjectNameError -Name $bad -Root $root | Should -Not -BeNullOrEmpty
        }
    }

    It 'rejects duplicates' {
        Get-ProjectNameError -Name 'Taken' -Root $root | Should -Not -BeNullOrEmpty
    }

    It 'accepts a valid new name' {
        Get-ProjectNameError -Name 'My-New Project' -Root $root | Should -BeNullOrEmpty
    }
}

Describe 'New-ProjectFolder' {
    It 'creates the folder and returns its path' {
        $root = Join-Path $TestDrive 'CreateRoot'
        New-Item -ItemType Directory -Path $root -Force | Out-Null
        $path = New-ProjectFolder -Root $root -Name 'Fresh'
        $path | Should -Be (Join-Path $root 'Fresh')
        Test-Path $path | Should -BeTrue
    }

    It 'throws when creation fails' {
        { New-ProjectFolder -Root (Join-Path $TestDrive 'NoSuchRoot') -Name 'X' } | Should -Throw
    }
}
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `pwsh -NoProfile -Command "Invoke-Pester -Path tests -Output Detailed"`
Expected: new Describe blocks FAIL.

- [ ] **Step 3: Implement validation and creation**

Append to `functions.ps1`:

```powershell
function Get-ProjectNameError {
    param(
        [string]$Name,
        [Parameter(Mandatory)] [string]$Root
    )
    if ([string]::IsNullOrWhiteSpace($Name)) {
        return 'Project name cannot be empty.'
    }
    if ($Name -match '[<>:"/\\|?*]') {
        return 'Project name contains invalid characters: < > : " / \ | ? *'
    }
    if (Test-Path (Join-Path $Root $Name)) {
        return "A folder named '$Name' already exists in $Root."
    }
    return $null
}

function New-ProjectFolder {
    param(
        [Parameter(Mandatory)] [string]$Root,
        [Parameter(Mandatory)] [string]$Name
    )
    if (-not (Test-Path $Root)) {
        throw "Root folder does not exist: $Root"
    }
    $path = Join-Path $Root $Name
    New-Item -ItemType Directory -Path $path -ErrorAction Stop | Out-Null
    return $path
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pwsh -NoProfile -Command "Invoke-Pester -Path tests -Output Detailed"`
Expected: all PASS.

- [ ] **Step 5: Commit**

```powershell
git add functions.ps1 tests/functions.Tests.ps1
git commit -m "feat: project name validation and folder creation"
```

---

### Task 5: Shell detection, argument quoting, launch command building

**Files:**
- Modify: `functions.ps1` (append)
- Modify: `tests\functions.Tests.ps1` (append)

- [ ] **Step 1: Write failing tests**

Append to `tests\functions.Tests.ps1`:

```powershell
Describe 'Get-PreferredShell' {
    It 'returns pwsh or powershell' {
        Get-PreferredShell | Should -BeIn @('pwsh', 'powershell')
    }
}

Describe 'ConvertTo-ArgumentString' {
    It 'passes simple args through' {
        ConvertTo-ArgumentString -Arguments @('-w', '0', 'new-tab') | Should -Be '-w 0 new-tab'
    }

    It 'quotes args containing spaces' {
        ConvertTo-ArgumentString -Arguments @('-d', 'C:\Dev\My Project') |
            Should -Be '-d "C:\Dev\My Project"'
    }

    It 'escapes embedded double quotes' {
        ConvertTo-ArgumentString -Arguments @('claude --append-system-prompt "be brief"') |
            Should -Be '"claude --append-system-prompt \"be brief\""'
    }
}

Describe 'Build-LaunchCommand' {
    It 'builds a wt new-tab command when wt is available' {
        $spec = Build-LaunchCommand -ProjectName 'My Proj' -ProjectPath 'C:\Dev\Active\My Proj' `
            -Shell 'pwsh' -WtPath 'C:\wt\wt.exe'
        $spec.FilePath | Should -Be 'C:\wt\wt.exe'
        $spec.ArgumentList | Should -Be '-w 0 new-tab --title "My Proj" -d "C:\Dev\Active\My Proj" pwsh -NoExit -Command claude'
        $spec.WorkingDirectory | Should -BeNullOrEmpty
    }

    It 'appends --continue and flags' {
        $spec = Build-LaunchCommand -ProjectName 'P' -ProjectPath 'C:\P' -Flags '--model opus' `
            -Continue -Shell 'pwsh' -WtPath 'C:\wt\wt.exe'
        $spec.ArgumentList | Should -Match '"claude --continue --model opus"$'
    }

    It 'falls back to a plain shell window when wt is missing' {
        $spec = Build-LaunchCommand -ProjectName 'P' -ProjectPath 'C:\Dev\P' -Shell 'powershell' -WtPath ''
        $spec.FilePath | Should -Be 'powershell'
        $spec.WorkingDirectory | Should -Be 'C:\Dev\P'
        $spec.ArgumentList | Should -Be '-NoExit -Command claude'
    }
}
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `pwsh -NoProfile -Command "Invoke-Pester -Path tests -Output Detailed"`
Expected: new Describe blocks FAIL.

- [ ] **Step 3: Implement shell detection and command building**

Append to `functions.ps1`:

```powershell
function Get-PreferredShell {
    if (Get-Command pwsh -ErrorAction SilentlyContinue) { return 'pwsh' }
    return 'powershell'
}

function Find-WindowsTerminal {
    $cmd = Get-Command wt.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    # Store installs expose wt.exe via the App Execution Alias, which may not be on PATH.
    $alias = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\wt.exe'
    if (Test-Path $alias) { return $alias }
    return $null
}

function ConvertTo-ArgumentString {
    param([string[]]$Arguments)
    $quoted = foreach ($arg in $Arguments) {
        if ($arg -match '[\s"]') {
            # CommandLineToArgvW rules: double any backslash run preceding a quote
            # (or the end of a quoted token), then escape the quote itself.
            $escaped = $arg -replace '(\\*)"', '$1$1\"'
            $escaped = $escaped -replace '(\\+)$', '$1$1'
            '"' + $escaped + '"'
        }
        else {
            $arg
        }
    }
    return ($quoted -join ' ')
}

function Build-LaunchCommand {
    param(
        [Parameter(Mandatory)] [string]$ProjectName,
        [Parameter(Mandatory)] [string]$ProjectPath,
        [string]$Flags = '',
        [switch]$Continue,
        [string]$Shell = (Get-PreferredShell),
        [string]$WtPath = (Find-WindowsTerminal)
    )
    $claudeCmd = 'claude'
    if ($Continue) { $claudeCmd = $claudeCmd + ' --continue' }
    if (-not [string]::IsNullOrWhiteSpace($Flags)) { $claudeCmd = $claudeCmd + ' ' + $Flags.Trim() }

    if (-not [string]::IsNullOrWhiteSpace($WtPath)) {
        $wtArgs = @('-w', '0', 'new-tab', '--title', $ProjectName, '-d', $ProjectPath,
                    $Shell, '-NoExit', '-Command', $claudeCmd)
        return [pscustomobject]@{
            FilePath         = $WtPath
            ArgumentList     = (ConvertTo-ArgumentString -Arguments $wtArgs)
            WorkingDirectory = $null
        }
    }
    return [pscustomobject]@{
        FilePath         = $Shell
        ArgumentList     = (ConvertTo-ArgumentString -Arguments @('-NoExit', '-Command', $claudeCmd))
        WorkingDirectory = $ProjectPath
    }
}

function Invoke-ProjectLaunch {
    param([Parameter(Mandatory)] $LaunchSpec)
    if ($LaunchSpec.WorkingDirectory) {
        Start-Process -FilePath $LaunchSpec.FilePath -ArgumentList $LaunchSpec.ArgumentList `
            -WorkingDirectory $LaunchSpec.WorkingDirectory
    }
    else {
        Start-Process -FilePath $LaunchSpec.FilePath -ArgumentList $LaunchSpec.ArgumentList
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pwsh -NoProfile -Command "Invoke-Pester -Path tests -Output Detailed"`
Expected: all PASS.

- [ ] **Step 5: Commit**

```powershell
git add functions.ps1 tests/functions.Tests.ps1
git commit -m "feat: shell detection and quoted launch command building"
```

---

### Task 6: Usage tracking and relative time

**Files:**
- Modify: `functions.ps1` (append)
- Modify: `tests\functions.Tests.ps1` (append)

- [ ] **Step 1: Write failing tests**

Append to `tests\functions.Tests.ps1`:

```powershell
Describe 'Update-ProjectUsage' {
    It 'adds a new project entry and persists it' {
        $path = Join-Path $TestDrive 'usage\config.json'
        $config = Get-LauncherConfig -Path $path
        Update-ProjectUsage -Config $config -ProjectPath 'C:\Dev\Active\P1' -Flags '--model opus' -ConfigPath $path

        $reloaded = Get-LauncherConfig -Path $path
        $entry = $reloaded.projects.'C:\Dev\Active\P1'
        $entry.flags | Should -Be '--model opus'
        ([datetime]$entry.lastUsed) | Should -BeOfType [datetime]
    }

    It 'updates an existing entry' {
        $path = Join-Path $TestDrive 'usage2\config.json'
        $config = Get-LauncherConfig -Path $path
        Update-ProjectUsage -Config $config -ProjectPath 'C:\P' -Flags 'a' -ConfigPath $path
        Update-ProjectUsage -Config $config -ProjectPath 'C:\P' -Flags 'b' -ConfigPath $path
        (Get-LauncherConfig -Path $path).projects.'C:\P'.flags | Should -Be 'b'
    }
}

Describe 'Format-RelativeTime' {
    It 'returns empty for null' {
        Format-RelativeTime -Timestamp $null | Should -Be ''
    }

    It 'formats minutes, hours, days' {
        $now = (Get-Date).ToUniversalTime()
        Format-RelativeTime -Timestamp $now.AddMinutes(-5) | Should -Be '5m ago'
        Format-RelativeTime -Timestamp $now.AddHours(-3) | Should -Be '3h ago'
        Format-RelativeTime -Timestamp $now.AddDays(-2) | Should -Be '2d ago'
    }

    It 'falls back to a date after a week' {
        $old = (Get-Date).ToUniversalTime().AddDays(-30)
        Format-RelativeTime -Timestamp $old | Should -Match '^\d{4}-\d{2}-\d{2}$'
    }
}
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `pwsh -NoProfile -Command "Invoke-Pester -Path tests -Output Detailed"`
Expected: new Describe blocks FAIL.

- [ ] **Step 3: Implement usage tracking and time formatting**

Append to `functions.ps1`:

```powershell
function Update-ProjectUsage {
    param(
        [Parameter(Mandatory)] $Config,
        [Parameter(Mandatory)] [string]$ProjectPath,
        [string]$Flags = '',
        [string]$ConfigPath = (Get-ConfigPath)
    )
    $stamp = (Get-Date).ToUniversalTime().ToString('o')
    if ($null -ne $Config.projects.PSObject.Properties[$ProjectPath]) {
        $Config.projects.$ProjectPath.lastUsed = $stamp
        $Config.projects.$ProjectPath.flags = $Flags
    }
    else {
        $entry = [pscustomobject]@{ lastUsed = $stamp; flags = $Flags }
        $Config.projects | Add-Member -NotePropertyName $ProjectPath -NotePropertyValue $entry
    }
    Save-LauncherConfig -Config $Config -Path $ConfigPath
}

function Format-RelativeTime {
    param([Nullable[datetime]]$Timestamp)
    if ($null -eq $Timestamp) { return '' }
    # PowerShell unwraps Nullable[datetime] on bind; after the null guard this is
    # always a plain datetime (.Value access would throw under StrictMode 2.0).
    $ts = $Timestamp
    $span = (Get-Date).ToUniversalTime() - $ts.ToUniversalTime()
    if ($span.TotalMinutes -lt 1) { return 'just now' }
    if ($span.TotalHours -lt 1) { return ('{0}m ago' -f [int][math]::Floor($span.TotalMinutes)) }
    if ($span.TotalDays -lt 1) { return ('{0}h ago' -f [int][math]::Floor($span.TotalHours)) }
    if ($span.TotalDays -lt 7) { return ('{0}d ago' -f [int][math]::Floor($span.TotalDays)) }
    return $ts.ToLocalTime().ToString('yyyy-MM-dd')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pwsh -NoProfile -Command "Invoke-Pester -Path tests -Output Detailed"`
Expected: all PASS.

- [ ] **Step 5: Commit**

```powershell
git add functions.ps1 tests/functions.Tests.ps1
git commit -m "feat: usage tracking and relative time formatting"
```

---

### Task 7: MainWindow.xaml and minimal window startup

**Files:**
- Create: `MainWindow.xaml`
- Create: `launcher.ps1`

- [ ] **Step 1: Create MainWindow.xaml**

NOTE: no `x:Class`, no event attributes — XamlReader rejects them. All events wired in launcher.ps1.

```xml
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Dev-Projects" Height="620" Width="920"
        WindowStartupLocation="CenterScreen" FontSize="13">
  <DockPanel>
    <Border x:Name="WarningBanner" DockPanel.Dock="Top" Background="#FFF3CD"
            Padding="8" Visibility="Collapsed">
      <TextBlock x:Name="WarningText" Foreground="#856404" TextWrapping="Wrap"/>
    </Border>

    <DockPanel DockPanel.Dock="Left" Width="190" LastChildFill="True">
      <Button x:Name="SettingsButton" DockPanel.Dock="Bottom" Content="Settings"
              Margin="8" Padding="6,4"/>
      <ListBox x:Name="SidebarList" BorderThickness="0" Margin="4"
               DisplayMemberPath="DisplayName">
        <ListBox.ItemContainerStyle>
          <Style TargetType="ListBoxItem">
            <Setter Property="IsEnabled" Value="{Binding Enabled}"/>
            <Setter Property="Padding" Value="8,5"/>
          </Style>
        </ListBox.ItemContainerStyle>
      </ListBox>
    </DockPanel>

    <DockPanel Margin="8">
      <TextBox x:Name="SearchBox" DockPanel.Dock="Top" Margin="0,0,0,8" Padding="4"/>

      <DockPanel DockPanel.Dock="Top" Margin="0,0,0,8">
        <TextBlock Text="Flags:" VerticalAlignment="Center" Margin="0,0,6,0"
                   DockPanel.Dock="Left"/>
        <TextBox x:Name="FlagsBox" Padding="4" IsEnabled="False"/>
      </DockPanel>

      <DockPanel DockPanel.Dock="Bottom" Margin="0,8,0,0" LastChildFill="False">
        <Button x:Name="NewProjectButton" Content="+ New Project" Padding="10,5"
                DockPanel.Dock="Left"/>
        <Button x:Name="RefreshButton" Content="Refresh" Padding="10,5" Margin="8,0,0,0"
                DockPanel.Dock="Left"/>
      </DockPanel>

      <ListView x:Name="ProjectList">
        <ListView.ItemContainerStyle>
          <Style TargetType="ListViewItem">
            <Setter Property="HorizontalContentAlignment" Value="Stretch"/>
            <Setter Property="Padding" Value="6,4"/>
          </Style>
        </ListView.ItemContainerStyle>
        <ListView.ItemTemplate>
          <DataTemplate>
            <DockPanel LastChildFill="False">
              <StackPanel Orientation="Horizontal" DockPanel.Dock="Left">
                <TextBlock Text="{Binding Name}" FontWeight="Bold"
                           VerticalAlignment="Center"/>
                <Border Background="#DDEEFF" CornerRadius="8" Padding="6,1"
                        Margin="8,0,0,0" VerticalAlignment="Center">
                  <TextBlock Text="{Binding RootName}" FontSize="10"/>
                </Border>
                <TextBlock Text="{Binding LastUsedText}" Foreground="Gray" FontSize="11"
                           Margin="8,0,0,0" VerticalAlignment="Center"/>
              </StackPanel>
              <StackPanel Orientation="Horizontal" DockPanel.Dock="Right">
                <Button Content="New" Tag="{Binding}" Padding="10,2" Margin="0,0,6,0"/>
                <Button Content="Continue" Tag="{Binding}" Padding="10,2"/>
              </StackPanel>
            </DockPanel>
          </DataTemplate>
        </ListView.ItemTemplate>
      </ListView>
    </DockPanel>
  </DockPanel>
</Window>
```

- [ ] **Step 2: Create minimal launcher.ps1 (loads window, no wiring yet)**

```powershell
# launcher.ps1 — Dev-Projects entry point.
# MUST remain PowerShell 5.1 compatible (no &&/||, no ternary, no ??).
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationFramework

$script:AppRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $script:AppRoot 'functions.ps1')

# --- Single instance guard ---
$created = $false
$script:Mutex = New-Object System.Threading.Mutex($true, 'DevProjectsLauncher', [ref]$created)
if (-not $created) {
    [System.Windows.MessageBox]::Show('Dev-Projects is already running.', 'Dev-Projects',
        'OK', 'Information') | Out-Null
    exit
}

try {
    # --- Load main window ---
    [xml]$xaml = Get-Content -Path (Join-Path $script:AppRoot 'MainWindow.xaml') -Raw
    $reader = New-Object System.Xml.XmlNodeReader $xaml
    $window = [System.Windows.Markup.XamlReader]::Load($reader)

    # --- Find controls ---
    $controls = @{}
    foreach ($name in @('WarningBanner', 'WarningText', 'SidebarList', 'SettingsButton',
                        'SearchBox', 'FlagsBox', 'ProjectList', 'NewProjectButton',
                        'RefreshButton')) {
        $controls[$name] = $window.FindName($name)
    }

    $window.ShowDialog() | Out-Null
}
finally {
    $script:Mutex.ReleaseMutex()
    $script:Mutex.Dispose()
}
```

- [ ] **Step 3: Verify the window opens**

Run: `pwsh -NoProfile -File launcher.ps1`
Expected: empty Dev-Projects window opens (sidebar empty, list empty). Close it manually.

- [ ] **Step 4: Verify single-instance guard**

Run `pwsh -NoProfile -File launcher.ps1` in one terminal; while the window is open, run the same command in a second terminal.
Expected: second instance shows "Dev-Projects is already running." and exits.

- [ ] **Step 5: Commit**

```powershell
git add MainWindow.xaml launcher.ps1
git commit -m "feat: main window XAML and entry point with single-instance mutex"
```

---

### Task 8: Populate sidebar, project list, search filter

**Files:**
- Modify: `launcher.ps1` (insert UI logic between control lookup and `ShowDialog`)

- [ ] **Step 1: Add state, view-model builder, and render functions**

Insert into `launcher.ps1` after the `$controls` loop and before `$window.ShowDialog()`:

```powershell
    # --- State ---
    $script:Config = Get-LauncherConfig
    $script:Projects = @()          # raw scan results
    $script:SelectedRoot = $null    # $null = All
    $script:LoadingFlags = $false   # guard: suppress FlagsBox save while loading

    function ConvertTo-ProjectViewModel {
        param($Project)
        return [pscustomobject]@{
            Name         = $Project.Name
            Root         = $Project.Root
            RootName     = (Split-Path $Project.Root -Leaf)
            Path         = $Project.Path
            LastUsed     = $Project.LastUsed
            LastUsedText = (Format-RelativeTime -Timestamp $Project.LastUsed)
            Flags        = $Project.Flags
        }
    }

    function Update-Sidebar {
        $items = New-Object System.Collections.ArrayList
        $total = @($script:Projects).Count
        [void]$items.Add([pscustomobject]@{
            DisplayName = "All ($total)"; Root = $null; Enabled = $true
        })
        foreach ($root in $script:Config.roots) {
            $exists = Test-Path $root
            $count = @($script:Projects | Where-Object { $_.Root -eq $root }).Count
            $leaf = Split-Path $root -Leaf
            [void]$items.Add([pscustomobject]@{
                DisplayName = "$leaf ($count)"; Root = $root; Enabled = $exists
            })
        }
        $controls.SidebarList.ItemsSource = $items
        $controls.SidebarList.SelectedIndex = 0
    }

    function Update-ProjectList {
        $filtered = @($script:Projects)
        if ($script:SelectedRoot) {
            $filtered = @($filtered | Where-Object { $_.Root -eq $script:SelectedRoot })
        }
        $search = $controls.SearchBox.Text
        if (-not [string]::IsNullOrWhiteSpace($search)) {
            $filtered = @($filtered | Where-Object { $_.Name -like "*$search*" })
        }
        $sorted = @($filtered | Sort-Object @{Expression = 'LastUsed'; Descending = $true}, 'Name')
        $vms = @($sorted | ForEach-Object { ConvertTo-ProjectViewModel -Project $_ })
        $controls.ProjectList.ItemsSource = $vms
    }

    function Invoke-Rescan {
        $script:Config = Get-LauncherConfig
        $script:Projects = @(Get-Projects -Config $script:Config)
        Update-Sidebar
        Update-ProjectList
    }

    # --- Event wiring: sidebar, search, refresh ---
    $controls.SidebarList.Add_SelectionChanged({
        $item = $controls.SidebarList.SelectedItem
        if ($null -ne $item) {
            $script:SelectedRoot = $item.Root
            Update-ProjectList
        }
    })

    $controls.SearchBox.Add_TextChanged({ Update-ProjectList })

    $controls.RefreshButton.Add_Click({ Invoke-Rescan })

    Invoke-Rescan
```

- [ ] **Step 2: Verify population and filtering manually**

Run: `pwsh -NoProfile -File launcher.ps1`
Expected:
- Sidebar shows "All (n)" plus the five roots with counts; any root missing on disk is greyed out.
- Project list shows all projects, name + root tag.
- Clicking a root filters the list; typing in search filters live.
- Refresh re-scans (create a folder in `C:\Dev\Scratch` while open, click Refresh, it appears).

- [ ] **Step 3: Commit**

```powershell
git add launcher.ps1
git commit -m "feat: sidebar, project list, search and refresh"
```

---

### Task 9: Launch buttons and flags textbox

**Files:**
- Modify: `launcher.ps1` (insert after the Task 8 block, before `Invoke-Rescan`)

- [ ] **Step 1: Add claude detection banner**

Insert right after the `$controls` lookup loop:

```powershell
    if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
        $controls.WarningText.Text = "'claude' was not found on PATH. Launches will open a terminal but the command will fail."
        $controls.WarningBanner.Visibility = 'Visible'
    }
```

- [ ] **Step 2: Add flags textbox and row-button wiring**

Insert before the final `Invoke-Rescan` line:

```powershell
    # --- Flags textbox: bound to selected project; edits persist immediately ---
    $controls.ProjectList.Add_SelectionChanged({
        $vm = $controls.ProjectList.SelectedItem
        $script:LoadingFlags = $true
        if ($null -ne $vm) {
            $controls.FlagsBox.IsEnabled = $true
            $controls.FlagsBox.Text = $vm.Flags
        }
        else {
            $controls.FlagsBox.Text = ''
            $controls.FlagsBox.IsEnabled = $false
        }
        $script:LoadingFlags = $false
    })

    $controls.FlagsBox.Add_TextChanged({
        if ($script:LoadingFlags) { return }
        $vm = $controls.ProjectList.SelectedItem
        if ($null -eq $vm) { return }
        $vm.Flags = $controls.FlagsBox.Text
        # Persist without bumping lastUsed: write flags directly.
        if ($null -ne $script:Config.projects.PSObject.Properties[$vm.Path]) {
            $script:Config.projects.($vm.Path).flags = $vm.Flags
        }
        else {
            $entry = [pscustomobject]@{ lastUsed = $null; flags = $vm.Flags }
            $script:Config.projects | Add-Member -NotePropertyName $vm.Path -NotePropertyValue $entry
        }
        Save-LauncherConfig -Config $script:Config
    })

    # --- Row New/Continue buttons (routed event from the DataTemplate) ---
    function Start-ProjectSession {
        param($ViewModel, [bool]$ContinueSession)
        $spec = Build-LaunchCommand -ProjectName $ViewModel.Name -ProjectPath $ViewModel.Path `
            -Flags $ViewModel.Flags -Continue:$ContinueSession
        try {
            Invoke-ProjectLaunch -LaunchSpec $spec
        }
        catch {
            [System.Windows.MessageBox]::Show("Launch failed: $($_.Exception.Message)",
                'Dev-Projects', 'OK', 'Error') | Out-Null
            return
        }
        Update-ProjectUsage -Config $script:Config -ProjectPath $ViewModel.Path -Flags $ViewModel.Flags
        $script:Projects = @(Get-Projects -Config $script:Config)
        Update-ProjectList
    }

    $clickHandler = [System.Windows.RoutedEventHandler]{
        param($s, $e)
        $btn = $e.OriginalSource
        if ($btn -isnot [System.Windows.Controls.Button]) { return }
        if ($null -eq $btn.Tag) { return }
        $vm = $btn.Tag
        if ($btn.Content -eq 'New') {
            Start-ProjectSession -ViewModel $vm -ContinueSession $false
        }
        elseif ($btn.Content -eq 'Continue') {
            Start-ProjectSession -ViewModel $vm -ContinueSession $true
        }
        $e.Handled = $true
    }
    $controls.ProjectList.AddHandler([System.Windows.Controls.Button]::ClickEvent, $clickHandler)
```

- [ ] **Step 3: Verify launches manually**

Run: `pwsh -NoProfile -File launcher.ps1`
Expected:
- Selecting a row enables the flags box and shows its saved flags.
- Clicking **New** on a project opens a Windows Terminal tab in that folder running `claude`.
- Clicking **Continue** opens a tab running `claude --continue`.
- Type `--model opus` into flags for a project, launch it: the tab runs `claude --model opus`. Close hub, reopen — flags still there, project moved to top (lastUsed sort).

- [ ] **Step 4: Commit**

```powershell
git add launcher.ps1
git commit -m "feat: launch buttons, flags persistence, claude PATH banner"
```

---

### Task 10: New Project dialog

**Files:**
- Modify: `launcher.ps1` (insert before `Invoke-Rescan`)

- [ ] **Step 1: Add dialog XAML and show-function**

```powershell
    # --- New Project dialog ---
    $script:NewProjectXaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="New Project" Height="220" Width="420" WindowStartupLocation="CenterOwner"
        ResizeMode="NoResize" FontSize="13">
  <StackPanel Margin="12">
    <TextBlock Text="Project name:"/>
    <TextBox x:Name="NameBox" Margin="0,4,0,10" Padding="4"/>
    <TextBlock Text="Create in:"/>
    <ComboBox x:Name="RootCombo" Margin="0,4,0,10"/>
    <CheckBox x:Name="LaunchCheck" Content="Launch Claude after creation" IsChecked="True"
              Margin="0,0,0,12"/>
    <StackPanel Orientation="Horizontal" HorizontalAlignment="Right">
      <Button x:Name="OkButton" Content="Create" Width="80" Margin="0,0,8,0" IsDefault="True"/>
      <Button x:Name="CancelButton" Content="Cancel" Width="80" IsCancel="True"/>
    </StackPanel>
  </StackPanel>
</Window>
'@

    function Show-NewProjectDialog {
        [xml]$dlgXaml = $script:NewProjectXaml
        $dlg = [System.Windows.Markup.XamlReader]::Load(
            (New-Object System.Xml.XmlNodeReader $dlgXaml))
        $dlg.Owner = $window
        $nameBox = $dlg.FindName('NameBox')
        $rootCombo = $dlg.FindName('RootCombo')
        $launchCheck = $dlg.FindName('LaunchCheck')
        $okButton = $dlg.FindName('OkButton')

        $existingRoots = @($script:Config.roots | Where-Object { Test-Path $_ })
        $rootCombo.ItemsSource = $existingRoots
        # Preselect the sidebar root, else defaultRoot.
        $preselect = $script:SelectedRoot
        if (-not $preselect) { $preselect = $script:Config.defaultRoot }
        if ($existingRoots -contains $preselect) {
            $rootCombo.SelectedItem = $preselect
        }
        elseif ($existingRoots.Count -gt 0) {
            $rootCombo.SelectedIndex = 0
        }

        $okButton.Add_Click({
            $name = $nameBox.Text.Trim()
            $root = $rootCombo.SelectedItem
            if ($null -eq $root) {
                [System.Windows.MessageBox]::Show('No destination root available.',
                    'New Project', 'OK', 'Warning') | Out-Null
                return
            }
            $error_ = Get-ProjectNameError -Name $name -Root $root
            if ($error_) {
                [System.Windows.MessageBox]::Show($error_, 'New Project', 'OK', 'Warning') | Out-Null
                return
            }
            try {
                $newPath = New-ProjectFolder -Root $root -Name $name
            }
            catch {
                [System.Windows.MessageBox]::Show("Could not create folder: $($_.Exception.Message)",
                    'New Project', 'OK', 'Error') | Out-Null
                return
            }
            $dlg.Tag = [pscustomobject]@{ Path = $newPath; Name = $name
                                          Launch = [bool]$launchCheck.IsChecked }
            $dlg.DialogResult = $true
        })

        $result = $dlg.ShowDialog()
        if ($result -and $dlg.Tag) {
            Invoke-Rescan
            if ($dlg.Tag.Launch) {
                $spec = Build-LaunchCommand -ProjectName $dlg.Tag.Name -ProjectPath $dlg.Tag.Path
                try {
                    Invoke-ProjectLaunch -LaunchSpec $spec
                    Update-ProjectUsage -Config $script:Config -ProjectPath $dlg.Tag.Path
                    $script:Projects = @(Get-Projects -Config $script:Config)
                    Update-ProjectList
                }
                catch {
                    [System.Windows.MessageBox]::Show("Launch failed: $($_.Exception.Message)",
                        'Dev-Projects', 'OK', 'Error') | Out-Null
                }
            }
        }
    }

    $controls.NewProjectButton.Add_Click({ Show-NewProjectDialog })
```

- [ ] **Step 2: Verify manually**

Run: `pwsh -NoProfile -File launcher.ps1`
Expected:
- "+ New Project" opens dialog; root dropdown preselects current sidebar root (or default).
- Empty name / `bad*name` / existing name → warning message box, dialog stays open.
- Valid name with checkbox on → folder created, list refreshes, terminal tab opens with fresh `claude`.
- Checkbox off → folder created, no launch.
- Clean up any test folders created.

- [ ] **Step 3: Commit**

```powershell
git add launcher.ps1
git commit -m "feat: new project dialog with validation and optional launch"
```

---

### Task 11: Settings dialog

**Files:**
- Modify: `launcher.ps1` (insert before `Invoke-Rescan`)

- [ ] **Step 1: Add settings dialog XAML and show-function**

```powershell
    # --- Settings dialog ---
    $script:SettingsXaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Settings" Height="340" Width="480" WindowStartupLocation="CenterOwner"
        ResizeMode="NoResize" FontSize="13">
  <DockPanel Margin="12">
    <StackPanel DockPanel.Dock="Bottom" Orientation="Horizontal" HorizontalAlignment="Right"
                Margin="0,10,0,0">
      <Button x:Name="CloseButton" Content="Close" Width="80" IsDefault="True" IsCancel="True"/>
    </StackPanel>
    <StackPanel DockPanel.Dock="Bottom" Margin="0,10,0,0">
      <TextBlock Text="Default root for new projects:"/>
      <ComboBox x:Name="DefaultCombo" Margin="0,4,0,0"/>
    </StackPanel>
    <StackPanel DockPanel.Dock="Right" Margin="8,0,0,0">
      <Button x:Name="AddButton" Content="Add..." Width="80" Margin="0,0,0,6"/>
      <Button x:Name="RemoveButton" Content="Remove" Width="80"/>
    </StackPanel>
    <DockPanel>
      <TextBlock DockPanel.Dock="Top" Text="Source roots:"/>
      <ListBox x:Name="RootsList" Margin="0,4,0,0"/>
    </DockPanel>
  </DockPanel>
</Window>
'@

    function Show-SettingsDialog {
        [xml]$dlgXaml = $script:SettingsXaml
        $dlg = [System.Windows.Markup.XamlReader]::Load(
            (New-Object System.Xml.XmlNodeReader $dlgXaml))
        $dlg.Owner = $window
        $rootsList = $dlg.FindName('RootsList')
        $defaultCombo = $dlg.FindName('DefaultCombo')
        $addButton = $dlg.FindName('AddButton')
        $removeButton = $dlg.FindName('RemoveButton')

        function Update-SettingsLists {
            $rootsList.ItemsSource = @($script:Config.roots)
            $defaultCombo.ItemsSource = @($script:Config.roots)
            $defaultCombo.SelectedItem = $script:Config.defaultRoot
        }
        Update-SettingsLists

        $addButton.Add_Click({
            # WinForms folder picker (works from WPF; OK on both PS hosts).
            Add-Type -AssemblyName System.Windows.Forms
            $picker = New-Object System.Windows.Forms.FolderBrowserDialog
            $picker.Description = 'Choose a folder containing projects'
            if ($picker.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
                $newRoot = $picker.SelectedPath
                if ($script:Config.roots -notcontains $newRoot) {
                    $script:Config.roots = @($script:Config.roots) + $newRoot
                    Save-LauncherConfig -Config $script:Config
                    Update-SettingsLists
                }
            }
        })

        $removeButton.Add_Click({
            $sel = $rootsList.SelectedItem
            if ($null -eq $sel) { return }
            $script:Config.roots = @($script:Config.roots | Where-Object { $_ -ne $sel })
            if ($script:Config.defaultRoot -eq $sel) {
                if (@($script:Config.roots).Count -gt 0) {
                    $script:Config.defaultRoot = $script:Config.roots[0]
                }
                else {
                    $script:Config.defaultRoot = ''
                }
            }
            Save-LauncherConfig -Config $script:Config
            Update-SettingsLists
        })

        $defaultCombo.Add_SelectionChanged({
            $sel = $defaultCombo.SelectedItem
            if ($null -ne $sel) {
                $script:Config.defaultRoot = $sel
                Save-LauncherConfig -Config $script:Config
            }
        })

        $dlg.ShowDialog() | Out-Null
        Invoke-Rescan
    }

    $controls.SettingsButton.Add_Click({ Show-SettingsDialog })
```

- [ ] **Step 2: Verify manually**

Run: `pwsh -NoProfile -File launcher.ps1`
Expected:
- Settings opens; roots listed; default root shown.
- Add → folder picker → new root appears in sidebar after closing settings.
- Remove a root → it disappears from sidebar; its projects gone from All.
- Changing default root persists (check `%APPDATA%\Dev-Projects\config.json`).
- Restore your real roots before finishing.

- [ ] **Step 3: Commit**

```powershell
git add launcher.ps1
git commit -m "feat: settings dialog for roots and default root"
```

---

### Task 12: 5.1 compatibility check, shortcut, full smoke test

**Files:**
- Modify: none (verification) + optional shortcut creation

- [ ] **Step 1: Run full test suite under pwsh**

Run: `pwsh -NoProfile -Command "Invoke-Pester -Path tests -Output Detailed"`
Expected: all PASS.

- [ ] **Step 2: Syntax-check both scripts under Windows PowerShell 5.1**

Run:
```powershell
powershell -NoProfile -Command "`$e=`$null; [System.Management.Automation.Language.Parser]::ParseFile('C:\Dev\Active\Claude Cli Management\functions.ps1',[ref]`$null,[ref]`$e) | Out-Null; `$e.Count"
powershell -NoProfile -Command "`$e=`$null; [System.Management.Automation.Language.Parser]::ParseFile('C:\Dev\Active\Claude Cli Management\launcher.ps1',[ref]`$null,[ref]`$e) | Out-Null; `$e.Count"
```
Expected: `0` parse errors for both.

- [ ] **Step 3: Smoke-run the launcher under 5.1**

Run: `powershell -NoProfile -File launcher.ps1`
Expected: window opens and works (list, search, launch one session). This proves the 5.1 fallback path.

- [ ] **Step 4: Smoke-run via the cmd shim**

Run: `.\launcher.cmd` (from the repo root in a terminal)
Expected: hidden console flash, then the Dev-Projects window appears (via pwsh).

- [ ] **Step 5: Create a desktop shortcut**

```powershell
$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut("$env:USERPROFILE\Desktop\Dev-Projects.lnk")
$sc.TargetPath = 'C:\Dev\Active\Claude Cli Management\launcher.cmd'
$sc.WorkingDirectory = 'C:\Dev\Active\Claude Cli Management'
$sc.Save()
```
Expected: double-clicking the desktop shortcut opens the hub.

- [ ] **Step 6: Full manual smoke test (spec acceptance)**

- Open hub via shortcut. Sidebar shows All + 5 roots with counts.
- Search narrows list; root click filters.
- New on a project → wt tab, correct folder, claude running.
- Continue on a recently used project → `claude --continue` resumes.
- Set flags on one project, relaunch, confirm flags applied and persisted.
- Create project in Scratch with launch checkbox on → folder + session.
- Settings: add a temp root, see it appear; remove it; restore.
- Second launch of the shortcut while open → "already running" message.

- [ ] **Step 7: Final commit**

```powershell
git add -A
git commit -m "chore: complete Dev-Projects launcher v1"
```

---

## Spec deviations (agreed)

- Single-instance behavior: second instance shows an info message and exits instead of activating the existing window (window activation via Win32 APIs is not worth the complexity for a personal tool).
- Flags edits persist on change without bumping `lastUsed`; `lastUsed` only updates on launch.
- Mutex is session-local (`DevProjectsLauncher`), not `Global\` — cross-session scope is unnecessary for a single interactive user.
