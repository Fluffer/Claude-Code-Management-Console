namespace DevProjects.Core.Models;

/// <summary>A named set of project paths launched together ("open this stack"). Order is preserved.</summary>
public sealed class LaunchGroup
{
    public string Name { get; set; } = "";
    public List<string> ProjectPaths { get; set; } = [];
}
