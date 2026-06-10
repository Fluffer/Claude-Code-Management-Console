using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace Ccmc.Core.Models;

/// <summary>A named set of project paths launched together ("open this stack"). Order is preserved.</summary>
public sealed class LaunchGroup : INotifyPropertyChanged
{
    private string _name = "";

    /// <summary>
    /// Observable so list labels bound to it refresh as the user types in the
    /// group manager. Without this, callers were forced to replace the whole
    /// item in the bound collection to refresh the label — which thrashed the
    /// editing TextBox and could send the ListView into a re-layout spin.
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

    public List<string> ProjectPaths { get; set; } = [];

    public event PropertyChangedEventHandler? PropertyChanged;

    private static readonly PropertyChangedEventArgs NameChangedArgs = new(nameof(Name));
}
