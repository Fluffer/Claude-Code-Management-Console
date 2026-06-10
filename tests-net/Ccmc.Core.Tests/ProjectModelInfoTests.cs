using Ccmc.Core.Services;

namespace Ccmc.Core.Tests;

public class ProjectModelInfoTests : IDisposable
{
    private readonly string _proj = Directory.CreateTempSubdirectory("devprojects-model-").FullName;
    private readonly string _userSettings = Path.Combine(
        Directory.CreateTempSubdirectory("devprojects-usermodel-").FullName, "settings.json");

    public void Dispose()
    {
        Directory.Delete(_proj, recursive: true);
        Directory.Delete(Path.GetDirectoryName(_userSettings)!, recursive: true);
    }

    private void WriteProjectSettings(string json)
    {
        var dir = Path.Combine(_proj, ".claude");
        Directory.CreateDirectory(dir);
        File.WriteAllText(Path.Combine(dir, "settings.json"), json);
    }

    [Fact]
    public void ProjectModel_WinsOverUserAndDefault()
    {
        WriteProjectSettings("""{"model":"opus"}""");
        File.WriteAllText(_userSettings, """{"model":"sonnet"}""");
        Assert.Equal("opus", ProjectModelInfo.ResolveDefaultModel(_proj, _userSettings));
    }

    [Fact]
    public void FallsBackToUserSettings_WhenProjectHasNoModel()
    {
        WriteProjectSettings("""{"permissions":{"defaultMode":"auto"}}""");
        File.WriteAllText(_userSettings, """{"model":"haiku"}""");
        Assert.Equal("haiku", ProjectModelInfo.ResolveDefaultModel(_proj, _userSettings));
    }

    [Fact]
    public void Null_WhenNoModelConfiguredAnywhere()
    {
        File.WriteAllText(_userSettings, """{"theme":"auto"}""");
        Assert.Null(ProjectModelInfo.ResolveDefaultModel(_proj, _userSettings));
    }

    [Fact]
    public void Null_WhenNothingExists() =>
        Assert.Null(ProjectModelInfo.ResolveDefaultModel(_proj, _userSettings));

    [Fact]
    public void NeverThrows_OnGarbageJson()
    {
        WriteProjectSettings("not json at all");
        File.WriteAllText(_userSettings, """{"model":"sonnet"}""");
        // Project file is garbage → ignored, falls through to user settings.
        Assert.Equal("sonnet", ProjectModelInfo.ResolveDefaultModel(_proj, _userSettings));
    }

    [Fact]
    public void Null_WhenModelIsBlank()
    {
        WriteProjectSettings("""{"model":"   "}""");
        Assert.Null(ProjectModelInfo.ResolveDefaultModel(_proj, _userSettings));
    }
}
