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

    if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
        $controls.WarningText.Text = "'claude' was not found on PATH. Launches will open a terminal but the command will fail."
        $controls.WarningBanner.Visibility = 'Visible'
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
        $newVm = @($controls.ProjectList.ItemsSource) | Where-Object { $_.Path -eq $ViewModel.Path } | Select-Object -First 1
        if ($null -ne $newVm) { $controls.ProjectList.SelectedItem = $newVm }
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
                # Reuse Start-ProjectSession: handles launch, error message box,
                # usage stamping, list refresh and re-selection consistently.
                $vm = [pscustomobject]@{ Name = $dlg.Tag.Name; Path = $dlg.Tag.Path; Flags = '' }
                Start-ProjectSession -ViewModel $vm -ContinueSession $false
            }
        }
    }

    $controls.NewProjectButton.Add_Click({ Show-NewProjectDialog })

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

    Invoke-Rescan

    $window.ShowDialog() | Out-Null
}
finally {
    $script:Mutex.ReleaseMutex()
    $script:Mutex.Dispose()
}
