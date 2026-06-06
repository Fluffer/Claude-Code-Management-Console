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
        $reloaded = Get-LauncherConfig -Path $path
        $reloaded.defaultRoot | Should -Be 'C:\Dev\Scratch'
        @($reloaded.roots).Count | Should -Be 5
        # Pester's BeNull treats empty arrays as null, so do an explicit
        # scalar null comparison ($null on the left avoids array filtering).
        ($null -eq $reloaded.ignore) | Should -BeFalse
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
        @($config.roots).Count | Should -Be 1
        $config.roots[0] | Should -Be 'C:\Dev\Active'
    }

    It 'writes config without a UTF-8 BOM' {
        $path = Join-Path $TestDrive 'bom\config.json'
        Get-LauncherConfig -Path $path | Out-Null
        $bytes = [System.IO.File]::ReadAllBytes($path)
        ($bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB) | Should -BeFalse
    }
}
