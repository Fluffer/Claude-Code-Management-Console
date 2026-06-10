using System.ComponentModel;

namespace Ccmc.Core.Models;

/// <summary>
/// A named, reusable project filter. Each condition is opt-in (null/false = "don't care").
/// All set conditions are ANDed. Stored on AppState; surfaced as a sidebar entry.
/// </summary>
public sealed class SavedFilter : INotifyPropertyChanged
{
    private string _name = "";

    /// <summary>
    /// Observable so the bound list label refreshes as the user types in the filter
    /// manager — without replacing the item in its bound collection (which stole
    /// focus from the editing TextBox and could spin the ListView's layout).
    /// </summary>
    public string Name
    {
        get => _name;
        set
        {
            if (_name == value) return;
            _name = value;
            PropertyChanged?.Invoke(this, NameChangedArgs);
        }
    }

    public string? PathContains { get; set; }
    public bool RequireGit { get; set; }
    public bool RequireClaudeMd { get; set; }
    public bool RequireRunning { get; set; }
    public bool RequirePinned { get; set; }

    public event PropertyChangedEventHandler? PropertyChanged;

    private static readonly PropertyChangedEventArgs NameChangedArgs = new(nameof(Name));
}
