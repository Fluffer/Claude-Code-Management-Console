using Ccmc.Core.Services;

namespace Ccmc.Core.Tests;

public class SettingsJsonValidatorTests : IDisposable
{
    private readonly string _proj = Directory.CreateTempSubdirectory("devprojects-settings-").FullName;
    public void Dispose() => Directory.Delete(_proj, recursive: true);

    private string Settings()
    {
        var dir = Path.Combine(_proj, ".claude");
        Directory.CreateDirectory(dir);
        return Path.Combine(dir, "settings.json");
    }

    [Fact]
    public void Validate_AbsentFile_IsValidWithNoError()
    {
        var r = SettingsJsonValidator.Validate(_proj);
        Assert.True(r.IsValid);
        Assert.Null(r.Error);
        Assert.Null(r.SettingsPath); // nothing to open
    }

    [Fact]
    public void Validate_WellFormedJson_IsValid()
    {
        File.WriteAllText(Settings(), """{ "model": "opus" }""");
        var r = SettingsJsonValidator.Validate(_proj);
        Assert.True(r.IsValid);
        Assert.Null(r.Error);
        Assert.NotNull(r.SettingsPath);
    }

    [Fact]
    public void Validate_BrokenJson_IsInvalidWithMessageAndPath()
    {
        var path = Settings();
        File.WriteAllText(path, """{ "model": "opus" """); // missing closing brace
        var r = SettingsJsonValidator.Validate(_proj);
        Assert.False(r.IsValid);
        Assert.False(string.IsNullOrWhiteSpace(r.Error));
        Assert.Equal(path, r.SettingsPath);
    }
}
