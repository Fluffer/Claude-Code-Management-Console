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
