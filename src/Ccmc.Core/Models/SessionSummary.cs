namespace Ccmc.Core.Models;

/// <summary>A resumable Claude session: its id (file stem), last write, and first user line.</summary>
public sealed record SessionSummary(string SessionId, DateTime LastWriteUtc, string FirstUserMessage);
