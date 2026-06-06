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

    It 'backfills everything when the config file is an empty JSON object' {
        $path = Join-Path $TestDrive 'empty\config.json'
        New-Item -ItemType Directory -Path (Split-Path $path -Parent) -Force | Out-Null
        Set-Content -Path $path -Value '{}'
        $config = Get-LauncherConfig -Path $path
        $config.defaultRoot | Should -Be 'C:\Dev\Active'
        @($config.roots).Count | Should -Be 5
    }

    It 'writes config without a UTF-8 BOM' {
        $path = Join-Path $TestDrive 'bom\config.json'
        Get-LauncherConfig -Path $path | Out-Null
        $bytes = [System.IO.File]::ReadAllBytes($path)
        ($bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB) | Should -BeFalse
    }
}

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
        $p1.LastUsed.Kind | Should -Be ([System.DateTimeKind]::Utc)
        $p1.LastUsed | Should -Be ([datetime]::Parse('2026-06-01T10:00:00.0000000Z', $null, [System.Globalization.DateTimeStyles]::RoundtripKind))
        ($projects | Where-Object { $_.Name -eq 'Proj2' }).LastUsed | Should -BeNullOrEmpty
    }

    It 'tolerates an empty project entry object' {
        $projPath = Join-Path $rootA 'Proj2'
        $config.projects | Add-Member -NotePropertyName $projPath -NotePropertyValue ([pscustomobject]@{})
        $projects = @(Get-Projects -Config $config)
        $p2 = $projects | Where-Object { $_.Path -eq $projPath }
        $p2.Flags | Should -Be ''
        $p2.LastUsed | Should -BeNullOrEmpty
    }
}
