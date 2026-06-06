using System.Text.Json;
using DevProjects.Core.Models;

namespace DevProjects.Core.Services;

/// <summary>
/// Loads and saves state.json (theme, sort, pins, onboarding). Kept separate
/// from config.json so the original PowerShell schema is never polluted.
/// A corrupt state file is silently replaced with defaults — nothing in it
/// is precious enough to quarantine.
/// </summary>
public sealed class StateService
{
    public string StatePath { get; }

    public StateService(string? statePath = null)
    {
        StatePath = statePath ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "Dev-Projects", "state.json");
    }

    public AppState Load()
    {
        if (!File.Exists(StatePath)) return new AppState();
        try
        {
            return JsonSerializer.Deserialize<AppState>(
                File.ReadAllText(StatePath), ConfigService.JsonOpts) ?? new AppState();
        }
        catch (JsonException)
        {
            return new AppState();
        }
    }

    public void Save(AppState state)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(StatePath)!);
        File.WriteAllText(StatePath, JsonSerializer.Serialize(state, ConfigService.JsonOpts));
    }
}
