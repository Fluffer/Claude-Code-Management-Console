namespace Ccmc.Core.Models;

/// <summary>A project folder discovered under one of the configured roots.</summary>
public sealed record ProjectInfo(
    string Name,
    string Root,
    string Path,
    DateTime? LastUsedUtc,
    string Flags,
    string Description = "");
