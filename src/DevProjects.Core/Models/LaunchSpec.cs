namespace DevProjects.Core.Models;

/// <summary>A fully-built process start specification for launching a session.</summary>
public sealed record LaunchSpec(
    string FilePath,
    string Arguments,
    string? WorkingDirectory);
