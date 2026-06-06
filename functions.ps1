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
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, ($Config | ConvertTo-Json -Depth 5), $utf8NoBom)
}

function Get-LauncherConfig {
    param([string]$Path = (Get-ConfigPath))

    if (-not (Test-Path $Path)) {
        $config = Get-DefaultConfig
        Save-LauncherConfig -Config $config -Path $Path
        return $config
    }

    try {
        $raw = [System.IO.File]::ReadAllText($Path)
        $config = $raw | ConvertFrom-Json -ErrorAction Stop
    }
    catch {
        if (Test-Path "$Path.bad") { Remove-Item "$Path.bad" -Force }
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

    # Normalize arrays: PS 5.1 ConvertFrom-Json can yield scalars/null for
    # single-element/empty arrays.
    $config.roots = @($config.roots | Where-Object { $null -ne $_ })
    $config.ignore = @($config.ignore | Where-Object { $null -ne $_ })

    return $config
}

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
            # NOTE: spec's `.Properties.Name -contains` throws PropertyNotFoundStrict
            # under Set-StrictMode 2.0 when projects has no properties (verified on
            # PS 5.1 and 7.x); the indexer returns $null safely in both engines.
            if ($null -ne $Config.projects.PSObject.Properties[$dir.FullName]) {
                $saved = $Config.projects.($dir.FullName)
                if ($null -ne $saved.PSObject.Properties['lastUsed']) {
                    if ($saved.lastUsed) {
                        # RoundtripKind keeps Z-suffixed ISO strings as Kind=Utc;
                        # a plain [datetime] cast would shift them to Kind=Local.
                        $lastUsed = [datetime]::Parse($saved.lastUsed, $null, [System.Globalization.DateTimeStyles]::RoundtripKind)
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
    # PowerShell unwraps Nullable[datetime] on bind; after the null guard this is always a plain datetime.
    $ts = $Timestamp
    $span = (Get-Date).ToUniversalTime() - $ts.ToUniversalTime()
    if ($span.TotalMinutes -lt 1) { return 'just now' }
    if ($span.TotalHours -lt 1) { return ('{0}m ago' -f [int][math]::Floor($span.TotalMinutes)) }
    if ($span.TotalDays -lt 1) { return ('{0}h ago' -f [int][math]::Floor($span.TotalHours)) }
    if ($span.TotalDays -lt 7) { return ('{0}d ago' -f [int][math]::Floor($span.TotalDays)) }
    return $ts.ToLocalTime().ToString('yyyy-MM-dd')
}
