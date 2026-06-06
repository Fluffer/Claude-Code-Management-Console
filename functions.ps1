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
        if (-not ($config.PSObject.Properties.Name -contains $prop)) {
            $config | Add-Member -NotePropertyName $prop -NotePropertyValue $defaults.$prop
        }
    }
    return $config
}
