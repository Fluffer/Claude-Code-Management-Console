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

    $window.ShowDialog() | Out-Null
}
finally {
    $script:Mutex.ReleaseMutex()
    $script:Mutex.Dispose()
}
