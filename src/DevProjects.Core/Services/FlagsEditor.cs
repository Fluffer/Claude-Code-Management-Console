using System.Text.RegularExpressions;

namespace DevProjects.Core.Services;

/// <summary>Surgical edits to a flags string for the per-row pickers. Pure.</summary>
public static partial class FlagsEditor
{
    [GeneratedRegex(@"--model\s+\S+")]
    private static partial Regex ModelFlag();

    /// <summary>Replace (or remove, when model is null/blank) the --model token. Order: existing flags then model.</summary>
    public static string SetModel(string flags, string? model)
    {
        var without = ModelFlag().Replace(flags ?? "", "").Trim();
        without = Regex.Replace(without, @"\s+", " ").Trim();
        if (string.IsNullOrWhiteSpace(model)) return without;
        return string.IsNullOrEmpty(without) ? $"--model {model}" : $"{without} --model {model}";
    }

    public static string? CurrentModel(string? flags)
    {
        var m = ModelFlag().Match(flags ?? "");
        return m.Success ? m.Value.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries)[1] : null;
    }
}
