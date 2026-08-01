@{
    # PSScriptAnalyzer config for the repo's PowerShell scripts:
    #   tools/terminal-auto-approver/Approver.ps1
    #   electron/scripts/gen-appx-assets.ps1
    # Run with: npm run lint:ps  (from electron/)
    IncludeDefaultRules = $true

    ExcludeRules        = @(
        # Both scripts are operator-facing console tools whose whole job is to
        # print progress to whoever is watching. Write-Output would pollute the
        # pipeline and Write-Information is invisible by default, so Write-Host
        # is the correct call here rather than a smell.
        'PSAvoidUsingWriteHost',

        # False positive: PSScriptAnalyzer's built-in cmdlet manifest for
        # core-6.1.0-windows lists Write-Log, but no such cmdlet ships in
        # PowerShell 7 (verified on 7.6.4 — Get-Command Write-Log finds nothing).
        # Approver.ps1's local Write-Log shadows nothing.
        'PSAvoidOverwritingBuiltInCmdlets'
    )
}
