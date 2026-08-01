# Lints the repo's PowerShell scripts with PSScriptAnalyzer, using the shared
# rule config at the repo root. ESLint only covers electron/src and electron/tests,
# so without this the .ps1 files are the one part of the codebase nothing checks.
# Run with: npm run lint:ps
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

if (-not (Get-Module -ListAvailable -Name PSScriptAnalyzer)) {
    Write-Host 'PSScriptAnalyzer is not installed. Install it with:'
    Write-Host '  Install-Module PSScriptAnalyzer -Scope CurrentUser'
    exit 2
}
Import-Module PSScriptAnalyzer

$repo     = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$settings = Join-Path $repo 'PSScriptAnalyzerSettings.psd1'

# Explicit list, not a recursive scan: build output under electron/dist and
# electron/out contains copies of these same scripts, and linting a generated
# artifact just double-reports every finding.
$targets = @(
    Join-Path $repo 'tools\terminal-auto-approver\Approver.ps1'
    Join-Path $repo 'electron\scripts\gen-appx-assets.ps1'
    Join-Path $repo 'electron\scripts\lint-ps.ps1'
)

$findings = foreach ($t in $targets) {
    if (-not (Test-Path -LiteralPath $t)) {
        Write-Host "missing: $t"
        continue
    }
    Invoke-ScriptAnalyzer -Path $t -Settings $settings
}

if ($findings) {
    $findings | Format-Table Severity, RuleName, Line, ScriptName, Message -AutoSize -Wrap
    # Warnings fail the run too: the excluded-by-design rules already live in
    # PSScriptAnalyzerSettings.psd1, so anything still reported is worth fixing.
    Write-Host ("{0} problem(s) across {1} file(s)" -f @($findings).Count, $targets.Count)
    exit 1
}

Write-Host ("PSScriptAnalyzer clean ({0} files)" -f $targets.Count)
exit 0
