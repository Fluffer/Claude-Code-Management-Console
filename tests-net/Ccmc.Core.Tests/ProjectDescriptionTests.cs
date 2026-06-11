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
