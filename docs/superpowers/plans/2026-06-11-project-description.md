# Project Description in List and Search — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show an auto-extracted one-line description (from README.md, fallback CLAUDE.md) under each project name in the list, and make the search box match it.

**Architecture:** A static `ProjectDescription` service in Ccmc.Core extracts the first meaningful markdown line with an mtime cache. `ProjectScanner` fills a new `Description` property on the `ProjectInfo` record at scan time, so both the filter and the row ViewModel see the same value. A small `ProjectSearch.Matches` helper keeps the name-or-description matching testable in Core; `MainViewModel.ApplyFilter` calls it. The XAML item template gains a subtitle `TextBlock`.

**Tech Stack:** .NET 10, WinUI 3, CommunityToolkit.Mvvm, xUnit (tests in `tests-net/Ccmc.Core.Tests`).

**Spec:** `docs/superpowers/specs/2026-06-11-project-description-design.md`

**Conventions:** Core services are static classes without a "Service" suffix (`ProjectScanner`, `ProjectClaudeInfo`, `ProjectFilter`) — this plan follows that, so the spec's "ProjectDescriptionService" is implemented as static class `ProjectDescription`.

---

### Task 1: ProjectDescription extraction service

**Files:**
- Create: `src/Ccmc.Core/Services/ProjectDescription.cs`
- Test: `tests-net/Ccmc.Core.Tests/ProjectDescriptionTests.cs`

- [ ] **Step 1: Write the failing tests**

Create `tests-net/Ccmc.Core.Tests/ProjectDescriptionTests.cs`:

```csharp
using Ccmc.Core.Services;

namespace Ccmc.Core.Tests;

public class ProjectDescriptionTests : IDisposable
{
    private readonly string _proj = Directory.CreateTempSubdirectory("devprojects-desc-").FullName;
    public void Dispose() => Directory.Delete(_proj, recursive: true);

    private void WriteReadme(string content) =>
        File.WriteAllText(Path.Combine(_proj, "README.md"), content);
    private void WriteClaudeMd(string content) =>
        File.WriteAllText(Path.Combine(_proj, "CLAUDE.md"), content);

    [Fact]
    public void HeadingThenParagraph_ReturnsParagraph()
    {
        WriteReadme("# MyApi\n\nREST backend for invoice processing.\n\nMore text.");
        Assert.Equal("REST backend for invoice processing.", ProjectDescription.Get(_proj));
    }

    [Fact]
    public void BadgesAndImagesSkipped()
    {
        WriteReadme("# Tool\n\n[![CI](https://x/badge.svg)](https://x)\n![logo](logo.png)\n\nDoes useful things.");
        Assert.Equal("Does useful things.", ProjectDescription.Get(_proj));
    }

    [Fact]
    public void HeadingsOnlyReadme_FallsBackToClaudeMd()
    {
        WriteReadme("# Title\n## Subtitle\n");
        WriteClaudeMd("Guidance for the agent project.");
        Assert.Equal("Guidance for the agent project.", ProjectDescription.Get(_proj));
    }

    [Fact]
    public void NoReadme_UsesClaudeMd()
    {
        WriteClaudeMd("# Project\nCLI launcher for sessions.");
        Assert.Equal("CLI launcher for sessions.", ProjectDescription.Get(_proj));
    }

    [Fact]
    public void NoFiles_ReturnsEmpty()
    {
        Assert.Equal("", ProjectDescription.Get(_proj));
    }

    [Fact]
    public void EmptyAndWhitespaceFiles_ReturnEmpty()
    {
        WriteReadme("   \n\n  \t\n");
        WriteClaudeMd("");
        Assert.Equal("", ProjectDescription.Get(_proj));
    }

    [Fact]
    public void CodeFenceContentSkipped()
    {
        WriteReadme("# X\n```bash\ninstall me\n```\nActual description here.");
        Assert.Equal("Actual description here.", ProjectDescription.Get(_proj));
    }

    [Fact]
    public void YamlFrontmatterSkipped()
    {
        WriteReadme("---\ntitle: foo\ntags: [a, b]\n---\nDescription after frontmatter.");
        Assert.Equal("Description after frontmatter.", ProjectDescription.Get(_proj));
    }

    [Fact]
    public void InlineMarkdownStripped()
    {
        WriteReadme("A **bold** tool with a [link](https://x.example) and `code`.");
        Assert.Equal("A bold tool with a link and code.", ProjectDescription.Get(_proj));
    }

    [Fact]
    public void HtmlBlockquoteAndHrSkipped()
    {
        WriteReadme("<p align=\"center\">x</p>\n> quoted\n---\nReal text.");
        Assert.Equal("Real text.", ProjectDescription.Get(_proj));
    }

    [Fact]
    public void LongLine_CappedAt200WithEllipsis()
    {
        WriteReadme(new string('a', 300));
        var desc = ProjectDescription.Get(_proj);
        Assert.Equal(201, desc.Length); // 200 chars + ellipsis
        Assert.EndsWith("…", desc);
    }

    [Fact]
    public void Cache_InvalidatedWhenFileChanges()
    {
        var readme = Path.Combine(_proj, "README.md");
        WriteReadme("First description.");
        File.SetLastWriteTimeUtc(readme, new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc));
        Assert.Equal("First description.", ProjectDescription.Get(_proj));

        WriteReadme("Second description.");
        File.SetLastWriteTimeUtc(readme, new DateTime(2026, 1, 2, 0, 0, 0, DateTimeKind.Utc));
        Assert.Equal("Second description.", ProjectDescription.Get(_proj));
    }

    [Fact]
    public void Cache_ReturnsSameValueWhenUnchanged()
    {
        WriteReadme("Stable description.");
        Assert.Equal("Stable description.", ProjectDescription.Get(_proj));
        Assert.Equal("Stable description.", ProjectDescription.Get(_proj));
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test tests-net/Ccmc.Core.Tests/Ccmc.Core.Tests.csproj --filter ProjectDescriptionTests`
Expected: build FAILS with `CS0103: The name 'ProjectDescription' does not exist`

- [ ] **Step 3: Implement the service**

Create `src/Ccmc.Core/Services/ProjectDescription.cs`:

```csharp
using System.Collections.Concurrent;
using System.Text;
using System.Text.RegularExpressions;

namespace Ccmc.Core.Services;

/// <summary>
/// Extracts a one-line project description from README.md (preferred) or CLAUDE.md:
/// the first meaningful markdown line, with headings, badges, fences, frontmatter,
/// HTML and blockquotes skipped. Results are cached per file by last-write time,
/// so rescans only re-read files that changed. Never throws — any IO problem
/// just means "no description".
/// </summary>
public static class ProjectDescription
{
    private const int MaxReadBytes = 4096;
    private const int MaxLength = 200;

    private static readonly ConcurrentDictionary<string, (DateTime MTimeUtc, string? Desc)> Cache =
        new(StringComparer.OrdinalIgnoreCase);

    private static readonly Regex MdLink = new(@"\[([^\]]*)\]\([^)]*\)", RegexOptions.Compiled);

    public static string Get(string projectPath)
    {
        foreach (var candidate in (string[])["README.md", "CLAUDE.md"])
        {
            var desc = FromFile(Path.Combine(projectPath, candidate));
            if (!string.IsNullOrEmpty(desc)) return desc;
        }
        return "";
    }

    private static string? FromFile(string filePath)
    {
        try
        {
            var fi = new FileInfo(filePath);
            if (!fi.Exists) return null;
            if (Cache.TryGetValue(filePath, out var hit) && hit.MTimeUtc == fi.LastWriteTimeUtc)
                return hit.Desc;

            var desc = Extract(ReadHead(filePath));
            Cache[filePath] = (fi.LastWriteTimeUtc, desc);
            return desc;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            return null;
        }
    }

    private static string ReadHead(string filePath)
    {
        using var stream = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
        var buffer = new byte[MaxReadBytes];
        var read = stream.Read(buffer, 0, buffer.Length);
        return Encoding.UTF8.GetString(buffer, 0, read);
    }

    private static string? Extract(string markdown)
    {
        var lines = markdown.Split('\n');
        var inFence = false;
        var inFrontmatter = false;
        var seenContent = false;

        foreach (var raw in lines)
        {
            var line = raw.TrimEnd('\r').Trim();

            // YAML frontmatter: a "---" before any content opens it, the next "---" closes it.
            if (line == "---" && !seenContent && !inFrontmatter) { inFrontmatter = true; continue; }
            if (inFrontmatter) { if (line == "---") inFrontmatter = false; continue; }

            if (line.StartsWith("```")) { inFence = !inFence; seenContent = true; continue; }
            if (inFence) continue;
            if (line.Length == 0) continue;

            seenContent = true;
            if (line.StartsWith('#')) continue;
            if (line.StartsWith("![") || line.StartsWith("[![")) continue;
            if (line.StartsWith('<')) continue;
            if (line.StartsWith('>')) continue;
            if (line is "---" or "***" or "___") continue;

            var text = StripInline(line);
            if (text.Length == 0) continue;
            return text.Length <= MaxLength ? text : text[..MaxLength].TrimEnd() + "…";
        }
        return null;
    }

    private static string StripInline(string line)
    {
        var s = MdLink.Replace(line, "$1");
        s = s.Replace("**", "").Replace("__", "").Replace("`", "");
        return s.Trim('*', '_', ' ');
    }
}
```

Note: `seenContent` starts false and a leading `---` only counts as frontmatter before any content — a `---` after text is treated as a horizontal rule and skipped.

- [ ] **Step 4: Run tests to verify they pass**

Run: `dotnet test tests-net/Ccmc.Core.Tests/Ccmc.Core.Tests.csproj --filter ProjectDescriptionTests`
Expected: all 13 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/Ccmc.Core/Services/ProjectDescription.cs tests-net/Ccmc.Core.Tests/ProjectDescriptionTests.cs
git commit -m "feat(core): extract project description from README/CLAUDE.md"
```

---

### Task 2: Description on ProjectInfo, filled by ProjectScanner

**Files:**
- Modify: `src/Ccmc.Core/Models/ProjectInfo.cs`
- Modify: `src/Ccmc.Core/Services/ProjectScanner.cs:38`
- Test: `tests-net/Ccmc.Core.Tests/ProjectScannerTests.cs`

- [ ] **Step 1: Write the failing test**

Add to `tests-net/Ccmc.Core.Tests/ProjectScannerTests.cs` (inside the existing test class, matching its temp-root setup pattern — read the file first and reuse however it creates a root with project subfolders):

```csharp
[Fact]
public void Scan_FillsDescriptionFromReadme()
{
    // Arrange: a project folder under a configured root with a README.md.
    // Reuse the class's existing root/config helper; shown here with inline setup:
    var root = Directory.CreateTempSubdirectory("devprojects-scanroot-").FullName;
    try
    {
        var proj = Directory.CreateDirectory(Path.Combine(root, "Alpha")).FullName;
        File.WriteAllText(Path.Combine(proj, "README.md"), "# Alpha\nDoes alpha things.");
        var config = new LauncherConfig { Roots = [root] };

        var result = ProjectScanner.Scan(config);

        var alpha = Assert.Single(result, p => p.Name == "Alpha");
        Assert.Equal("Does alpha things.", alpha.Description);
    }
    finally
    {
        Directory.Delete(root, recursive: true);
    }
}
```

(If `LauncherConfig` initialization differs in the existing tests — e.g. property names or required members — copy their construction style exactly.)

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test tests-net/Ccmc.Core.Tests/Ccmc.Core.Tests.csproj --filter Scan_FillsDescriptionFromReadme`
Expected: build FAILS with `CS1061: 'ProjectInfo' does not contain a definition for 'Description'`

- [ ] **Step 3: Add Description to the record and fill it in the scanner**

`src/Ccmc.Core/Models/ProjectInfo.cs` — replace the record:

```csharp
namespace Ccmc.Core.Models;

/// <summary>A project folder discovered under one of the configured roots.</summary>
public sealed record ProjectInfo(
    string Name,
    string Root,
    string Path,
    DateTime? LastUsedUtc,
    string Flags,
    string Description = "");
```

The default value keeps every existing `new ProjectInfo(...)` call site compiling unchanged.

`src/Ccmc.Core/Services/ProjectScanner.cs` line 38 — replace:

```csharp
projects.Add(new ProjectInfo(dir.Name, root, dir.FullName, lastUsed, flags));
```

with:

```csharp
projects.Add(new ProjectInfo(dir.Name, root, dir.FullName, lastUsed, flags,
    ProjectDescription.Get(dir.FullName)));
```

- [ ] **Step 4: Run the full Core test suite**

Run: `dotnet test tests-net/Ccmc.Core.Tests/Ccmc.Core.Tests.csproj`
Expected: all tests PASS (existing ProjectScannerTests unaffected — Description defaults to "" where no README exists)

- [ ] **Step 5: Commit**

```bash
git add src/Ccmc.Core/Models/ProjectInfo.cs src/Ccmc.Core/Services/ProjectScanner.cs tests-net/Ccmc.Core.Tests/ProjectScannerTests.cs
git commit -m "feat(core): carry description on ProjectInfo via scanner"
```

---

### Task 3: Search matches name OR description

**Files:**
- Create: `src/Ccmc.Core/Services/ProjectSearch.cs`
- Modify: `src/Ccmc.WinUI/ViewModels/MainViewModel.cs:274-275`
- Test: `tests-net/Ccmc.Core.Tests/ProjectSearchTests.cs`

- [ ] **Step 1: Write the failing tests**

Create `tests-net/Ccmc.Core.Tests/ProjectSearchTests.cs`:

```csharp
using Ccmc.Core.Models;
using Ccmc.Core.Services;

namespace Ccmc.Core.Tests;

public class ProjectSearchTests
{
    private static ProjectInfo Make(string name, string description) =>
        new(name, @"C:\Dev", @"C:\Dev\" + name, null, "", description);

    [Fact]
    public void MatchesName_CaseInsensitive() =>
        Assert.True(ProjectSearch.Matches(Make("MyApi", ""), "myapi"));

    [Fact]
    public void MatchesDescription_CaseInsensitive() =>
        Assert.True(ProjectSearch.Matches(Make("MyApi", "REST backend for invoices"), "INVOICE"));

    [Fact]
    public void NoMatch_ReturnsFalse() =>
        Assert.False(ProjectSearch.Matches(Make("MyApi", "REST backend"), "frontend"));

    [Fact]
    public void EmptyDescription_StillMatchesName() =>
        Assert.True(ProjectSearch.Matches(Make("ToolBox", ""), "tool"));
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test tests-net/Ccmc.Core.Tests/Ccmc.Core.Tests.csproj --filter ProjectSearchTests`
Expected: build FAILS with `CS0103: The name 'ProjectSearch' does not exist`

- [ ] **Step 3: Implement helper and wire into ApplyFilter**

Create `src/Ccmc.Core/Services/ProjectSearch.cs`:

```csharp
using Ccmc.Core.Models;

namespace Ccmc.Core.Services;

/// <summary>Search-box matching: case-insensitive substring on name or description.</summary>
public static class ProjectSearch
{
    public static bool Matches(ProjectInfo project, string term) =>
        project.Name.Contains(term, StringComparison.OrdinalIgnoreCase) ||
        project.Description.Contains(term, StringComparison.OrdinalIgnoreCase);
}
```

`src/Ccmc.WinUI/ViewModels/MainViewModel.cs` — in `ApplyFilter()`, replace:

```csharp
        if (!string.IsNullOrWhiteSpace(SearchText))
            filtered = filtered.Where(p => p.Name.Contains(SearchText.Trim(), StringComparison.OrdinalIgnoreCase));
```

with:

```csharp
        if (!string.IsNullOrWhiteSpace(SearchText))
        {
            var term = SearchText.Trim();
            filtered = filtered.Where(p => ProjectSearch.Matches(p, term));
        }
```

(`Ccmc.Core.Services` is already imported in MainViewModel — verify the `using` list at the top of the file; add `using Ccmc.Core.Services;` only if missing.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `dotnet test tests-net/Ccmc.Core.Tests/Ccmc.Core.Tests.csproj --filter ProjectSearchTests`
Expected: all 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/Ccmc.Core/Services/ProjectSearch.cs src/Ccmc.WinUI/ViewModels/MainViewModel.cs tests-net/Ccmc.Core.Tests/ProjectSearchTests.cs
git commit -m "feat(app): search matches project description"
```

---

### Task 4: Subtitle in the list row

**Files:**
- Modify: `src/Ccmc.WinUI/ViewModels/ProjectItemViewModel.cs` (after the `LastUsedText` property, ~line 17)
- Modify: `src/Ccmc.WinUI/MainWindow.xaml:236-300` (item template, column 1)

- [ ] **Step 1: Expose Description on the row ViewModel**

In `src/Ccmc.WinUI/ViewModels/ProjectItemViewModel.cs`, after the `LastUsedText` line, add:

```csharp
    /// <summary>One-line description extracted from README.md/CLAUDE.md; empty when none.</summary>
    public string Description => Info.Description;

    public bool HasDescription => Info.Description.Length > 0;
```

Plain getters (no `[ObservableProperty]`) — the value is fixed at scan time; rescans create new row VMs.

- [ ] **Step 2: Add the subtitle TextBlock to the item template**

In `src/Ccmc.WinUI/MainWindow.xaml`, the `<!-- Name + metadata -->` StackPanel (currently `Grid.Column="1" Orientation="Horizontal"`) becomes a vertical StackPanel containing the existing horizontal row plus the subtitle. Replace the opening tag:

```xml
                                    <!-- Name + metadata -->
                                    <StackPanel Grid.Column="1" Orientation="Horizontal" Spacing="10"
                                                VerticalAlignment="Center">
```

with:

```xml
                                    <!-- Name + metadata -->
                                    <StackPanel Grid.Column="1" Spacing="2" VerticalAlignment="Center">
                                        <StackPanel Orientation="Horizontal" Spacing="10">
```

Then, just before the closing `</StackPanel>` of that panel (after the `LastUsedText` TextBlock at ~line 299), close the inner panel and add the subtitle:

```xml
                                        </StackPanel>
                                        <TextBlock Text="{x:Bind Description}"
                                                   Style="{StaticResource CaptionTextBlockStyle}"
                                                   Foreground="{ThemeResource TextFillColorSecondaryBrush}"
                                                   TextTrimming="CharacterEllipsis" MaxLines="1"
                                                   Visibility="{x:Bind HasDescription}"
                                                   ToolTipService.ToolTip="{x:Bind Description}"/>
                                    </StackPanel>
```

The existing badge/text children move unchanged into the inner horizontal panel (only indentation changes; do not reindent if it creates a noisy diff — XAML does not require it). `x:Bind` converts `bool` to `Visibility` automatically, so `HasDescription` collapses the subtitle for projects without a description and the row stays compact.

- [ ] **Step 3: Build the solution**

Run: `dotnet build Ccmc.sln`
Expected: Build succeeded, 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/Ccmc.WinUI/ViewModels/ProjectItemViewModel.cs src/Ccmc.WinUI/MainWindow.xaml
git commit -m "feat(ui): project description subtitle in list rows"
```

---

### Task 5: Full verification

- [ ] **Step 1: Run the complete Core test suite**

Run: `dotnet test tests-net/Ccmc.Core.Tests/Ccmc.Core.Tests.csproj`
Expected: all tests PASS

- [ ] **Step 2: Build the full solution**

Run: `dotnet build Ccmc.sln`
Expected: Build succeeded, 0 errors

- [ ] **Step 3: Manual smoke check (run the app)**

Launch the app (existing run workflow). Verify:
- Projects with a README/CLAUDE.md show a gray one-line subtitle; hover shows full text.
- Projects without either file show a compact row (no empty gap).
- Typing a word that appears only in a project's README (not its name) into the search box (Ctrl+F) filters the list to that project.
- F5 rescan stays fast.
