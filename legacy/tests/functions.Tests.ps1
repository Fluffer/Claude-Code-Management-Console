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

    It 'doubles a trailing backslash inside a quoted arg' {
        ConvertTo-ArgumentString -Arguments @('-d', 'C:\My Dir\') |
            Should -Be '-d "C:\My Dir\\"'
    }

    It 'handles backslashes preceding an embedded quote' {
        ConvertTo-ArgumentString -Arguments @('say \"hi\"') |
            Should -Be '"say \\\"hi\\\""'
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
