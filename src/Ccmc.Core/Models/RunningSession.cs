namespace Ccmc.Core.Models;

/// <summary>A live claude/node/bun process believed to host a Claude session.</summary>
public sealed record RunningSession(int Pid, string ProcessName, string WorkingDirectory);
