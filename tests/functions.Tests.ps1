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
