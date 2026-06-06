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
                if ($saved.PSObject.Properties.Name -contains 'lastUsed') {
                    if ($saved.lastUsed) { $lastUsed = [datetime]$saved.lastUsed }
                }
                if ($saved.PSObject.Properties.Name -contains 'flags') {
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
