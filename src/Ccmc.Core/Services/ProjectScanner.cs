using System.Globalization;
using Ccmc.Core.Models;

namespace Ccmc.Core.Services;

/// <summary>Enumerates direct subfolders of each configured root.</summary>
public static class ProjectScanner
{
    public static IReadOnlyList<ProjectInfo> Scan(LauncherConfig config)
    {
        var projects = new List<ProjectInfo>();
        foreach (var root in config.Roots ?? [])
        {
            if (!Directory.Exists(root)) continue;
            foreach (var dir in new DirectoryInfo(root).EnumerateDirectories())
            {
                if (dir.Name.StartsWith('.')) continue;
                if ((dir.Attributes & FileAttributes.Hidden) != 0) continue;
                if (config.Ignore is not null &&
                    config.Ignore.Contains(dir.Name, StringComparer.OrdinalIgnoreCase)) continue;
                if (config.Hidden is not null &&
                    config.Hidden.Contains(dir.FullName, StringComparer.OrdinalIgnoreCase)) continue;

                DateTime? lastUsed = null;
                var flags = "";
                if (config.Projects is not null &&
                    config.Projects.TryGetValue(dir.FullName, out var usage))
                {
                    // RoundtripKind keeps Z-suffixed ISO strings as UTC instead of
                    // shifting them to local time (parity with the PS launcher).
                    if (!string.IsNullOrEmpty(usage.LastUsed) &&
                        DateTime.TryParse(usage.LastUsed, CultureInfo.InvariantCulture,
                            DateTimeStyles.RoundtripKind, out var parsed))
                    {
                        lastUsed = parsed.ToUniversalTime();
                    }
                    flags = usage.Flags ?? "";
                }

                projects.Add(new ProjectInfo(dir.Name, root, dir.FullName, lastUsed, flags,
                    ProjectDescription.Get(dir.FullName)));
            }
        }
        return projects;
    }
}
